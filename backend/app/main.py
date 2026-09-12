from __future__ import annotations

import json
import hashlib
import math
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


BACKEND_DIR = Path(__file__).resolve().parents[1]
PIPELINE_DIR = BACKEND_DIR / "regime_invest"
PIPELINE_FILE = PIPELINE_DIR / "run_all_models_app_v2_2.py"
PROFILE_FILE = PIPELINE_DIR / "user_profile.json"
MODEL3_FILE = PIPELINE_DIR / "model_3_v5_1_final_freeze_candidate.py"
MODEL3_DISCUSSION_FILE = PIPELINE_DIR / "model_3_v5_1_discussion_output.json"
MODEL3_STATUS_FILE = PIPELINE_DIR / "model_3_runtime_status.json"
MODEL1_PREDICTION_FILE = PIPELINE_DIR / "model_1_prediction_output.csv"
MODEL1_METADATA_FILE = PIPELINE_DIR / "model_1_production_metadata.csv"
MODEL1_SCRIPT_FILE = PIPELINE_DIR / "model_1_v5_production_app_duration.py"
MODEL1_BASE_SCRIPT_FILE = PIPELINE_DIR / "hmm_mta_lstm_sliding_window_experiment.py"
MODEL1_STRICT_SCRIPT_FILE = PIPELINE_DIR / "hmm_mta_lstm_sliding_window_experiment_v4_strict_rolling.py"
MODEL1_CACHE_MANIFEST_FILE = PIPELINE_DIR / "model_1_cache_manifest.json"
MODEL1_PIPELINE_VERSION = "V5_FROZEN_STRICT_CAUSAL_T60_CW_OFF"
STOCK_DETAIL_FILE = PIPELINE_DIR / "stock_detail_historical.csv"
STOCK_DETAIL_ENCODING = "big5"
INTERFACE_CHART_FILE = PIPELINE_DIR / "介面圖表全部數據.csv"
INTERFACE_CHART_ENCODING = "big5"
MODEL_RUNTIME_TIMEOUT_SECONDS = 1800

MODEL_DEPENDENCY_LABELS = {
    "tensorflow": "tensorflow",
    "hmmlearn": "hmmlearn",
    "sklearn": "scikit-learn（sklearn）",
    "scipy": "scipy",
    "ollama": "ollama",
}

load_dotenv(PIPELINE_DIR / ".env")

app = FastAPI(
    title="StockApp Backend",
    version="0.1.0",
    description="StockApp 的投資模型 API 包裝層",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 原始 pipeline 使用固定的 user_profile.json 與固定輸出檔案，
# 因此目前限制同一時間只執行一個分析。
pipeline_lock = threading.Lock()

# 行情 CSV 在每次 `/api/investment/latest` 或個股頁請求時都會被解析。
# 這些檔案通常只有模型更新時才變動，因此保留進程內快取，並以檔案
# 的修改時間與大小作為失效條件；模型重新產生檔案後會自動讀取新資料。
data_cache_lock = threading.Lock()
_stock_detail_frame_cache: tuple[tuple[int, int], pd.DataFrame] | None = None
_interface_chart_frame_cache: tuple[tuple[int, int], pd.DataFrame] | None = None


AGENT_DISPLAY = {
    "risk_seeking": {
        "speaker": "Qwen",
        "stance": "比較重視報酬機會",
    },
    "risk_averse": {
        "speaker": "Mistral",
        "stance": "比較重視風險與現金緩衝",
    },
}

AGENT_ROUNDS = (
    ("risk_seeking_round1", "risk_seeking", 1, "RS1_"),
    ("risk_averse_round1", "risk_averse", 1, "RA1_"),
    ("risk_seeking_round2", "risk_seeking", 2, "RS2_"),
    ("risk_averse_round2", "risk_averse", 2, "RA2_"),
)

ACTION_DISPLAY = {
    "increase": "提高",
    "decrease": "降低",
    "maintain": "維持",
}

WINNING_SIDE_DISPLAY = {
    "risk_seeking": "比較重視報酬機會的觀點",
    "risk_averse": "比較重視風險控管的觀點",
}


class InvestmentProfile(BaseModel):
    budget: float = Field(gt=0)
    investor_type: Literal["small", "normal", "large"]
    risk_preference: Literal["conservative", "neutral", "aggressive"]
    allocation_preference: Literal["balanced", "moderate", "concentrated"] = "moderate"
    # 零股在登入頁預設為開啟；前端也會明確傳入此欄位。
    allow_fractional: bool = True
    preferred_stock_class: Literal[
        "low_price",
        "medium_price",
        "high_price",
        "auto",
    ] = "auto"
    top_n: int = Field(default=5, ge=1, le=20)
    zipf_s: float = Field(default=1.2, gt=0)


class AllowFractionalUpdate(BaseModel):
    """設定頁切換零股時使用的輕量更新請求。"""

    allow_fractional: bool


def read_csv_records(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(path.name)

    return json.loads(
        pd.read_csv(path).to_json(
            orient="records",
            force_ascii=False,
        )
    )


def extract_missing_dependencies(stdout: str, stderr: str) -> list[str]:
    """從管線輸出整理缺少的套件，避免把整段 traceback 丟給前端。"""
    combined = f"{stdout or ''}\n{stderr or ''}"
    marker = re.search(
        r"DEPENDENCY_CHECK_FAILED:\s*(.+)",
        combined,
    )
    if marker:
        names = [name.strip() for name in marker.group(1).split(",")]
    else:
        names = re.findall(
            r"No module named ['\"]([^'\"]+)['\"]",
            combined,
        )

    unique_names = []
    for name in names:
        if name and name not in unique_names:
            unique_names.append(name)
    return unique_names


def write_model3_status(status: str, **details: Any) -> dict:
    """記錄 Model 3 狀態，讓前端不會誤讀上一輪討論結果。"""
    payload = {
        "status": status,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        **details,
    }
    MODEL3_STATUS_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def read_model3_status() -> dict:
    """讀取 Model 3 執行狀態；狀態檔損壞時一律視為未完成。"""
    if not MODEL3_STATUS_FILE.exists():
        return {
            "status": "not_started",
            "message": "尚未啟動 AI 討論。",
        }

    try:
        data = json.loads(MODEL3_STATUS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "status": "failed",
            "message": "Model 3 狀態檔無法讀取，未使用舊討論結果。",
        }

    if not isinstance(data, dict):
        return {
            "status": "failed",
            "message": "Model 3 狀態格式錯誤，未使用舊討論結果。",
        }
    return data


STOCK_DETAIL_REQUIRED_COLUMNS = (
    "證券代碼",
    "年月日",
    "開盤價(元)",
    "最高價(元)",
    "最低價(元)",
    "收盤價(元)",
    "成交量(千股)",
    "成交值(千元)",
    "股價漲跌(元)",
    "外資買賣超(千股)",
    "投信買賣超(千股)",
    "自營買賣超(千股)",
    "流通在外股數(千股)",
    "融資餘額(千元)",
    "融券餘額(千元)",
    "融券增減(千元)",
    "融資增減(千元)",
    "外資買賣超市值(百萬)",
    "TSE 產業別",
    "上市別",
    "市值(百萬元)",
    "週轉率％",
)

STOCK_DETAIL_NUMERIC_COLUMNS = tuple(
    column
    for column in STOCK_DETAIL_REQUIRED_COLUMNS
    if column not in {"證券代碼", "年月日", "TSE 產業別", "上市別"}
)

INTERFACE_CHART_REQUIRED_COLUMNS = (
    "證券代碼",
    "年月日",
    "開盤價(元)",
    "最高價(元)",
    "最低價(元)",
    "收盤價(元)",
    "報酬率％",
    "股價漲跌(元)",
    "成交量(千股)",
    "外資買賣超(千股)",
    "自營買賣超(千股)",
    "投信買賣超(千股)",
    "合計買賣超(千股)",
    "融資餘額(張)",
    "融券餘額(張)",
    "券資比",
)

INTERFACE_CHART_NUMERIC_COLUMNS = tuple(
    column
    for column in INTERFACE_CHART_REQUIRED_COLUMNS
    if column not in {"證券代碼", "年月日"}
)


def csv_file_signature(path: Path) -> tuple[int, int]:
    stat = path.stat()
    return stat.st_mtime_ns, stat.st_size


def resolve_pipeline_file(value: str) -> Path:
    """將 .env 中的相對路徑解讀為 regime_invest 目錄下的檔案。"""
    candidate = Path(value)
    return candidate if candidate.is_absolute() else PIPELINE_DIR / candidate


def model1_csv_source_files() -> list[Path]:
    """回傳 CSV 模式會實際讀取的兩個 Model 1 資料檔。"""
    data_source = os.getenv("MODEL1_DATA_SOURCE", "csv").strip().lower()
    if data_source != "csv":
        return []

    history_name = os.getenv(
        "HISTORY_CSV_PATH",
        "加權指數2014-2025.csv",
    ).strip()
    future_name = os.getenv(
        "MODEL1_2026_CSV",
        "加權指數2026.csv",
    ).strip()
    return [
        resolve_pipeline_file(history_name),
        resolve_pipeline_file(future_name),
    ]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_fingerprint(path: Path) -> dict[str, Any]:
    """建立可偵測內容變更的檔案指紋，而不只依賴修改時間。"""
    try:
        stat = path.stat()
        return {
            "path": str(path.resolve()),
            "exists": path.is_file(),
            "size": stat.st_size,
            "mtime_ns": stat.st_mtime_ns,
            "sha256": sha256_file(path),
        }
    except (OSError, ValueError) as exc:
        return {
            "path": str(path.resolve()),
            "exists": False,
            "error": str(exc),
        }


def build_model1_cache_manifest() -> dict[str, Any]:
    """描述 Model 1 的資料、程式碼與執行設定，供快取比對使用。"""
    data_source = os.getenv("MODEL1_DATA_SOURCE", "csv").strip().lower()
    code_files = [
        MODEL1_SCRIPT_FILE,
        MODEL1_BASE_SCRIPT_FILE,
        MODEL1_STRICT_SCRIPT_FILE,
    ]
    return {
        "data_source": data_source,
        "pipeline_version": MODEL1_PIPELINE_VERSION,
        "python": {
            "executable": str(Path(sys.executable).resolve()),
            "version": sys.version.split()[0],
        },
        "settings": {
            "history_csv_path": os.getenv(
                "HISTORY_CSV_PATH",
                "加權指數2014-2025.csv",
            ),
            "model1_2026_csv": os.getenv(
                "MODEL1_2026_CSV",
                "加權指數2026.csv",
            ),
            "exp_start_date": os.getenv(
                "EXP_START_DATE",
                "2016-01-01",
            ),
        },
        "source_files": [
            file_fingerprint(path)
            for path in model1_csv_source_files()
        ],
        "code_files": [
            file_fingerprint(path)
            for path in code_files
        ],
    }


def model1_cache_is_valid(current_manifest: dict[str, Any]) -> bool:
    """只有 CSV 來源、檔案未變更且 Model 1 輸出完整時才允許重用。"""
    if current_manifest.get("data_source") != "csv":
        return False

    if any(
        not source.get("exists")
        for source in current_manifest.get("source_files", [])
    ):
        return False

    if not all(
        path.exists() and path.stat().st_size > 0
        for path in (MODEL1_PREDICTION_FILE, MODEL1_METADATA_FILE)
    ):
        return False

    if not MODEL1_CACHE_MANIFEST_FILE.exists():
        return False

    try:
        saved_manifest = json.loads(
            MODEL1_CACHE_MANIFEST_FILE.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError):
        return False

    return saved_manifest == current_manifest


def write_model1_cache_manifest(manifest: dict[str, Any]) -> None:
    MODEL1_CACHE_MANIFEST_FILE.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def read_stock_detail_frame() -> pd.DataFrame:
    """讀取 StockDetail 專用資料，並統一股票代號與數值欄位。"""
    global _stock_detail_frame_cache

    signature = csv_file_signature(STOCK_DETAIL_FILE)
    cached = _stock_detail_frame_cache
    if cached and cached[0] == signature:
        return cached[1]

    with data_cache_lock:
        # 另一個請求可能已經在鎖內完成相同檔案的讀取。
        cached = _stock_detail_frame_cache
        if cached and cached[0] == signature:
            return cached[1]

        frame = pd.read_csv(
            STOCK_DETAIL_FILE,
            encoding=STOCK_DETAIL_ENCODING,
            dtype={"證券代碼": str},
            thousands=",",
        )
        missing = [
            column
            for column in STOCK_DETAIL_REQUIRED_COLUMNS
            if column not in frame.columns
        ]
        if missing:
            raise ValueError(
                f"{STOCK_DETAIL_FILE.name} 缺少欄位：{', '.join(missing)}"
            )

        raw_code = frame["證券代碼"].astype(str).str.strip()
        frame["stock_id"] = raw_code.str.extract(r"^(\S+)", expand=False)
        frame["stock_name"] = raw_code.str.replace(
            r"^\S+\s*",
            "",
            regex=True,
        )
        frame["date"] = pd.to_datetime(frame["年月日"], errors="coerce")

        for column in STOCK_DETAIL_NUMERIC_COLUMNS:
            frame[column] = pd.to_numeric(
                frame[column].astype(str).str.replace(",", "", regex=False),
                errors="coerce",
            )

        frame = frame.dropna(subset=["stock_id", "date"])
        _stock_detail_frame_cache = (signature, frame)
        return frame


def read_interface_chart_frame() -> pd.DataFrame:
    """讀取介面圖表 CSV，統一股票代號、日期與數值欄位。"""
    global _interface_chart_frame_cache

    signature = csv_file_signature(INTERFACE_CHART_FILE)
    cached = _interface_chart_frame_cache
    if cached and cached[0] == signature:
        return cached[1]

    with data_cache_lock:
        cached = _interface_chart_frame_cache
        if cached and cached[0] == signature:
            return cached[1]

        frame = pd.read_csv(
            INTERFACE_CHART_FILE,
            encoding=INTERFACE_CHART_ENCODING,
            dtype={"證券代碼": str},
            thousands=",",
        )
        missing = [
            column
            for column in INTERFACE_CHART_REQUIRED_COLUMNS
            if column not in frame.columns
        ]
        if missing:
            raise ValueError(
                f"{INTERFACE_CHART_FILE.name} 缺少欄位：{', '.join(missing)}"
            )

        raw_code = frame["證券代碼"].astype(str).str.strip()
        frame["stock_id"] = raw_code.str.extract(r"^(\S+)", expand=False)
        frame["stock_name"] = raw_code.str.replace(
            r"^\S+\s*",
            "",
            regex=True,
        )
        frame["date"] = pd.to_datetime(frame["年月日"], errors="coerce")

        for column in INTERFACE_CHART_NUMERIC_COLUMNS:
            frame[column] = pd.to_numeric(
                frame[column].astype(str).str.replace(",", "", regex=False),
                errors="coerce",
            )

        frame = frame.dropna(subset=["stock_id", "date"])
        _interface_chart_frame_cache = (signature, frame)
        return frame


def stock_detail_number(row: pd.Series, column: str) -> float | None:
    value = row.get(column)
    if value is None or pd.isna(value):
        return None
    return float(value)


def build_stock_detail(row: pd.Series) -> dict:
    """把 CSV 最新一列轉成前端 StockDetail 使用的欄位。"""
    return {
        "symbol": str(row["stock_id"]),
        "name": str(row["stock_name"]),
        "date": row["date"].strftime("%Y-%m-%d"),
        "open": stock_detail_number(row, "開盤價(元)"),
        "high": stock_detail_number(row, "最高價(元)"),
        "low": stock_detail_number(row, "最低價(元)"),
        "close": stock_detail_number(row, "收盤價(元)"),
        "volume": stock_detail_number(row, "成交量(千股)"),
        "turnoverValue": stock_detail_number(row, "成交值(千元)"),
        "change": stock_detail_number(row, "股價漲跌(元)"),
        "foreignNet": stock_detail_number(row, "外資買賣超(千股)"),
        "investmentTrustNet": stock_detail_number(row, "投信買賣超(千股)"),
        "dealerNet": stock_detail_number(row, "自營買賣超(千股)"),
        "sharesOutstanding": stock_detail_number(row, "流通在外股數(千股)"),
        "marginBalance": stock_detail_number(row, "融資餘額(千元)"),
        "shortBalance": stock_detail_number(row, "融券餘額(千元)"),
        "shortChange": stock_detail_number(row, "融券增減(千元)"),
        "marginChange": stock_detail_number(row, "融資增減(千元)"),
        "foreignMarketValue": stock_detail_number(row, "外資買賣超市值(百萬)"),
        "industryCode": str(row["TSE 產業別"]),
        "listing": str(row["上市別"]),
        "marketCap": stock_detail_number(row, "市值(百萬元)"),
        "turnoverRate": stock_detail_number(row, "週轉率％"),
        "source": STOCK_DETAIL_FILE.name,
    }


def build_stock_chart_data(
    frame: pd.DataFrame,
    stock_id: str,
    limit: int = 90,
) -> dict:
    """把 StockDetail CSV 轉成個股三種圖表共用的時間序列。"""
    matched = frame[frame["stock_id"] == stock_id].sort_values("date").copy()
    if matched.empty:
        raise KeyError(stock_id)

    limit = max(30, min(int(limit), 120))
    close_series = matched["收盤價(元)"]
    for window in (5, 20, 60):
        matched[f"ma{window}"] = close_series.rolling(
            window,
            min_periods=1,
        ).mean()
    matched["return_percent"] = close_series.pct_change(fill_method=None) * 100
    matched["total_institutional_net"] = matched[
        [
            "外資買賣超(千股)",
            "投信買賣超(千股)",
            "自營買賣超(千股)",
        ]
    ].sum(axis=1, min_count=1)
    matched["institutional_cumulative"] = (
        matched["total_institutional_net"].fillna(0).cumsum()
    )
    margin_balance = matched["融資餘額(千元)"]
    matched["short_ratio"] = (
        matched["融券餘額(千元)"]
        .div(margin_balance.where(margin_balance.ne(0)))
        .mul(100)
    )

    recent = matched.tail(limit)
    points = []
    for _, row in recent.iterrows():
        points.append(
            {
                "date": row["date"].strftime("%Y-%m-%d"),
                "open": stock_detail_number(row, "開盤價(元)"),
                "high": stock_detail_number(row, "最高價(元)"),
                "low": stock_detail_number(row, "最低價(元)"),
                "close": stock_detail_number(row, "收盤價(元)"),
                "returnPercent": stock_detail_number(row, "return_percent"),
                "change": stock_detail_number(row, "股價漲跌(元)"),
                "volume": stock_detail_number(row, "成交量(千股)"),
                "ma5": stock_detail_number(row, "ma5"),
                "ma20": stock_detail_number(row, "ma20"),
                "ma60": stock_detail_number(row, "ma60"),
                "foreignNet": stock_detail_number(row, "外資買賣超(千股)"),
                "dealerNet": stock_detail_number(row, "自營買賣超(千股)"),
                "investmentTrustNet": stock_detail_number(row, "投信買賣超(千股)"),
                "totalInstitutionalNet": stock_detail_number(
                    row,
                    "total_institutional_net",
                ),
                "institutionalCumulative": stock_detail_number(
                    row,
                    "institutional_cumulative",
                ),
                "marginBalance": stock_detail_number(row, "融資餘額(千元)"),
                "shortBalance": stock_detail_number(row, "融券餘額(千元)"),
                "marginChange": stock_detail_number(row, "融資增減(千元)"),
                "shortChange": stock_detail_number(row, "融券增減(千元)"),
                "shortRatio": stock_detail_number(row, "short_ratio"),
            }
        )

    return {
        "symbol": stock_id,
        "name": str(matched.iloc[-1]["stock_name"]),
        "source": STOCK_DETAIL_FILE.name,
        "lookback": len(points),
        "points": points,
    }


def latest_market_snapshot() -> dict | None:
    """取得加權指數在行情檔中的最新一筆資料。

    模型輸出提供市場狀態與機率，但主頁摘要還需要目前指數的收盤與漲跌。
    這些欄位來自同一份 StockDetail 行情檔；若檔案暫時不可用，不影響原本
    /api/investment/latest 回傳模型結果。
    """
    try:
        frame = read_stock_detail_frame()
    except (
        FileNotFoundError,
        UnicodeDecodeError,
        pd.errors.ParserError,
        ValueError,
        OSError,
    ):
        return None

    matched = frame[frame["stock_id"] == "Y9999"].sort_values("date")
    if matched.empty:
        return None

    return build_stock_detail(matched.iloc[-1])


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return default if math.isnan(number) else number


def normalize_asset_id(value: Any) -> str:
    """讓 CSV/JSON 中的 2330、2330.0 與 2330 可以互相比對。"""
    if value is None:
        return ""
    number = safe_float(value, default=math.nan)
    if not math.isnan(number) and number.is_integer():
        return str(int(number))
    return str(value).strip()


def join_chinese(items: list[str]) -> str:
    values = [str(item) for item in items if str(item)]
    if not values:
        return "無"
    if len(values) == 1:
        return values[0]
    return "、".join(values[:-1]) + "以及" + values[-1]


def portfolio_rows_by_asset(portfolio_rows: list[dict]) -> dict[str, dict]:
    return {
        normalize_asset_id(row.get("stock_id")): row
        for row in portfolio_rows
    }


def asset_label(asset_id: Any, rows_by_asset: dict[str, dict]) -> str:
    normalized_id = normalize_asset_id(asset_id)
    if normalized_id.upper() == "CASH":
        return "現金"

    row = rows_by_asset.get(normalized_id, {})
    name = str(row.get("name", "")).strip()
    return f"{name}（{normalized_id}）" if name else normalized_id


def portfolio_stats(portfolio_rows: list[dict]) -> dict[str, float]:
    stock_weights: list[float] = []
    cash_weight = 0.0

    for row in portfolio_rows:
        weight = safe_float(row.get("final_weight_percent"))
        asset_type = str(row.get("asset_type", "")).lower()
        if asset_type == "cash" or normalize_asset_id(row.get("stock_id")).upper() == "CASH":
            cash_weight += weight
        elif weight > 0:
            stock_weights.append(weight)

    stock_weights.sort(reverse=True)
    return {
        "cash": cash_weight,
        "top2": sum(stock_weights[:2]),
        "hhi": sum((weight / 100.0) ** 2 for weight in stock_weights),
    }


def evidence_rank(evidence_id: str) -> int | None:
    try:
        return int(evidence_id.rsplit("_", 1)[1])
    except (IndexError, ValueError):
        return None


def metric_for_asset(
    rows_by_asset: dict[str, dict],
    asset_id: Any,
    column: str,
) -> float | None:
    row = rows_by_asset.get(normalize_asset_id(asset_id), {})
    if column not in row:
        return None
    value = safe_float(row.get(column), default=math.nan)
    return None if math.isnan(value) else value


def natural_evidence_text(
    evidence_id: str,
    evidence: dict,
    market: dict,
    portfolio_rows: list[dict],
    rows_by_asset: dict[str, dict],
) -> str:
    """將既有 evidence catalog 轉成一般使用者看得懂的說法。"""
    stats = portfolio_stats(portfolio_rows)
    kind = evidence.get("kind")

    if evidence_id == "REGIME_1":
        return (
            f"市場目前處於 {market.get('predicted_regime', '未知')} 狀態，"
            f"Bear、Bull 與 Sideways 機率分別為 "
            f"{safe_float(market.get('prob_Bear')):.2%}、"
            f"{safe_float(market.get('prob_Bull')):.2%} 以及 "
            f"{safe_float(market.get('prob_Sideways')):.2%}"
        )

    if evidence_id == "DURATION_1":
        return (
            f"模型預估目前市場狀態約會持續 "
            f"{safe_float(market.get('expected_regime_duration_steps')):.2f} "
            "個觀察步驟（HMM steps）"
        )

    if evidence_id == "MTA_1":
        return (
            f"模型估計市場轉向 Bear 約需 "
            f"{safe_float(market.get('mta_to_bear_steps')):.2f} 個觀察步驟（HMM steps）"
        )

    if evidence_id == "CASH_1":
        return f"目前現金配置比例為 {stats['cash']:.2f}%"

    if evidence_id == "CONC_1":
        return f"前兩大股票的配置比例合計為 {stats['top2']:.2f}%"

    if evidence_id == "CONC_2":
        return f"股票配置的集中度 HHI 為 {stats['hhi']:.4f}"

    if kind in {"expected_return", "risk", "selection_score"}:
        asset_id = evidence.get("asset", "")
        label = asset_label(asset_id, rows_by_asset)
        rank = evidence_rank(evidence_id)
        metric_name = {
            "expected_return": "預期報酬指標",
            "risk": "風險指標",
            "selection_score": "選股分數",
        }[kind]
        column = {
            "expected_return": "expected_return",
            "risk": "risk",
            "selection_score": "selection_score",
        }[kind]
        value = metric_for_asset(rows_by_asset, asset_id, column)

        if value is None:
            return str(evidence.get("text", evidence_id))

        if kind == "expected_return":
            value_text = f"{value:.2%}（原始值 {value:.6f}）"
        else:
            value_text = f"{value:.6f}"

        rank_text = f"，排名第 {rank}" if rank is not None else ""
        if kind == "risk" and rank == 1:
            rank_text = "，目前股票中風險最高"
        elif kind == "risk" and rank is not None:
            rank_text = f"，風險排名第 {rank}"

        return f"{label}的{metric_name}為 {value_text}{rank_text}"

    if kind == "weight":
        asset_id = evidence.get("asset", "")
        row = rows_by_asset.get(normalize_asset_id(asset_id), {})
        weight = safe_float(row.get("final_weight_percent"))
        return f"{asset_label(asset_id, rows_by_asset)}的原始配置比例為 {weight:.2f}%"

    return str(evidence.get("text", evidence_id))


def natural_direction_text(
    directions: dict,
    rows_by_asset: dict[str, dict],
) -> str:
    items = [
        f"{asset_label(asset_id, rows_by_asset)}{ACTION_DISPLAY.get(action, action)}"
        for asset_id, action in directions.items()
    ]
    return join_chinese(items)


def natural_claim_text(claim: dict, rows_by_asset: dict[str, dict]) -> str:
    """把 Claim 的內部資料轉成不含技術 ID 的簡短說法。"""
    if not isinstance(claim, dict):
        return "一項配置觀點"

    asset = asset_label(claim.get("asset"), rows_by_asset)
    action = ACTION_DISPLAY.get(claim.get("direction"), claim.get("direction", "調整"))
    return f"將{asset}{action}配置"


def natural_claims_text(
    claim_ids: list[str],
    claims: dict,
    rows_by_asset: dict[str, dict],
) -> str:
    summaries = [
        natural_claim_text(claims[claim_id], rows_by_asset)
        for claim_id in claim_ids
        if claim_id in claims
    ]
    return join_chinese(summaries)


def build_agent_message(
    key: str,
    role: str,
    round_number: int,
    claim_prefix: str,
    decision: dict,
    discussion: dict,
    market: dict,
    portfolio_rows: list[dict],
) -> dict:
    catalog = discussion.get("evidence_catalog", {})
    all_claims = discussion.get("claims", {})
    rows_by_asset = portfolio_rows_by_asset(portfolio_rows)
    display = AGENT_DISPLAY[role]

    evidence_ids = list(decision.get("evidence_ids", []))
    evidence_records = [
        catalog[evidence_id]
        for evidence_id in evidence_ids
        if evidence_id in catalog
    ]
    evidence_sentences = [
        natural_evidence_text(
            evidence_id,
            catalog[evidence_id],
            market,
            portfolio_rows,
            rows_by_asset,
        )
        for evidence_id in evidence_ids
        if evidence_id in catalog
    ]

    preferred = asset_label(decision.get("preferred_asset"), rows_by_asset)
    avoid = asset_label(decision.get("avoid_asset"), rows_by_asset)
    cash_action = decision.get(
        "cash_direction",
        decision.get("directions", {}).get("CASH", "maintain"),
    )

    paragraphs = [
        (
            f"{display['speaker']} 在第 {round_number} 輪討論中表示，"
            f"它比較看好 {preferred}，並優先控制 {avoid}；"
            f"現金方向為{ACTION_DISPLAY.get(cash_action, cash_action)}，"
            f"整體立場是「{display['stance']}」。"
        ),
        (
            f"為支持這項判斷，它引用了以下資料："
            f"{join_chinese(evidence_sentences)}。"
        ),
        (
            f"在各部位的配置方向上，它建議："
            f"{natural_direction_text(decision.get('directions', {}), rows_by_asset)}。"
        ),
    ]

    accepted_text = ""
    rebutted_text = ""
    if "accepted_opponent_claim_ids" in decision:
        accepted_ids = decision.get("accepted_opponent_claim_ids", [])
        rebutted_ids = decision.get("rebutted_opponent_claim_ids", [])
        accepted_text = natural_claims_text(accepted_ids, all_claims, rows_by_asset)
        rebutted_text = natural_claims_text(rebutted_ids, all_claims, rows_by_asset)
        paragraphs.append(
            f"在回應對方時，它認同對方提出的「{accepted_text}」，"
            f"但對「{rebutted_text}」提出不同看法。"
        )

    claim_records = {
        claim_id: claim
        for claim_id, claim in all_claims.items()
        if claim_id.startswith(claim_prefix)
    }
    if claim_records:
        paragraphs.append(
            f"本輪形成的配置觀點包括："
            f"{natural_claims_text(list(claim_records), claim_records, rows_by_asset)}。"
        )

    model_name = discussion.get("models", {}).get(role)
    return {
        "id": key,
        "type": "agent",
        "speaker": display["speaker"],
        "model": model_name,
        "role": role,
        "round": round_number,
        "text": "\n\n".join(paragraphs),
        "evidence_ids": evidence_ids,
        "evidence": evidence_records,
        "evidence_display": evidence_sentences,
        "decision": decision,
        "decision_display": {
            "preferred": preferred,
            "avoid": avoid,
            "cash_direction": ACTION_DISPLAY.get(cash_action, cash_action),
            "stance": display["stance"],
            "directions": natural_direction_text(
                decision.get("directions", {}),
                rows_by_asset,
            ),
            "accepted_opponent": accepted_text,
            "rebutted_opponent": rebutted_text,
        },
        "claims": claim_records,
        "claims_display": [
            natural_claim_text(claim, rows_by_asset)
            for claim in claim_records.values()
        ],
        "original_rendered_text": discussion.get("rendered_discussion", {}).get(key, ""),
    }


def build_judge_message(
    discussion: dict,
    market: dict,
    portfolio_rows: list[dict],
) -> dict:
    decision = discussion.get("structured_decisions", {}).get("judge", {})
    catalog = discussion.get("evidence_catalog", {})
    rows_by_asset = portfolio_rows_by_asset(portfolio_rows)
    evidence_ids = list(decision.get("accepted_evidence_ids", []))
    evidence_records = [
        catalog[evidence_id]
        for evidence_id in evidence_ids
        if evidence_id in catalog
    ]
    evidence_sentences = [
        natural_evidence_text(
            evidence_id,
            catalog[evidence_id],
            market,
            portfolio_rows,
            rows_by_asset,
        )
        for evidence_id in evidence_ids
        if evidence_id in catalog
    ]

    increase = join_chinese([
        asset_label(asset_id, rows_by_asset)
        for asset_id in decision.get("increase", [])
    ])
    decrease = join_chinese([
        asset_label(asset_id, rows_by_asset)
        for asset_id in decision.get("decrease", [])
    ])
    claims = discussion.get("claims", {})
    rejected_claims = natural_claims_text(
        decision.get("rejected_claim_ids", []),
        claims,
        rows_by_asset,
    )
    winning_side = WINNING_SIDE_DISPLAY.get(
        decision.get("winning_side"),
        "綜合兩方觀點",
    )

    text = (
        f"Llama Judge 綜合兩個模型的意見後，認為本次分析「{decision.get('evaluation', '未提供')}」，"
        f"配置處置為「{decision.get('action', '未提供')}」。"
        f"它建議相對提高 {increase}，降低 {decrease}；"
        f"最後較採納{winning_side}。\n\n"
        f"Judge 參考的資料包括：{join_chinese(evidence_sentences)}。"
        f"未採納的觀點包括：{rejected_claims}。\n\n"
        "需要注意的是，Model 3 只評估相對方向，實際股票與現金的數值配置仍以 Model 2 的結果為準。"
    )

    return {
        "id": "judge",
        "type": "judge",
        "speaker": "Llama Judge",
        "model": discussion.get("models", {}).get("judge"),
        "role": "judge",
        "round": 0,
        "text": text,
        "evidence_ids": evidence_ids,
        "evidence": evidence_records,
        "evidence_display": evidence_sentences,
        "decision": decision,
        "decision_display": {
            "evaluation": decision.get("evaluation", "未提供"),
            "action": decision.get("action", "未提供"),
            "increase": increase,
            "decrease": decrease,
            "winning_side": winning_side,
            "rejected_claims": rejected_claims,
        },
        "claims": {
            claim_id: claims.get(claim_id)
            for claim_id in decision.get("rejected_claim_ids", [])
            if claim_id in claims
        },
        "claims_display": [
            natural_claim_text(claims[claim_id], rows_by_asset)
            for claim_id in decision.get("rejected_claim_ids", [])
            if claim_id in claims
        ],
        "original_rendered_text": discussion.get("rendered_discussion", {}).get("judge", ""),
    }


def build_discussion_messages(
    discussion: dict,
    market: dict,
    portfolio_rows: list[dict],
    profile: dict | None,
) -> list[dict]:
    """保留原始 JSON，另外提供適合聊天泡泡的自然語句。"""
    structured = discussion.get("structured_decisions", {})
    if not structured:
        return []

    probability_text = (
        f"Bear {safe_float(market.get('prob_Bear')):.2%}、"
        f"Bull {safe_float(market.get('prob_Bull')):.2%}、"
        f"Sideways {safe_float(market.get('prob_Sideways')):.2%}"
    )
    profile_text = ""
    if profile:
        budget = safe_float(profile.get("budget"))
        risk = profile.get("risk_preference")
        if budget > 0 and risk:
            profile_text = f"本次投資金額為 {budget:,.0f} 元，風險偏好為 {risk}。"

    stats = portfolio_stats(portfolio_rows)
    intro_text = (
        f"本次投資會議針對 {market.get('target_month', '目前月份')} 的配置進行討論。"
        f"市場目前預測為 {market.get('predicted_regime', '未知')}，"
        f"Bear、Bull 與 Sideways 機率為 {probability_text}。"
        f"目前現金配置約為 {stats['cash']:.2f}%。"
        f"{profile_text}接下來由 Qwen 與 Mistral 分別提出觀點，再由 Llama Judge 做最後評估。"
    )
    messages = [{
        "id": "moderator_intro",
        "type": "moderator",
        "speaker": "主持人",
        "model": None,
        "role": "moderator",
        "round": 0,
        "text": intro_text,
        "evidence_ids": [],
        "evidence": [],
        "decision": None,
        "claims": {},
    }]

    for key, role, round_number, claim_prefix in AGENT_ROUNDS:
        decision = structured.get(key)
        if decision:
            messages.append(
                build_agent_message(
                    key,
                    role,
                    round_number,
                    claim_prefix,
                    decision,
                    discussion,
                    market,
                    portfolio_rows,
                )
            )

    if structured.get("judge"):
        messages.append(build_judge_message(discussion, market, portfolio_rows))

    return messages


def build_result(profile: dict | None = None) -> dict:
    market_rows = read_csv_records(
        PIPELINE_DIR / "model_1_prediction_output.csv"
    )
    portfolio_rows = read_csv_records(
        PIPELINE_DIR / "portfolio_allocation_output.csv"
    )

    market = (
        max(
            market_rows,
            key=lambda row: str(row.get("target_month", "")),
        )
        if market_rows
        else {}
    )

    # Model 3 is optional.  Only expose a discussion when the status file says
    # that it was completed for this exact profile.  An older JSON output must
    # never silently reappear after a new Model 1/2 run.
    discussion_status = read_model3_status()
    discussion = None
    if (
        discussion_status.get("status") == "completed"
        and discussion_status.get("profile") == profile
        and MODEL3_DISCUSSION_FILE.exists()
    ):
        try:
            discussion = json.loads(
                MODEL3_DISCUSSION_FILE.read_text(encoding="utf-8")
            )
            if not isinstance(discussion, dict):
                raise ValueError("Model 3 討論結果不是 JSON object")
            discussion["messages"] = build_discussion_messages(
                discussion,
                market,
                portfolio_rows,
                profile,
            )
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            discussion = None
            discussion_status = {
                **discussion_status,
                "status": "failed",
                "message": f"Model 3 討論結果無法讀取：{exc}；未使用舊結果。",
            }

    return {
        "profile": profile,
        "market": market or None,
        "market_snapshot": latest_market_snapshot(),
        "portfolio": portfolio_rows,
        "discussion": discussion,
        "discussion_status": discussion_status,
    }


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "pipeline_exists": PIPELINE_FILE.exists(),
        "pipeline_dir": str(PIPELINE_DIR),
    }


@app.patch("/api/settings/allow-fractional")
def update_allow_fractional(setting: AllowFractionalUpdate) -> dict:
    """只保存零股設定，不重新執行完整投資模型。"""
    if not PROFILE_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="尚未建立使用者投資設定，請先完成登入設定。",
        )

    with pipeline_lock:
        try:
            profile_data = json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"使用者投資設定無法讀取：{exc}",
            ) from exc

        if not isinstance(profile_data, dict):
            raise HTTPException(
                status_code=500,
                detail="使用者投資設定格式錯誤。",
            )

        profile_data["allow_fractional"] = setting.allow_fractional
        try:
            PROFILE_FILE.write_text(
                json.dumps(profile_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            # 目前的資金配置仍是切換前的結果，避免前端誤以為已重算。
            write_model3_status(
                "not_started",
                profile=profile_data,
                message="零股設定已更新；尚未重新產生資金配置。",
            )
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"使用者投資設定無法保存：{exc}",
            ) from exc

    return {
        "allow_fractional": profile_data["allow_fractional"],
        "profile": profile_data,
    }


@app.get("/api/stocks/{stock_id}/detail")
def latest_stock_detail(stock_id: str) -> dict:
    """回傳指定股票在資料檔中的最新交易日行情。"""
    try:
        frame = read_stock_detail_frame()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"找不到個股資料檔：{exc}",
        ) from exc
    except (UnicodeDecodeError, pd.errors.ParserError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"個股資料檔格式錯誤：{exc}",
        ) from exc

    normalized_id = normalize_asset_id(stock_id)
    matched = frame[frame["stock_id"] == normalized_id].sort_values("date")
    if matched.empty:
        raise HTTPException(
            status_code=404,
            detail=f"找不到股票代號：{stock_id}",
        )

    return {
        "data": build_stock_detail(matched.iloc[-1]),
    }


@app.get("/api/stocks/{stock_id}/charts")
def latest_stock_charts(stock_id: str, limit: int = 90) -> dict:
    """回傳指定股票近期 K 線、法人與融資融券圖表資料。"""
    try:
        frame = read_stock_detail_frame()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"找不到個股資料檔：{exc}",
        ) from exc
    except (UnicodeDecodeError, pd.errors.ParserError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"個股資料檔格式錯誤：{exc}",
        ) from exc

    normalized_id = normalize_asset_id(stock_id)
    if frame[frame["stock_id"] == normalized_id].empty:
        raise HTTPException(
            status_code=404,
            detail=f"找不到股票圖表資料：{stock_id}",
        )

    return {
        "data": build_stock_chart_data(frame, normalized_id, limit),
    }


@app.get("/api/investment/latest")
def latest_investment() -> dict:
    try:
        profile = None
        if PROFILE_FILE.exists():
            profile = json.loads(
                PROFILE_FILE.read_text(encoding="utf-8")
            )
        return build_result(profile)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"尚未產生完整模型結果：{exc}",
        ) from exc
    except (json.JSONDecodeError, pd.errors.ParserError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"模型輸出格式錯誤：{exc}",
        ) from exc


@app.post("/api/investment/run")
def run_investment(profile: InvestmentProfile) -> dict:
    if not PIPELINE_FILE.exists():
        raise HTTPException(
            status_code=500,
            detail=f"找不到模型管線：{PIPELINE_FILE}",
        )

    profile_data = profile.model_dump()
    cache_manifest: dict[str, Any] | None = None
    reuse_model1 = False

    with pipeline_lock:
        cache_manifest = build_model1_cache_manifest()
        reuse_model1 = model1_cache_is_valid(cache_manifest)

        PROFILE_FILE.write_text(
            json.dumps(
                profile_data,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        # A new profile invalidates any previous Model 3 discussion.  The
        # portfolio run below intentionally stops after Model 2.
        write_model3_status(
            "not_started",
            profile=profile_data,
            message="配置已重新產生；尚未啟動 AI 討論。",
        )

        process_env = os.environ.copy()
        process_env["PYTHONUTF8"] = "1"
        process_env["STOCKAPP_RUN_MODEL3"] = "0"
        process_env["STOCKAPP_REUSE_MODEL1"] = "1" if reuse_model1 else "0"

        try:
            result = subprocess.run(
                [
                    sys.executable,
                    str(PIPELINE_FILE),
                ],
                cwd=str(PIPELINE_DIR),
                env=process_env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=MODEL_RUNTIME_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=504,
                detail="Model 1/2 執行超過 30 分鐘，已停止本次配置分析。",
            ) from exc

    if result.returncode != 0:
        missing_dependencies = extract_missing_dependencies(
            result.stdout,
            result.stderr,
        )
        if missing_dependencies:
            display_names = [
                MODEL_DEPENDENCY_LABELS.get(name, name)
                for name in missing_dependencies
            ]
            raise HTTPException(
                status_code=500,
                detail={
                    "message": "模型依賴未準備完成",
                    "user_message": (
                        "目前缺少模型依賴："
                        + "、".join(display_names)
                        + "。未使用舊結果，已停止本次分析；"
                        "請先安裝後端 requirements.txt 後重新啟動後端。"
                    ),
                    "missing_dependencies": missing_dependencies,
                    "python": sys.executable,
                    "python_version": sys.version.split()[0],
                    "return_code": result.returncode,
                },
            )

        raise HTTPException(
            status_code=500,
            detail={
                "message": "模型管線執行失敗",
                "user_message": "模型管線執行失敗，請查看後端終端機記錄。",
                "return_code": result.returncode,
                "diagnostic": (result.stderr or result.stdout)[-2000:],
            },
        )

    try:
        payload = build_result(profile_data)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"模型完成但找不到輸出檔：{exc}",
        ) from exc

    # 只有整條 Model 1/2 管線成功，而且執行期間資料與程式碼都沒有
    # 被手動更新，才建立新的快取基準。下一次使用者改寫 2026 CSV
    # 時，內容 hash 不同就會自動重新執行 Model 1。
    if not reuse_model1 and cache_manifest is not None:
        latest_manifest = build_model1_cache_manifest()
        if latest_manifest == cache_manifest:
            write_model1_cache_manifest(latest_manifest)

    return payload


@app.post("/api/investment/discussion")
def run_investment_discussion() -> dict:
    """使用目前 Model 1/2 結果，手動啟動一次 Model 3 討論。"""
    if not MODEL3_FILE.exists():
        raise HTTPException(
            status_code=500,
            detail=f"找不到 Model 3 管線：{MODEL3_FILE}",
        )

    if not PROFILE_FILE.exists():
        raise HTTPException(
            status_code=400,
            detail="尚未完成登入配置，無法啟動 AI 討論。",
        )

    try:
        profile_data = json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"目前使用者設定無法讀取：{exc}",
        ) from exc

    started_epoch = time.time()

    with pipeline_lock:
        current_status = read_model3_status()
        if current_status.get("status") == "running":
            raise HTTPException(
                status_code=409,
                detail="Model 3 討論正在執行中，請稍候。",
            )

        write_model3_status(
            "running",
            profile=profile_data,
            started_at=datetime.now().isoformat(timespec="seconds"),
            message="正在執行 Model 3 AI 討論。",
        )

        process_env = os.environ.copy()
        process_env["PYTHONUTF8"] = "1"

        try:
            result = subprocess.run(
                [sys.executable, str(MODEL3_FILE)],
                cwd=str(PIPELINE_DIR),
                env=process_env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=MODEL_RUNTIME_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            write_model3_status(
                "failed",
                profile=profile_data,
                message="Model 3 執行超過 30 分鐘；未使用舊討論結果。",
            )
            raise HTTPException(
                status_code=504,
                detail="Model 3 執行超過 30 分鐘，未使用舊討論結果。",
            ) from exc

        if result.returncode != 0:
            missing_dependencies = extract_missing_dependencies(
                result.stdout,
                result.stderr,
            )
            diagnostic = (result.stderr or result.stdout)[-2000:]
            if missing_dependencies:
                display_names = [
                    MODEL_DEPENDENCY_LABELS.get(name, name)
                    for name in missing_dependencies
                ]
                message = (
                    "目前缺少 Model 3 依賴："
                    + "、".join(display_names)
                    + "；未使用舊討論結果。"
                )
            else:
                message = "Model 3 討論執行失敗；未使用舊討論結果。"

            write_model3_status(
                "failed",
                profile=profile_data,
                message=message,
                diagnostic=diagnostic,
            )
            raise HTTPException(
                status_code=500,
                detail={
                    "message": "Model 3 討論執行失敗",
                    "user_message": message,
                    "missing_dependencies": missing_dependencies,
                    "return_code": result.returncode,
                    "diagnostic": diagnostic,
                },
            )

        if (
            not MODEL3_DISCUSSION_FILE.exists()
            or MODEL3_DISCUSSION_FILE.stat().st_mtime < started_epoch
        ):
            message = "Model 3 未產生本次討論結果；未使用舊討論結果。"
            write_model3_status(
                "failed",
                profile=profile_data,
                message=message,
            )
            raise HTTPException(status_code=500, detail=message)

        write_model3_status(
            "completed",
            profile=profile_data,
            completed_at=datetime.now().isoformat(timespec="seconds"),
            message="Model 3 AI 討論已完成。",
        )

    try:
        return build_result(profile_data)
    except (FileNotFoundError, json.JSONDecodeError, pd.errors.ParserError) as exc:
        write_model3_status(
            "failed",
            profile=profile_data,
            message=f"Model 3 結果無法載入：{exc}；未使用舊討論結果。",
        )
        raise HTTPException(
            status_code=500,
            detail=f"Model 3 完成但結果無法載入：{exc}",
        ) from exc
