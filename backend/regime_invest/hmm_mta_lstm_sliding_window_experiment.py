# hmm_mta_lstm_v2.py
# ============================================================
# V2：HMM + MTA + LSTM
# 最符合「HMM萃取市場狀態 + MTA狀態存續時間 + LSTM預測下一期狀態」的論文主架構
#
# 預設 CSV：
# 加權指數2014-2025.csv
#
# 預期欄位：
# 年月日、成交量(千股)、成交值(千元)、外資買賣超市值(百萬)、融券餘額(千元)、融資餘額(千元)
# ============================================================

import warnings
warnings.filterwarnings("ignore")

import os
from datetime import date

import numpy as np
import pandas as pd

from hmmlearn.hmm import GaussianHMM
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    precision_recall_fscore_support
)
from sklearn.utils.class_weight import compute_class_weight

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras import backend as K
import tensorflow as tf


# ============================================================
# Data source settings
# ============================================================
CSV_PATH = os.getenv("HISTORY_CSV_PATH", "加權指數2014-2025.csv")
TEJ_INDEX_CODE = os.getenv("TEJ_INDEX_CODE", "Y9999")
TEJ_START_DATE = os.getenv("TEJ_START_DATE", "2025-01-01")
TEJ_END_DATE = os.getenv("TEJ_END_DATE", date.today().isoformat())

TEJ_PRICE_TABLE = "TRAIL/TAPRCD"
TEJ_INST_TABLE = "TRAIL/TATINST1"
TEJ_MARGIN_TABLE = "TRAIL/TAGIN"


def load_csv_data(csv_path: str) -> pd.DataFrame:
    """
    讀取既有 2014-2025 歷史 CSV，統一成模型使用的欄位名稱。
    """
    encodings = ["utf-8-sig", "big5", "cp950", "utf-8"]
    last_error = None

    for enc in encodings:
        try:
            df = pd.read_csv(csv_path, encoding=enc)
            break
        except Exception as e:
            last_error = e
    else:
        raise last_error

    df.columns = [str(c).strip() for c in df.columns]

    rename_map = {
        "年月日": "date",
        "成交量(千股)": "volume",
        "成交值(千元)": "turnover_value",
        "外資買賣超市值(百萬)": "foreign_net_buy",
        "融券餘額(千元)": "short_balance",
        "融資餘額(千元)": "margin_balance",
    }
    df = df.rename(columns=rename_map)

    required_cols = [
        "date",
        "volume",
        "turnover_value",
        "foreign_net_buy",
        "short_balance",
        "margin_balance",
    ]

    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(
            "CSV 缺少必要欄位：" + str(missing)
            + "\n目前讀到欄位：" + str(list(df.columns))
        )

    df["date"] = pd.to_datetime(df["date"], errors="coerce")

    numeric_cols = [
        "volume",
        "turnover_value",
        "foreign_net_buy",
        "short_balance",
        "margin_balance",
    ]

    for col in numeric_cols:
        df[col] = (
            df[col]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.replace("--", "", regex=False)
            .str.strip()
        )
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df[required_cols].copy()
    df["data_source"] = "CSV"

    df = (
        df.dropna(subset=required_cols)
        .sort_values("date")
        .drop_duplicates(subset=["date"], keep="last")
        .reset_index(drop=True)
    )

    return df


def _tej_get(table: str, start_date: str, end_date: str) -> pd.DataFrame:
    """
    讀取 TEJ Trial/API 資料。API Key 只從環境變數讀取，
    不會寫入 Python 程式。
    """
    try:
        import tejapi
    except ImportError as exc:
        raise ImportError(
            "尚未安裝 tejapi，請先執行：python -m pip install tejapi"
        ) from exc

    api_key = os.getenv("TEJ_API_KEY", "").strip()
    if not api_key:
        raise ValueError(
            "找不到 TEJ_API_KEY。\n"
            "請先在 PowerShell 設定：\n"
            '$env:TEJ_API_KEY="你的 TEJ API Key"'
        )

    tejapi.ApiConfig.api_key = api_key
    tejapi.ApiConfig.ignoretz = True

    df = tejapi.get(
        table,
        coid=TEJ_INDEX_CODE,
        mdate={"gte": start_date, "lte": end_date},
        paginate=True,
    )

    if df is None or df.empty:
        raise ValueError(
            f"{table} 在 {TEJ_INDEX_CODE}、{start_date} ~ {end_date} 沒有資料。"
        )

    df = df.reset_index(drop=True)
    df.columns = [str(c).strip() for c in df.columns]
    return df


def load_tej_data(
    start_date: str = TEJ_START_DATE,
    end_date: str = TEJ_END_DATE,
) -> pd.DataFrame:
    """
    TEJ 欄位映射：
      TRAIL/TAPRCD   volume / amount
      TRAIL/TATINST1 qfii_p
      TRAIL/TAGIN    l0ng_ta / short_ta

    2025 overlap 驗證已確認：
      volume、amount、l0ng_ta、short_ta 與 CSV 1:1 完全一致；
      qfii_p 與 CSV 外資欄位為同資料，但 CSV = qfii_p * 1000。
    """
    print("\n=== TEJ API Download ===")
    print("Index code:", TEJ_INDEX_CODE)
    print("Requested period:", start_date, "~", end_date)

    price = _tej_get(TEJ_PRICE_TABLE, start_date, end_date)
    inst = _tej_get(TEJ_INST_TABLE, start_date, end_date)
    margin = _tej_get(TEJ_MARGIN_TABLE, start_date, end_date)

    price_required = ["mdate", "volume", "amount"]
    inst_required = ["mdate", "qfii_p"]
    margin_required = ["mdate", "l0ng_ta", "short_ta"]

    for table_name, frame, required in [
        (TEJ_PRICE_TABLE, price, price_required),
        (TEJ_INST_TABLE, inst, inst_required),
        (TEJ_MARGIN_TABLE, margin, margin_required),
    ]:
        missing = [c for c in required if c not in frame.columns]
        if missing:
            raise ValueError(
                f"{table_name} 缺少欄位：{missing}\n"
                f"目前欄位：{list(frame.columns)}"
            )

    price = price[price_required].rename(
        columns={
            "mdate": "date",
            "amount": "turnover_value",
        }
    )

    inst = inst[inst_required].rename(
        columns={
            "mdate": "date",
            "qfii_p": "foreign_net_buy",
        }
    )

    margin = margin[margin_required].rename(
        columns={
            "mdate": "date",
            "l0ng_ta": "margin_balance",
            "short_ta": "short_balance",
        }
    )

    for frame in (price, inst, margin):
        frame["date"] = pd.to_datetime(frame["date"], errors="coerce")

    df = (
        price
        .merge(inst, on="date", how="inner")
        .merge(margin, on="date", how="inner")
    )

    numeric_cols = [
        "volume",
        "turnover_value",
        "foreign_net_buy",
        "margin_balance",
        "short_balance",
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # 重要：TEJ qfii_p 單位比歷史 CSV 小 1000 倍。
    # 轉成與既有歷史 CSV 完全相同的數值尺度後，才合併。
    df["foreign_net_buy"] = df["foreign_net_buy"] * 1000.0

    df["data_source"] = "TEJ"

    required_cols = [
        "date",
        "volume",
        "turnover_value",
        "foreign_net_buy",
        "short_balance",
        "margin_balance",
    ]

    df = (
        df[required_cols + ["data_source"]]
        .replace([np.inf, -np.inf], np.nan)
        .dropna(subset=required_cols)
        .sort_values("date")
        .drop_duplicates(subset=["date"], keep="last")
        .reset_index(drop=True)
    )

    print("TEJ rows:", len(df))
    print("TEJ first date:", df["date"].min())
    print("TEJ last date:", df["date"].max())

    return df


def validate_overlap(csv_df: pd.DataFrame, tej_df: pd.DataFrame) -> None:
    """
    在 CSV 與 TEJ 重疊日期做資料一致性檢查。
    這不是用來改模型，而是避免不同資料口徑被直接拼接。
    """
    cols = [
        "volume",
        "turnover_value",
        "foreign_net_buy",
        "short_balance",
        "margin_balance",
    ]

    overlap = csv_df[["date"] + cols].merge(
        tej_df[["date"] + cols],
        on="date",
        how="inner",
        suffixes=("_csv", "_tej"),
    )

    print("\n=== CSV / TEJ Overlap Validation ===")
    print("Overlap rows:", len(overlap))

    if overlap.empty:
        print("No overlap period; skip consistency statistics.")
        return

    for col in cols:
        a = overlap[f"{col}_csv"]
        b = overlap[f"{col}_tej"]

        corr = a.corr(b)

        nonzero = b != 0
        if nonzero.any():
            ratio = (a[nonzero] / b[nonzero]).median()
        else:
            ratio = np.nan

        print(
            f"{col}: corr={corr:.6f}, "
            f"median CSV/TEJ ratio={ratio:.6f}"
        )


def load_hybrid_data(csv_path: str = CSV_PATH) -> pd.DataFrame:
    """
    正式 Hybrid Pipeline：
      1. 歷史 CSV 提供長期訓練資料。
      2. TEJ 提供目前帳號可取得的標準化/更新資料。
      3. 重疊日期以 TEJ 優先。
      4. 所有欄位先統一到相同單位後才進模型。

    注意：
    為避免 2014-2025 期間因「價格定義改變」產生結構斷點，
    Hybrid 版本仍沿用原研究的平均成交價 proxy：
        turnover_value / volume
    因為 CSV 與 TEJ 的 volume/amount 已驗證完全一致。
    """
    csv_df = load_csv_data(csv_path)
    tej_df = load_tej_data()

    validate_overlap(csv_df, tej_df)

    combined = pd.concat(
        [csv_df, tej_df],
        ignore_index=True,
        sort=False,
    )

    # concat 順序是 CSV 在前、TEJ 在後；keep="last" = overlap TEJ 優先。
    combined = (
        combined
        .sort_values(["date", "data_source"])
        .drop_duplicates(subset=["date"], keep="last")
        .sort_values("date")
        .reset_index(drop=True)
    )

    # 由於字母排序可能影響 TEJ/CSV 優先，再做一次明確 priority。
    priority = {"CSV": 0, "TEJ": 1}
    combined["_source_priority"] = combined["data_source"].map(priority).fillna(0)

    combined = (
        combined
        .sort_values(["date", "_source_priority"])
        .drop_duplicates(subset=["date"], keep="last")
        .sort_values("date")
        .drop(columns=["_source_priority"])
        .reset_index(drop=True)
    )

    print("\n=== Hybrid Data ===")
    print("Total rows:", len(combined))
    print("First date:", combined["date"].min())
    print("Last date:", combined["date"].max())
    print("Source counts:")
    print(combined["data_source"].value_counts())

    combined.to_csv(
        "hybrid_csv_tej_model_input.csv",
        index=False,
        encoding="utf-8-sig",
    )

    return combined


def create_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Hybrid 需保持 2014-最新期間同一價格定義。
    # 因歷史 CSV 無 close，因此沿用原研究的平均成交價 proxy；
    # TEJ amount/volume 已在 overlap 驗證與 CSV 完全一致。
    df["avg_trade_price"] = df["turnover_value"] / (df["volume"] + 1e-8)

    # 成交價變化
    df["price_change"] = np.log(df["avg_trade_price"] / df["avg_trade_price"].shift(1))

    # 成交量變化
    df["log_volume"] = np.log(df["volume"] + 1e-8)
    df["volume_change"] = df["log_volume"].diff()

    # 外資買賣交易量/市值變化
    df["foreign_change"] = df["foreign_net_buy"].diff()
    df["foreign_ratio"] = df["foreign_net_buy"] / (df["turnover_value"] + 1e-8)

    # 融資與融券餘額變化
    df["margin_change"] = np.log(
        (df["margin_balance"] + 1e-8) / (df["margin_balance"].shift(1) + 1e-8)
    )
    df["short_change"] = np.log(
        (df["short_balance"] + 1e-8) / (df["short_balance"].shift(1) + 1e-8)
    )

    df["year_month"] = df["date"].dt.to_period("M")

    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna().reset_index(drop=True)
    return df


def fit_hmm(df: pd.DataFrame, n_states: int = 3):
    hmm_features = [
        "price_change",
        "volume_change",
        "foreign_change",
        "margin_change",
        "short_change",
    ]

    scaler = StandardScaler()
    X = scaler.fit_transform(df[hmm_features].values)

    model = GaussianHMM(
        n_components=n_states,
        covariance_type="diag",
        n_iter=500,
        random_state=42,
    )
    model.fit(X)

    hidden_states = model.predict(X)
    state_probs = model.predict_proba(X)

    df_hmm = df.copy()
    df_hmm["state"] = hidden_states

    for s in range(n_states):
        df_hmm[f"prob_state_{s}"] = state_probs[:, s]

    return model, scaler, df_hmm, hmm_features





def map_states_to_regimes(df_hmm: pd.DataFrame, n_states: int = 3):
    state_stats = (
        df_hmm.groupby("state")
        .agg(
            mean_price_change=("price_change", "mean"),
            std_price_change=("price_change", "std"),
            mean_volume_change=("volume_change", "mean"),
            mean_foreign_change=("foreign_change", "mean"),
            mean_margin_change=("margin_change", "mean"),
            mean_short_change=("short_change", "mean"),
        )
        .reset_index()
    )

    ordered = state_stats.sort_values("mean_price_change").reset_index(drop=True)

    bear_state = int(ordered.iloc[0]["state"])
    bull_state = int(ordered.iloc[-1]["state"])
    side_state = [s for s in range(n_states) if s not in [bear_state, bull_state]][0]

    state_to_regime = {
        bull_state: "Bull",
        bear_state: "Bear",
        side_state: "Sideways",
    }

    df_hmm = df_hmm.copy()
    df_hmm["regime"] = df_hmm["state"].map(state_to_regime)

    return df_hmm, state_stats, state_to_regime, bull_state, bear_state, side_state


def calculate_mta(transition_matrix: np.ndarray, absorbing_state: int):
    n_states = transition_matrix.shape[0]
    transient_states = [s for s in range(n_states) if s != absorbing_state]

    Q = transition_matrix[np.ix_(transient_states, transient_states)]
    I = np.eye(Q.shape[0])

    try:
        N = np.linalg.inv(I - Q)
    except np.linalg.LinAlgError:
        N = np.linalg.pinv(I - Q)

    mta_transient = N.sum(axis=1)
    full_mta = np.zeros(n_states)

    for idx, state in enumerate(transient_states):
        full_mta[state] = mta_transient[idx]

    full_mta[absorbing_state] = 0.0
    return full_mta


def add_mta_to_hmm_output(df_hmm: pd.DataFrame, hmm_model, bear_state: int):
    transmat = hmm_model.transmat_
    mta_per_state = calculate_mta(transmat, absorbing_state=bear_state)

    df_hmm = df_hmm.copy()
    df_hmm["mta"] = df_hmm["state"].map(lambda s: mta_per_state[int(s)])

    return df_hmm, mta_per_state


def build_monthly_hmm_mta_features(df_hmm: pd.DataFrame, n_states: int = 3):
    grouped = df_hmm.groupby("year_month")
    months = sorted(df_hmm["year_month"].unique())

    rows = []

    for i in range(len(months) - 1):
        current_month = months[i]
        next_month = months[i + 1]

        cur = grouped.get_group(current_month).sort_values("date")
        nxt = grouped.get_group(next_month).sort_values("date")

        row = {"month": str(current_month)}

        for s in range(n_states):
            row[f"freq_state_{s}"] = (cur["state"] == s).mean()
            row[f"avg_prob_state_{s}"] = cur[f"prob_state_{s}"].mean()
            row[f"last_prob_state_{s}"] = cur[f"prob_state_{s}"].iloc[-1]

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

        row["current_month_regime"] = cur["regime"].iloc[-1]
        row["target_regime_next_month"] = nxt["regime"].iloc[-1]

        
        rows.append(row)

    feature_df = pd.DataFrame(rows).dropna().reset_index(drop=True)
    return feature_df


def build_lstm_dataset(feature_df: pd.DataFrame, seq_len: int = 3):
    target_col = "target_regime_next_month"
    non_feature_cols = ["month", "current_month_regime", target_col]
    feature_cols = [c for c in feature_df.columns if c not in non_feature_cols]

    X_list, y_list, month_list = [], [], []

    for i in range(len(feature_df) - seq_len):
        X_seq = feature_df.loc[i:i + seq_len - 1, feature_cols].values
        y_target = feature_df.loc[i + seq_len, target_col]
        target_month = feature_df.loc[i + seq_len, "month"]

        X_list.append(X_seq)
        y_list.append(y_target)
        month_list.append(target_month)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list)

    return X, y, feature_cols, month_list


def time_series_split(X, y, months, train_ratio=0.8):
    split_idx = int(len(X) * train_ratio)
    return (
        X[:split_idx],
        X[split_idx:],
        y[:split_idx],
        y[split_idx:],
        months[:split_idx],
        months[split_idx:],
    )


def scale_lstm_inputs(X_train, X_test):
    n_train, seq_len, n_feat = X_train.shape
    n_test = X_test.shape[0]

    scaler = StandardScaler()
    X_train_2d = X_train.reshape(-1, n_feat)
    X_test_2d = X_test.reshape(-1, n_feat)

    X_train_scaled = scaler.fit_transform(X_train_2d).reshape(n_train, seq_len, n_feat)
    X_test_scaled = scaler.transform(X_test_2d).reshape(n_test, seq_len, n_feat)

    return X_train_scaled, X_test_scaled, scaler


def build_lstm_classifier(input_shape, n_classes: int):
    model = Sequential()
    model.add(LSTM(64, input_shape=input_shape, return_sequences=True))
    model.add(Dropout(0.2))
    model.add(LSTM(32, return_sequences=False))
    model.add(Dropout(0.2))
    model.add(Dense(16, activation="relu"))
    model.add(Dense(n_classes, activation="softmax"))

    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def make_class_weight_dict(y_train):
    classes = np.unique(y_train)
    weights = compute_class_weight(class_weight="balanced", classes=classes, y=y_train)
    # ============================================================
# Sliding-window experiment settings
# ============================================================
# 老師要求：近 10 年、Sliding Window、Train / Validation / Test。
# 月資料切法：60 個月訓練 + 12 個月驗證 + 12 個月測試，每次向前滑 12 個月。
# 若最新資料不足完整 12 個月 test，最後不足的期間不硬塞進正式比較表。
EXP_START_DATE = os.getenv("EXP_START_DATE", "2016-01-01")
TRAIN_MONTHS = int(os.getenv("TRAIN_MONTHS", "60"))
VAL_MONTHS = int(os.getenv("VAL_MONTHS", "12"))
TEST_MONTHS = int(os.getenv("TEST_MONTHS", "12"))
STEP_MONTHS = int(os.getenv("STEP_MONTHS", "12"))
SEQ_LEN = int(os.getenv("SEQ_LEN", "3"))
N_STATES = 3
USE_CLASS_WEIGHT = True
RANDOM_SEED = 42


def set_seed(seed=RANDOM_SEED):
    np.random.seed(seed)
    tf.random.set_seed(seed)


def load_experiment_data(csv_path=CSV_PATH):
    """實驗優先讀 CSV。老師已同意 2026 後資料由 CSV 更新。

    如果 CSV 已更新到 2026，這裡會自動使用；不再依賴 Trial TEJ API。
    """
    df = load_csv_data(csv_path)
    df = df[df["date"] >= pd.Timestamp(EXP_START_DATE)].copy()
    if df.empty:
        raise ValueError(f"{EXP_START_DATE} 之後沒有資料。")
    print("Experiment raw rows:", len(df))
    print("Experiment period:", df["date"].min(), "~", df["date"].max())
    return df


def scale_three_way(X_train, X_val, X_test):
    """Scaler 只 fit training，validation/test 僅 transform，避免資料洩漏。"""
    n_feat = X_train.shape[2]
    scaler = StandardScaler()
    scaler.fit(X_train.reshape(-1, n_feat))

    def transform(x):
        return scaler.transform(x.reshape(-1, n_feat)).reshape(x.shape)

    return transform(X_train), transform(X_val), transform(X_test), scaler


def build_windows(n_samples):
    total = TRAIN_MONTHS + VAL_MONTHS + TEST_MONTHS
    windows = []
    start = 0
    wid = 1
    while start + total <= n_samples:
        tr0, tr1 = start, start + TRAIN_MONTHS
        va0, va1 = tr1, tr1 + VAL_MONTHS
        te0, te1 = va1, va1 + TEST_MONTHS
        windows.append((wid, tr0, tr1, va0, va1, te0, te1))
        wid += 1
        start += STEP_MONTHS
    return windows


def metric_row(window_id, months_train, months_val, months_test, y_test, y_pred, encoder):
    labels = np.arange(len(encoder.classes_))
    row = {
        "window": window_id,
        "train_start": months_train[0],
        "train_end": months_train[-1],
        "val_start": months_val[0],
        "val_end": months_val[-1],
        "test_start": months_test[0],
        "test_end": months_test[-1],
        "n_train": len(months_train),
        "n_val": len(months_val),
        "n_test": len(months_test),
        "accuracy": accuracy_score(y_test, y_pred),
        "macro_precision": precision_score(y_test, y_pred, average="macro", labels=labels, zero_division=0),
        "macro_recall": recall_score(y_test, y_pred, average="macro", labels=labels, zero_division=0),
        "macro_f1": f1_score(y_test, y_pred, average="macro", labels=labels, zero_division=0),
        "weighted_f1": f1_score(y_test, y_pred, average="weighted", labels=labels, zero_division=0),
    }
    p, r, f, support = precision_recall_fscore_support(
        y_test, y_pred, labels=labels, zero_division=0
    )
    for i, name in enumerate(encoder.classes_):
        row[f"{name}_precision"] = p[i]
        row[f"{name}_recall"] = r[i]
        row[f"{name}_f1"] = f[i]
        row[f"{name}_support"] = int(support[i])
    return row


def main():
    set_seed()
    print("=" * 88)
    print("HMM + MTA + LSTM - 10-Year Sliding Window Experiment")
    print("=" * 88)
    print(f"設定：Train={TRAIN_MONTHS}月 / Validation={VAL_MONTHS}月 / Test={TEST_MONTHS}月 / Step={STEP_MONTHS}月")
    print("重要：Validation 用於 Early Stopping；Test 僅用於最後評估。")

    df = load_experiment_data(CSV_PATH)
    df_feat = create_features(df)

    # 先建立 regime/monthly features，延續目前論文模型定義。
    hmm_model, hmm_scaler, df_hmm, hmm_features = fit_hmm(df_feat, n_states=N_STATES)
    df_hmm, state_stats, state_to_regime, bull_state, bear_state, side_state = map_states_to_regimes(
        df_hmm, n_states=N_STATES
    )
    df_hmm, mta_per_state = add_mta_to_hmm_output(df_hmm, hmm_model, bear_state)
    monthly = build_monthly_hmm_mta_features(df_hmm, n_states=N_STATES)
    X, y_raw, feature_cols, target_months = build_lstm_dataset(monthly, seq_len=SEQ_LEN)

    # 固定三類 label，避免某個 window 少一類時編碼改變。
    encoder = LabelEncoder()
    encoder.fit(np.array(["Bear", "Bull", "Sideways"]))
    y = encoder.transform(y_raw)

    windows = build_windows(len(X))
    if not windows:
        raise ValueError(
            f"資料不足：目前 LSTM samples={len(X)}，但一個完整 window 需要 "
            f"{TRAIN_MONTHS + VAL_MONTHS + TEST_MONTHS} 個月。"
        )

    print("LSTM samples:", len(X))
    print("Feature count:", len(feature_cols))
    print("Classes:", list(encoder.classes_))
    print("完整 Sliding Windows:", len(windows))

    metric_rows = []
    pred_rows = []
    cm_rows = []

    for wid, tr0, tr1, va0, va1, te0, te1 in windows:
        print("\n" + "=" * 88)
        print(f"WINDOW {wid}")
        print("=" * 88)

        X_train, y_train = X[tr0:tr1], y[tr0:tr1]
        X_val, y_val = X[va0:va1], y[va0:va1]
        X_test, y_test = X[te0:te1], y[te0:te1]
        m_train = target_months[tr0:tr1]
        m_val = target_months[va0:va1]
        m_test = target_months[te0:te1]

        print(f"Train: {m_train[0]} ~ {m_train[-1]} ({len(m_train)})")
        print(f"Val  : {m_val[0]} ~ {m_val[-1]} ({len(m_val)})")
        print(f"Test : {m_test[0]} ~ {m_test[-1]} ({len(m_test)})")

        X_train_s, X_val_s, X_test_s, _ = scale_three_way(X_train, X_val, X_test)

        K.clear_session()
        set_seed(RANDOM_SEED + wid)
        model = build_lstm_classifier(
            input_shape=(X_train_s.shape[1], X_train_s.shape[2]),
            n_classes=len(encoder.classes_),
        )
        early_stop = EarlyStopping(
            monitor="val_loss", patience=15, restore_best_weights=True
        )
        fit_kwargs = dict(
            x=X_train_s,
            y=y_train,
            validation_data=(X_val_s, y_val),
            epochs=100,
            batch_size=8,
            verbose=0,
            callbacks=[early_stop],
        )
        if USE_CLASS_WEIGHT:
            # Keras 只需要 training 中實際出現類別的 weight。
            fit_kwargs["class_weight"] = make_class_weight_dict(y_train)

        history = model.fit(**fit_kwargs)
        y_prob = model.predict(X_test_s, verbose=0)
        y_pred = np.argmax(y_prob, axis=1)

        row = metric_row(wid, m_train, m_val, m_test, y_test, y_pred, encoder)
        row["epochs_run"] = len(history.history.get("loss", []))
        metric_rows.append(row)

        print(
            f"Accuracy={row['accuracy']:.4f} | Macro F1={row['macro_f1']:.4f} | "
            f"Weighted F1={row['weighted_f1']:.4f} | Epochs={row['epochs_run']}"
        )

        labels = np.arange(len(encoder.classes_))
        cm = confusion_matrix(y_test, y_pred, labels=labels)
        for i, actual in enumerate(encoder.classes_):
            for j, predicted in enumerate(encoder.classes_):
                cm_rows.append({
                    "window": wid,
                    "actual": actual,
                    "predicted": predicted,
                    "count": int(cm[i, j]),
                })

        for k, month in enumerate(m_test):
            rec = {
                "window": wid,
                "target_month": month,
                "actual_regime": encoder.inverse_transform([y_test[k]])[0],
                "predicted_regime": encoder.inverse_transform([y_pred[k]])[0],
            }
            for c, cname in enumerate(encoder.classes_):
                rec[f"prob_{cname}"] = float(y_prob[k, c])
            pred_rows.append(rec)

    metrics = pd.DataFrame(metric_rows)
    predictions = pd.DataFrame(pred_rows)
    confusion = pd.DataFrame(cm_rows)

    metric_cols = [
        "accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_f1",
        "Bear_precision", "Bear_recall", "Bear_f1",
        "Bull_precision", "Bull_recall", "Bull_f1",
        "Sideways_precision", "Sideways_recall", "Sideways_f1",
    ]
    available = [c for c in metric_cols if c in metrics.columns]
    summary = pd.DataFrame({
        "metric": available,
        "mean": [metrics[c].mean() for c in available],
        "std": [metrics[c].std(ddof=1) for c in available],
        "min": [metrics[c].min() for c in available],
        "max": [metrics[c].max() for c in available],
    })

    metrics.to_csv("experiment_sliding_window_metrics.csv", index=False, encoding="utf-8-sig")
    predictions.to_csv("experiment_sliding_window_predictions.csv", index=False, encoding="utf-8-sig")
    confusion.to_csv("experiment_sliding_window_confusion_matrix.csv", index=False, encoding="utf-8-sig")
    summary.to_csv("experiment_sliding_window_summary.csv", index=False, encoding="utf-8-sig")

    print("\n" + "=" * 88)
    print("SLIDING WINDOW SUMMARY (Mean ± Std)")
    print("=" * 88)
    for _, r in summary.iterrows():
        print(f"{r['metric']:<22} {r['mean']:.4f} ± {r['std']:.4f}")

    print("\n已輸出：")
    print("- experiment_sliding_window_metrics.csv")
    print("- experiment_sliding_window_predictions.csv")
    print("- experiment_sliding_window_confusion_matrix.csv")
    print("- experiment_sliding_window_summary.csv")


if __name__ == "__main__":
    main()
