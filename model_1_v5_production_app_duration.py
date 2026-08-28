# -*- coding: utf-8 -*-
"""
model_1_v5_production.py
============================================================
正式 Model 1：HMM + MTA + LSTM
============================================================

設計原則
1. App 正式執行只跑這一支。
2. HMM causal core 直接呼叫已驗證的 V4 strict-rolling 實驗核心，
   不另外複製/改寫 HMM 演算法。
3. 現在資料來源使用 CSV。
4. 未來 TEJ API 只替換 load_input_data() 的資料取得層，
   不修改 HMM / MTA / LSTM 模型核心。
5. 正式輸出固定：
       model_1_prediction_output.csv
   給 Model 2 直接讀取。

Production configuration
- Train: 60 months
- Validation: 12 months
- Sequence length: 3
- Class weight: OFF
- HMM fit: Training only
- HMM inference: causal forward filtering only
- LSTM scaler: Training only
- Validation: EarlyStopping only
- Future actual label: NOT used
"""

import os
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TF_DETERMINISTIC_OPS", "1")

import random
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import tensorflow as tf

from sklearn.preprocessing import LabelEncoder, StandardScaler
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras import backend as K

# IMPORTANT:
# 直接共用已通過正式 V4 實驗的核心，不重寫另一套 HMM。
import hmm_mta_lstm_sliding_window_experiment as base
import hmm_mta_lstm_sliding_window_experiment_v4_strict_rolling as v4


# ============================================================
# Formal production settings
# ============================================================
MODEL_NAME = "HMM_MTA_LSTM"
PIPELINE_VERSION = "V5_FROZEN_STRICT_CAUSAL_T60_CW_OFF"

DATA_SOURCE = os.getenv("MODEL1_DATA_SOURCE", "csv").lower()
CSV_PATH = os.getenv("HISTORY_CSV_PATH", "加權指數2014-2025.csv")
EXP_START_DATE = os.getenv("EXP_START_DATE", "2016-01-01")
HISTORY_PRICE_CSV = os.getenv(
    "MODEL1_HISTORY_PRICE_CSV",
    "20140101-20251231加權指數(收盤價).csv",
)

HISTORY_MARKET_CSV = os.getenv(
    "MODEL1_HISTORY_MARKET_CSV",
    "加權指數2014-2025.csv",
)

FUTURE_2026_CSV = os.getenv(
    "MODEL1_2026_CSV",
    "加權指數2026.csv",
)

TEJ_INDEX_CODE = os.getenv(
    "TEJ_INDEX_CODE",
    "Y9999",
)

TRAIN_MONTHS = 60
VAL_MONTHS = 12
SEQ_LEN = 3
# Frozen V5 candidate: class weighting OFF (model.fit receives no class_weight).
N_STATES = 3
SEED = 20042
CLASSES = ["Bear", "Bull", "Sideways"]

OUTPUT_FILE = "model_1_prediction_output.csv"
METADATA_FILE = "model_1_production_metadata.csv"


def set_all_seeds(seed):
    random.seed(seed)
    np.random.seed(seed)
    tf.keras.utils.set_random_seed(seed)
    try:
        tf.config.experimental.enable_op_determinism()
    except Exception:
        pass


def period_range(start, n):
    return [start + i for i in range(n)]


# ============================================================
# Data source layer
# ============================================================
def load_historical_model1_data():
    """
    Model 1 historical raw data:
    2014-01-01 ~ 2024-12-31

    HISTORY_PRICE_CSV:
        年月日、收盤價(元)

    HISTORY_MARKET_CSV:
        年月日、成交量(千股)、成交值(千元)、
        外資買賣超市值(百萬)、融資餘額(千元)、融券餘額(千元)
    """

    print("Loading Model 1 historical CSV data: 2014 ~ 2024")

    # --------------------------------------------------
    # 1. 檢查檔案
    # --------------------------------------------------
    for path in [HISTORY_PRICE_CSV, HISTORY_MARKET_CSV]:
        if not os.path.exists(path):
            raise FileNotFoundError(f"找不到歷史資料檔：{path}")

    # --------------------------------------------------
    # 2. 讀取 CSV
    # --------------------------------------------------
    price = pd.read_csv(HISTORY_PRICE_CSV, encoding="cp950")
    market = pd.read_csv(HISTORY_MARKET_CSV, encoding="cp950")

    # 去除欄位名稱前後空白
    price.columns = price.columns.astype(str).str.strip()
    market.columns = market.columns.astype(str).str.strip()

    # --------------------------------------------------
    # 3. 檢查必要欄位
    # --------------------------------------------------
    price_required = [
        "年月日",
        "收盤價(元)",
    ]

    market_required = [
        "年月日",
        "成交量(千股)",
        "成交值(千元)",
        "外資買賣超市值(百萬)",
        "融資餘額(千元)",
        "融券餘額(千元)",
    ]

    missing_price = [
        c for c in price_required
        if c not in price.columns
    ]

    missing_market = [
        c for c in market_required
        if c not in market.columns
    ]

    if missing_price:
        raise ValueError(
            f"歷史收盤價 CSV 缺少欄位：{missing_price}"
        )

    if missing_market:
        raise ValueError(
            f"歷史市場 CSV 缺少欄位：{missing_market}"
        )

    # --------------------------------------------------
    # 4. 統一日期
    # --------------------------------------------------
    price["date"] = pd.to_datetime(
        price["年月日"],
        errors="coerce",
    )

    market["date"] = pd.to_datetime(
        market["年月日"],
        errors="coerce",
    )

    # --------------------------------------------------
    # 5. 轉成 Model 1 raw schema
    # --------------------------------------------------
    price = price[
        ["date", "收盤價(元)"]
    ].rename(
        columns={
            "收盤價(元)": "close_price",
        }
    )

    market = market[
        [
            "date",
            "成交量(千股)",
            "成交值(千元)",
            "外資買賣超市值(百萬)",
            "融資餘額(千元)",
            "融券餘額(千元)",
        ]
    ].rename(
        columns={
            "成交量(千股)": "volume",
            "成交值(千元)": "turnover_value",
            "外資買賣超市值(百萬)": "foreign_net_buy",
            "融資餘額(千元)": "margin_balance",
            "融券餘額(千元)": "short_balance",
        }
    )

    # --------------------------------------------------
    # 6. 數值轉換
    # --------------------------------------------------
    numeric_cols = [
        "close_price",
        "volume",
        "turnover_value",
        "foreign_net_buy",
        "margin_balance",
        "short_balance",
    ]

    # 先合併
    historical = pd.merge(
        price,
        market,
        on="date",
        how="inner",
        validate="one_to_one",
    )

    for col in numeric_cols:
        historical[col] = pd.to_numeric(
            historical[col]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.strip(),
            errors="coerce",
        )

    # --------------------------------------------------
    # 7. 單位統一
    # --------------------------------------------------
    # 歷史 CSV 的「外資買賣超市值(百萬)」實際值需 / 1000
    # 才與既有 Model 1 raw representation 一致。
    historical["foreign_net_buy"] = (
        historical["foreign_net_buy"] / 1000.0
    )

    # --------------------------------------------------
    # 8. 這個 loader 只負責 2014 ~ 2024
    # --------------------------------------------------
    historical = historical[
        historical["date"] < pd.Timestamp("2025-01-01")
    ].copy()

    historical = (
        historical
        .dropna(subset=["date"] + numeric_cols)
        .sort_values("date")
        .drop_duplicates("date", keep="last")
        .reset_index(drop=True)
    )

    if historical.empty:
        raise ValueError("Historical Model 1 data 為空。")

    print(
        f"Historical rows: {len(historical):,}"
    )
    print(
        "Historical period: "
        f"{historical['date'].min().date()} ~ "
        f"{historical['date'].max().date()}"
    )

    return historical
def load_model1_2026_csv():
    """
    Load Model 1 external CSV data for 2026.

    Required source columns:
        年月日
        收盤價(元)
        成交量(千股)
        成交值(千元)
        外資買賣超市值(百萬)
        融資餘額(千元)
        融券餘額(千元)

    Output schema:
        date
        close_price
        volume
        turnover_value
        foreign_net_buy
        margin_balance
        short_balance
    """

    print("Loading Model 1 2026 CSV data")

    # --------------------------------------------------
    # 1. Check file
    # --------------------------------------------------
    if not os.path.exists(FUTURE_2026_CSV):
        raise FileNotFoundError(
            f"找不到 2026 資料檔：{FUTURE_2026_CSV}"
        )

    # TEJ Pro exported CSV uses CP950
    df = pd.read_csv(
        FUTURE_2026_CSV,
        encoding="cp950",
    )

    df.columns = df.columns.astype(str).str.strip()
    ##print("DEBUG FUTURE_2026_CSV =", FUTURE_2026_CSV)
    ##print("DEBUG 2026 columns =", df.columns.tolist())

    # --------------------------------------------------
    # 2. Required columns
    # --------------------------------------------------
    required = [
        "年月日",
        "收盤價(元)",
        "成交量(千股)",
        "成交值(千元)",
        "外資買賣超市值(百萬)",
        "融資餘額(千元)",
        "融券餘額(千元)",
    ]

    missing = [
        c for c in required
        if c not in df.columns
    ]

    if missing:
        raise ValueError(
            f"2026 CSV 缺少必要欄位：{missing}"
        )

    # --------------------------------------------------
    # 3. Date
    # --------------------------------------------------
    df["date"] = pd.to_datetime(
        df["年月日"],
        errors="coerce",
    )

    # --------------------------------------------------
    # 4. Rename to Model 1 raw schema
    # --------------------------------------------------
    df = df[
        [
            "date",
            "收盤價(元)",
            "成交量(千股)",
            "成交值(千元)",
            "外資買賣超市值(百萬)",
            "融資餘額(千元)",
            "融券餘額(千元)",
        ]
    ].rename(
        columns={
            "收盤價(元)": "close_price",
            "成交量(千股)": "volume",
            "成交值(千元)": "turnover_value",
            "外資買賣超市值(百萬)": "foreign_net_buy",
            "融資餘額(千元)": "margin_balance",
            "融券餘額(千元)": "short_balance",
        }
    )

    # --------------------------------------------------
    # 5. Numeric conversion
    # --------------------------------------------------
    numeric_cols = [
        "close_price",
        "volume",
        "turnover_value",
        "foreign_net_buy",
        "margin_balance",
        "short_balance",
    ]

    # Remove thousands separators before numeric conversion.
    for col in numeric_cols:
        df[col] = pd.to_numeric(
            df[col]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.strip(),
            errors="coerce",
        )

    # --------------------------------------------------
    # 6. Foreign-flow representation
    # --------------------------------------------------
    # IMPORTANT:
    # The new TEJ Pro CSV already exports
    # 外資買賣超市值(百萬) in the same representation
    # used by the 2025 TEJ qfii_p input.
    #
    # Example:
    # 2025-12-31 = -3863.79
    #
    # Therefore DO NOT divide the 2026 value by 1000 again.

    # --------------------------------------------------
    # 7. Keep only 2026
    # --------------------------------------------------
    df = df[
        (df["date"] >= pd.Timestamp("2026-01-01")) &
        (df["date"] < pd.Timestamp("2027-01-01"))
    ].copy()

    # --------------------------------------------------
    # 8. Data quality
    # --------------------------------------------------
    df = (
        df
        .dropna(
            subset=[
                "date",
                "close_price",
                "volume",
                "turnover_value",
                "foreign_net_buy",
                "margin_balance",
                "short_balance",
            ]
        )
        .sort_values("date")
        .drop_duplicates("date", keep="last")
        .reset_index(drop=True)
    )

    if df.empty:
        raise ValueError(
            "2026 Model 1 CSV data 為空。"
        )

    # --------------------------------------------------
    # 9. Audit
    # --------------------------------------------------
    print(f"2026 CSV rows: {len(df):,}")
    print(
        "2026 CSV period: "
        f"{df['date'].min().date()} ~ "
        f"{df['date'].max().date()}"
    )

    print(
        "2026 CSV missing values: "
        f"{int(df[numeric_cols].isna().sum().sum())}"
    )

    # --------------------------------------------------
    # 10. Return Frozen Model 1 raw schema
    # --------------------------------------------------
    return df[
        [
            "date",
            "close_price",
            "volume",
            "turnover_value",
            "foreign_net_buy",
            "margin_balance",
            "short_balance",
        ]
    ]

def load_input_data():
    """
    Model 1 data-source layer.

    csv:
        保留原本 Frozen CSV baseline。

    hybrid:
        2014~2024 -> historical CSV
        2025      -> TEJ Y9999
        2026      -> external 2026 CSV

    重要：
        本函式只負責資料取得、schema 統一與資料品質檢查。
        HMM / MTA / LSTM 核心不修改。
    """

    # ==================================================
    # MODE 1: Original Frozen CSV baseline
    # ==================================================
    if DATA_SOURCE == "csv":
        if not os.path.exists(CSV_PATH):
            raise FileNotFoundError(
                f"找不到資料檔：{CSV_PATH}\n"
                "請把 CSV 放在專案根目錄，或設定 HISTORY_CSV_PATH。"
            )

        return base.load_csv_data(CSV_PATH)

    # ==================================================
    # MODE 2: Hybrid production data source
    # ==================================================
    if DATA_SOURCE == "hybrid":

        print("=" * 120)
        print("MODEL 1 HYBRID DATA ADAPTER")
        print("=" * 120)

        # --------------------------------------------------
        # A. Historical CSV: 2014 ~ 2024
        # --------------------------------------------------
        historical = load_historical_model1_data()

        # --------------------------------------------------
        # B. TEJ: 2025
        # --------------------------------------------------
        try:
            import tejapi
        except ImportError as exc:
            raise ImportError(
                "尚未安裝 tejapi，請先執行："
                "python -m pip install tejapi"
            ) from exc

        api_key = os.getenv("TEJ_API_KEY", "").strip()

        if not api_key:
            raise ValueError(
                "找不到 TEJ_API_KEY 環境變數。"
            )

        tejapi.ApiConfig.api_key = api_key
        tejapi.ApiConfig.ignoretz = True

        coid = TEJ_INDEX_CODE

        start_date = "2025-01-01"
        end_date = "2025-12-31"

        print(
            f"Loading Model 1 TEJ data: "
            f"{coid}, {start_date} ~ {end_date}"
        )

        def fetch(table):
            df = tejapi.get(
                table,
                coid=coid,
                mdate={
                    "gte": start_date,
                    "lte": end_date,
                },
                paginate=True,
            )

            if df is None or df.empty:
                raise ValueError(
                    f"TEJ {table} 沒有取得資料。"
                )

            df = df.reset_index(drop=True)
            df.columns = (
                df.columns
                .astype(str)
                .str.strip()
            )

            return df

        # --------------------------------------------------
        # B1. Price / volume / turnover
        # --------------------------------------------------
        price = fetch("TRAIL/TAPRCD")

        price_required = [
            "coid",
            "mdate",
            "close_d",
            "volume",
            "amount",
        ]

        missing = [
            c for c in price_required
            if c not in price.columns
        ]

        if missing:
            raise ValueError(
                f"TRAIL/TAPRCD 缺少欄位：{missing}"
            )

        price = (
            price[price_required]
            .copy()
            .rename(
                columns={
                    "mdate": "date",
                    "close_d": "close_price",
                    "amount": "turnover_value",
                }
            )
        )

        # --------------------------------------------------
        # B2. Foreign institutional
        # Frozen Model 1 definition = qfii_p
        # --------------------------------------------------
        inst = fetch("TRAIL/TATINST1")

        inst_required = [
            "coid",
            "mdate",
            "qfii_p",
        ]

        missing = [
            c for c in inst_required
            if c not in inst.columns
        ]

        if missing:
            raise ValueError(
                f"TRAIL/TATINST1 缺少欄位：{missing}"
            )

        inst = (
            inst[inst_required]
            .copy()
            .rename(
                columns={
                    "mdate": "date",
                    "qfii_p": "foreign_net_buy",
                }
            )
        )

        # --------------------------------------------------
        # B3. Margin / short
        # Frozen Model 1 definition = l0ng_ta / short_ta
        # --------------------------------------------------
        margin = fetch("TRAIL/TAGIN")

        margin_required = [
            "coid",
            "mdate",
            "l0ng_ta",
            "short_ta",
        ]

        missing = [
            c for c in margin_required
            if c not in margin.columns
        ]

        if missing:
            raise ValueError(
                f"TRAIL/TAGIN 缺少欄位：{missing}"
            )

        margin = (
            margin[margin_required]
            .copy()
            .rename(
                columns={
                    "mdate": "date",
                    "l0ng_ta": "margin_balance",
                    "short_ta": "short_balance",
                }
            )
        )

        # --------------------------------------------------
        # B4. Normalize TEJ dates
        # --------------------------------------------------
        for frame in (price, inst, margin):
            frame["date"] = pd.to_datetime(
                frame["date"],
                errors="coerce",
            )

            frame.drop(
                columns=["coid"],
                inplace=True,
            )

        # --------------------------------------------------
        # B5. Merge TEJ
        # --------------------------------------------------
        tej_2025 = (
            price
            .merge(
                inst,
                on="date",
                how="inner",
                validate="one_to_one",
            )
            .merge(
                margin,
                on="date",
                how="inner",
                validate="one_to_one",
            )
        )

        raw_cols = [
            "close_price",
            "volume",
            "turnover_value",
            "foreign_net_buy",
            "margin_balance",
            "short_balance",
        ]

        for col in raw_cols:
            tej_2025[col] = pd.to_numeric(
                tej_2025[col],
                errors="coerce",
            )

        tej_2025 = (
            tej_2025
            .replace([np.inf, -np.inf], np.nan)
            .dropna(subset=["date"] + raw_cols)
            .sort_values("date")
            .drop_duplicates("date", keep="last")
            .reset_index(drop=True)
        )

        if tej_2025.empty:
            raise ValueError(
                "2025 TEJ Model 1 data 為空。"
            )

        print(
            f"TEJ 2025 rows: {len(tej_2025):,}"
        )
        print(
            "TEJ 2025 period: "
            f"{tej_2025['date'].min().date()} ~ "
            f"{tej_2025['date'].max().date()}"
        )

        # --------------------------------------------------
        # C. 2026 external CSV
        # --------------------------------------------------
        future_2026 = load_model1_2026_csv()

        # --------------------------------------------------
        # D. Strict schema audit
        # --------------------------------------------------
        required_schema = [
            "date",
            "close_price",
            "volume",
            "turnover_value",
            "foreign_net_buy",
            "margin_balance",
            "short_balance",
        ]

        sources = {
            "Historical 2014-2024": historical,
            "TEJ 2025": tej_2025,
            "CSV 2026": future_2026,
        }

        for source_name, frame in sources.items():

            missing_cols = [
                c for c in required_schema
                if c not in frame.columns
            ]

            if missing_cols:
                raise ValueError(
                    f"{source_name} 缺少 Model 1 欄位："
                    f"{missing_cols}"
                )

        # --------------------------------------------------
        # E. 2026 turnover-value audit
        # --------------------------------------------------
        missing_turnover = int(
            future_2026["turnover_value"]
            .isna()
            .sum()
        )

        if missing_turnover > 0:
            raise ValueError(
                "\n"
                "MODEL 1 HYBRID DATA AUDIT FAIL\n"
                f"2026 CSV 有 {missing_turnover} 筆 "
                "turnover_value 缺值。\n"
                "Frozen Model 1 的 foreign_ratio 需要實際成交值，"
                "不能用 close_price * volume 推估。\n"
                "請補入 2026 的「成交值(千元)」後再執行 Hybrid。"
            )

        # --------------------------------------------------
        # F. Combine three sources
        # --------------------------------------------------
        raw = pd.concat(
            [
                historical[required_schema],
                tej_2025[required_schema],
                future_2026[required_schema],
            ],
            ignore_index=True,
        )

        # --------------------------------------------------
        # G. Date boundary / duplicate audit
        # --------------------------------------------------
        raw["date"] = pd.to_datetime(
            raw["date"],
            errors="coerce",
        )

        duplicate_dates = int(
            raw["date"].duplicated().sum()
        )

        if duplicate_dates > 0:
            raise ValueError(
                f"Hybrid data 發現 {duplicate_dates} 個重複交易日。"
            )

        raw = (
            raw
            .replace([np.inf, -np.inf], np.nan)
            .sort_values("date")
            .reset_index(drop=True)
        )

        # --------------------------------------------------
        # H. Final missing-value audit
        # --------------------------------------------------
        missing_summary = (
            raw[required_schema]
            .isna()
            .sum()
        )

        bad_missing = missing_summary[
            missing_summary > 0
        ]

        if not bad_missing.empty:
            raise ValueError(
                "Hybrid Model 1 data 尚有缺值：\n"
                + bad_missing.to_string()
            )

        # --------------------------------------------------
        # I. Source-boundary audit
        # --------------------------------------------------
        if historical["date"].max() >= pd.Timestamp("2025-01-01"):
            raise ValueError(
                "Historical source 不應包含 2025 之後資料。"
            )

        if (
            tej_2025["date"].min() < pd.Timestamp("2025-01-01")
            or
            tej_2025["date"].max() >= pd.Timestamp("2026-01-01")
        ):
            raise ValueError(
                "TEJ source 必須限制於 2025。"
            )

        if future_2026["date"].min() < pd.Timestamp("2026-01-01"):
            raise ValueError(
                "2026 CSV source 包含 2026 以前資料。"
            )

        print()
        print("-" * 120)
        print("MODEL 1 HYBRID DATA SUMMARY")
        print("-" * 120)

        print(
            "Historical : "
            f"{historical['date'].min().date()} ~ "
            f"{historical['date'].max().date()} "
            f"({len(historical):,} rows)"
        )

        print(
            "TEJ        : "
            f"{tej_2025['date'].min().date()} ~ "
            f"{tej_2025['date'].max().date()} "
            f"({len(tej_2025):,} rows)"
        )

        print(
            "2026 CSV   : "
            f"{future_2026['date'].min().date()} ~ "
            f"{future_2026['date'].max().date()} "
            f"({len(future_2026):,} rows)"
        )

        print(
            "Combined   : "
            f"{raw['date'].min().date()} ~ "
            f"{raw['date'].max().date()} "
            f"({len(raw):,} rows)"
        )

        print(
            "Duplicate dates:",
            duplicate_dates,
        )

        print(
            "Missing values:",
            int(
                raw[required_schema]
                .isna()
                .sum()
                .sum()
            ),
        )

        print(
            "MODEL 1 HYBRID DATA AUDIT: PASS"
        )

        return raw

    raise ValueError(
        f"未知 MODEL1_DATA_SOURCE={DATA_SOURCE!r}；"
        "請使用 csv 或 hybrid。"
    )


# ============================================================
# LSTM dataset — same target convention as V4 selection code
# ============================================================
def build_dataset(monthly, seq_len):
    target_col = "target_regime_next_month"
    non_feature = ["month", "current_month_regime", target_col]
    feature_cols = [c for c in monthly.columns if c not in non_feature]

    X, y, target_months = [], [], []

    for i in range(len(monthly) - seq_len + 1):
        end_i = i + seq_len - 1

        X.append(
            monthly.loc[i:end_i, feature_cols].values
        )
        y.append(
            monthly.loc[end_i, target_col]
        )

        feature_end = pd.Period(
            monthly.loc[end_i, "month"], freq="M"
        )
        target_months.append(feature_end + 1)

    return (
        np.asarray(X, dtype=np.float32),
        np.asarray(y),
        feature_cols,
        target_months,
    )


def scale_train_only(X_train, X_val, X_next):
    n_features = X_train.shape[2]

    scaler = StandardScaler()
    scaler.fit(
        X_train.reshape(-1, n_features)
    )

    def tx(x):
        return scaler.transform(
            x.reshape(-1, n_features)
        ).reshape(x.shape)

    return (
        tx(X_train),
        tx(X_val),
        tx(X_next),
        scaler,
    )


def make_current_month_feature_row(cur, current_month):
    """
    產生最新一個已觀察月份的 monthly HMM+MTA feature row。

    欄位定義直接對齊
    base.build_monthly_hmm_mta_features()。

    唯一差別：
    production 不知道下一個月的真實 regime，
    因此 target_regime_next_month 留 NaN，且絕不拿它訓練。
    """
    cur = cur.sort_values("date")

    row = {
        "month": str(current_month)
    }

    for s in range(N_STATES):
        row[f"freq_state_{s}"] = (
            cur["state"] == s
        ).mean()

        row[f"avg_prob_state_{s}"] = (
            cur[f"prob_state_{s}"].mean()
        )

        row[f"last_prob_state_{s}"] = (
            cur[f"prob_state_{s}"].iloc[-1]
        )

    row["month_mean_mta"] = cur["mta"].mean()
    row["month_last_mta"] = cur["mta"].iloc[-1]
    row["month_std_mta"] = cur["mta"].std()

    row["month_mean_price_change"] = cur["price_change"].mean()
    row["month_std_price_change"] = cur["price_change"].std()

    row["month_mean_volume_change"] = cur["volume_change"].mean()
    row["month_std_volume_change"] = cur["volume_change"].std()

    row["month_mean_foreign_change"] = cur["foreign_change"].mean()
    row["month_std_foreign_change"] = cur["foreign_change"].std()

    row["month_mean_margin_change"] = cur["margin_change"].mean()
    row["month_std_margin_change"] = cur["margin_change"].std()

    row["month_mean_short_change"] = cur["short_change"].mean()
    row["month_std_short_change"] = cur["short_change"].std()

    row["month_mean_foreign_ratio"] = cur["foreign_ratio"].mean()

    # Must match base.build_monthly_hmm_mta_features(): iloc[-1]
    row["current_month_regime"] = cur["regime"].iloc[-1]

    # Production never knows the next-month truth.
    row["target_regime_next_month"] = np.nan

    return row



def build_app_duration_metrics(
    hmm_model,
    mapping,
    mta,
    predicted_regime,
    trading_days_per_month=21.0,
):
    """
    App-facing duration/risk metrics derived only from the frozen training HMM.

    1) expected_regime_duration_*:
       HMM geometric expected dwell time for the LSTM-predicted regime:
           E[D_i] = 1 / (1 - P_ii)
       This is the quantity shown in the App as "預估狀態持續時間".

    2) mta_to_bear_*:
       Existing thesis MTA. In the validated core, Bear is the absorbing state,
       so this is the expected HMM-step horizon to the Bear/risk state.
       It is NOT relabeled as regime duration.
    """
    regime_to_state = {regime: int(state) for state, regime in mapping.items()}
    if predicted_regime not in regime_to_state:
        raise ValueError(
            f"Predicted regime {predicted_regime!r} not found in HMM mapping."
        )

    state = regime_to_state[predicted_regime]
    p_stay = float(hmm_model.transmat_[state, state])

    if p_stay >= 1.0 - 1e-12:
        duration_steps = float("inf")
        duration_months = float("inf")
    else:
        duration_steps = 1.0 / (1.0 - p_stay)
        duration_months = duration_steps / float(trading_days_per_month)

    mta_steps = float(mta[state])
    mta_months = mta_steps / float(trading_days_per_month)

    return {
        "duration_hmm_state": state,
        "regime_self_transition_prob": p_stay,
        "expected_regime_duration_steps": duration_steps,
        "expected_regime_duration_months": duration_months,
        "duration_unit": "months",
        "duration_method": "HMM_GEOMETRIC_DWELL_TIME_1_OVER_1_MINUS_PII",
        "mta_to_bear_steps": mta_steps,
        "mta_to_bear_months": mta_months,
        "mta_absorbing_regime": "Bear",
        "mta_method": "ABSORBING_MARKOV_MEAN_TIME_TO_BEAR",
    }


def main():
    print("=" * 120)
    print("MODEL 1 V5 - HMM + MTA + LSTM | FROZEN STRICT CAUSAL PRODUCTION")
    print("=" * 120)
    print(f"Data source : {DATA_SOURCE.upper()}")
    print(
        f"Frozen config: Train={TRAIN_MONTHS} / "
        f"Validation={VAL_MONTHS} / Seq={SEQ_LEN}"
    )
    print("HMM fit     : Training only")
    print("HMM infer   : causal forward filter / no backward smoothing")
    print("LSTM scaler : Training only")
    print("Validation  : EarlyStopping only")
    print("Future truth: NOT USED")

    # --------------------------------------------------------
    # 1. Load data
    # --------------------------------------------------------
    raw = load_input_data()

    raw = raw[
        raw["date"] >= pd.Timestamp(EXP_START_DATE)
    ].copy()

    feat = base.create_features(raw)

    months = sorted(
        feat["year_month"].unique()
    )

    if len(months) < (
        TRAIN_MONTHS + VAL_MONTHS + SEQ_LEN
    ):
        raise ValueError(
            "可用歷史月份不足以建立正式 production window。"
        )

    # Latest observed month is validation end.
    val_end = months[-1]
    val_start = val_end - (VAL_MONTHS - 1)

    val_months = period_range(
        val_start, VAL_MONTHS
    )

    train_months = period_range(
        val_start - TRAIN_MONTHS,
        TRAIN_MONTHS,
    )

    context_months = period_range(
        train_months[0] - SEQ_LEN,
        SEQ_LEN,
    )

    print("\nProduction periods")
    print(
        f"Train      : {train_months[0]} ~ "
        f"{train_months[-1]}"
    )
    print(
        f"Validation : {val_months[0]} ~ "
        f"{val_months[-1]}"
    )

    # --------------------------------------------------------
    # 2. EXACT V4 HMM causal core
    # --------------------------------------------------------
    (
        hmm_model,
        hmm_scaler,
        hmm_features,
        state_stats,
        mapping,
        bear_state,
        bull_state,
        side_state,
        mta,
    ) = v4.fit_hmm_strict_rolling_causal(
        feat,
        train_months,
    )

    context = v4.filter_frozen_hmm_segment(
        feat,
        hmm_model,
        hmm_scaler,
        hmm_features,
        mapping,
        mta,
        context_months,
    )

    formal_months = (
        train_months + val_months
    )

    formal = v4.filter_frozen_hmm_segment(
        feat,
        hmm_model,
        hmm_scaler,
        hmm_features,
        mapping,
        mta,
        formal_months,
    )

    inferred = (
        pd.concat(
            [context, formal],
            ignore_index=True,
        )
        .sort_values("date")
        .reset_index(drop=True)
    )

    # --------------------------------------------------------
    # 3. Monthly features
    # --------------------------------------------------------
    monthly = (
        base.build_monthly_hmm_mta_features(
            inferred,
            n_states=N_STATES,
        )
    )

    X, y_raw, feature_cols, target_months = (
        build_dataset(
            monthly,
            SEQ_LEN,
        )
    )

    target_map = {
        m: i
        for i, m in enumerate(target_months)
    }

    required_targets = (
        train_months + val_months
    )

    missing = [
        m
        for m in required_targets
        if m not in target_map
    ]

    if missing:
        raise ValueError(
            "缺少 Train/Validation target months: "
            + ", ".join(map(str, missing))
        )

    train_idx = np.asarray(
        [target_map[m] for m in train_months]
    )

    val_idx = np.asarray(
        [target_map[m] for m in val_months]
    )

    encoder = LabelEncoder()
    encoder.fit(
        np.asarray(CLASSES)
    )

    y = encoder.transform(y_raw)

    X_train = X[train_idx]
    y_train = y[train_idx]

    X_val = X[val_idx]
    y_val = y[val_idx]

    # --------------------------------------------------------
    # 4. Build TRUE next-month production sequence
    # --------------------------------------------------------
    latest_month = months[-1]

    latest_daily = formal[
        formal["year_month"] == latest_month
    ].copy()

    if latest_daily.empty:
        raise ValueError(
            f"找不到最新月份 {latest_month} 的 HMM inference rows。"
        )

    latest_feature_row = (
        make_current_month_feature_row(
            latest_daily,
            latest_month,
        )
    )

    production_monthly = pd.concat(
        [
            monthly,
            pd.DataFrame(
                [latest_feature_row]
            ),
        ],
        ignore_index=True,
    )

    if len(production_monthly) < SEQ_LEN:
        raise ValueError(
            "Production monthly sequence 不足。"
        )

    latest_sequence = (
        production_monthly
        .iloc[-SEQ_LEN:][feature_cols]
        .values
        .astype(np.float32)
    )

    X_next = latest_sequence[
        np.newaxis, :, :
    ]

    target_month = (
        pd.Period(
            str(latest_month),
            freq="M",
        )
        + 1
    )

    # --------------------------------------------------------
    # 5. Training-only LSTM scaling
    # --------------------------------------------------------
    (
        X_train_s,
        X_val_s,
        X_next_s,
        lstm_scaler,
    ) = scale_train_only(
        X_train,
        X_val,
        X_next,
    )

    # --------------------------------------------------------
    # 6. LSTM — same architecture as validated base model
    # --------------------------------------------------------
    K.clear_session()
    set_all_seeds(SEED)

    model = base.build_lstm_classifier(
        input_shape=(
            X_train_s.shape[1],
            X_train_s.shape[2],
        ),
        n_classes=len(
            encoder.classes_
        ),
    )

    early_stop = EarlyStopping(
        monitor="val_loss",
        patience=15,
        restore_best_weights=True,
    )

    history = model.fit(
        X_train_s,
        y_train,
        validation_data=(
            X_val_s,
            y_val,
        ),
        epochs=100,
        batch_size=8,
        verbose=0,
        callbacks=[early_stop],
        shuffle=False,
    )

    # --------------------------------------------------------
    # 7. Production prediction
    # --------------------------------------------------------
    probabilities = model.predict(
        X_next_s,
        verbose=0,
    )[0]

    predicted_index = int(
        np.argmax(probabilities)
    )

    predicted_regime = str(
        encoder.inverse_transform(
            [predicted_index]
        )[0]
    )

    class_index = {
        cls: int(
            encoder.transform([cls])[0]
        )
        for cls in CLASSES
    }

    app_metrics = build_app_duration_metrics(
        hmm_model=hmm_model,
        mapping=mapping,
        mta=mta,
        predicted_regime=predicted_regime,
    )

    result = pd.DataFrame(
        [{
            "target_month": str(target_month),
            "predicted_regime": predicted_regime,
            "prob_Bear": float(
                probabilities[
                    class_index["Bear"]
                ]
            ),
            "prob_Bull": float(
                probabilities[
                    class_index["Bull"]
                ]
            ),
            "prob_Sideways": float(
                probabilities[
                    class_index["Sideways"]
                ]
            ),
            "expected_regime_duration_months": float(
                app_metrics["expected_regime_duration_months"]
            ),
            "expected_regime_duration_steps": float(
                app_metrics["expected_regime_duration_steps"]
            ),
            "duration_unit": app_metrics["duration_unit"],
            "duration_method": app_metrics["duration_method"],
            "regime_self_transition_prob": float(
                app_metrics["regime_self_transition_prob"]
            ),
            "mta_to_bear_months": float(
                app_metrics["mta_to_bear_months"]
            ),
            "mta_to_bear_steps": float(
                app_metrics["mta_to_bear_steps"]
            ),
            "mta_absorbing_regime": app_metrics["mta_absorbing_regime"],
            "mta_method": app_metrics["mta_method"],
        }]
    )

    probability_sum = float(
        result[
            [
                "prob_Bear",
                "prob_Bull",
                "prob_Sideways",
            ]
        ]
        .iloc[0]
        .sum()
    )

    if not np.isclose(
        probability_sum,
        1.0,
        atol=1e-5,
    ):
        raise ValueError(
            "Probability sum audit FAIL: "
            f"{probability_sum}"
        )

    # --------------------------------------------------------
    # 8. Formal interface for Model 2
    # --------------------------------------------------------
    result.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    metadata = pd.DataFrame(
        [{
            "model_name": MODEL_NAME,
            "pipeline_version": PIPELINE_VERSION,
            "data_source": DATA_SOURCE,
            "source_file": (
                CSV_PATH
                if DATA_SOURCE == "csv"
                else "TEJ_API"
            ),
            "data_start": str(
                raw["date"].min().date()
            ),
            "data_end": str(
                raw["date"].max().date()
            ),
            "train_start": str(
                train_months[0]
            ),
            "train_end": str(
                train_months[-1]
            ),
            "validation_start": str(
                val_months[0]
            ),
            "validation_end": str(
                val_months[-1]
            ),
            "train_months": TRAIN_MONTHS,
            "validation_months": VAL_MONTHS,
            "seq_len": SEQ_LEN,
            "seed": SEED,
            "epochs_run": len(
                history.history.get(
                    "loss", []
                )
            ),
            "n_features": len(
                feature_cols
            ),
            "target_month": str(
                target_month
            ),
            "probability_sum": (
                probability_sum
            ),
            "hmm_training_only": True,
            "hmm_causal_forward_filter": True,
            "no_backward_smoothing": True,
            "lstm_scaler_training_only": True,
            "future_actual_label_used": False,
            "app_duration_enabled": True,
            "duration_method": app_metrics["duration_method"],
            "duration_hmm_state": app_metrics["duration_hmm_state"],
            "regime_self_transition_prob": app_metrics["regime_self_transition_prob"],
            "mta_absorbing_regime": app_metrics["mta_absorbing_regime"],
            "mta_method": app_metrics["mta_method"],
            "trading_days_per_month_for_display": 21.0,
        }]
    )

    metadata.to_csv(
        METADATA_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    # --------------------------------------------------------
    # 9. Console audit
    # --------------------------------------------------------
    print("\n" + "=" * 120)
    print("MODEL 1 PRODUCTION OUTPUT")
    print("=" * 120)
    print(
        result.to_string(
            index=False
        )
    )

    print(
        "\nAPP MARKET STATUS"
    )
    print(
        "Predicted regime:",
        predicted_regime,
    )
    print(
        "Expected regime duration:",
        f"{app_metrics['expected_regime_duration_months']:.2f} months",
        f"({app_metrics['expected_regime_duration_steps']:.2f} HMM steps)",
    )
    print(
        "MTA to Bear risk state:",
        f"{app_metrics['mta_to_bear_months']:.2f} months",
        f"({app_metrics['mta_to_bear_steps']:.2f} HMM steps)",
    )
    print(
        "NOTE: App duration uses HMM dwell time; "
        "MTA remains the thesis risk-horizon metric to Bear."
    )

    print(
        "\nProbability sum:",
        f"{probability_sum:.12f}",
    )
    print(
        "Feature count:",
        len(feature_cols),
    )
    print(
        "Epochs:",
        len(
            history.history.get(
                "loss", []
            )
        ),
    )
    print(
        "HMM mapping:",
        mapping,
    )

    print("\n已輸出：")
    print("-", OUTPUT_FILE)
    print("-", METADATA_FILE)

    print(
        "\nAUDIT RESULT: "
        "MODEL 1 PRODUCTION OUTPUT PASS"
    )


if __name__ == "__main__":
    main()
