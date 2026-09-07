from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import threading
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
STOCK_DETAIL_FILE = PIPELINE_DIR / "stock_detail_historical.csv"
STOCK_DETAIL_ENCODING = "big5"

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
    allow_fractional: bool = False
    preferred_stock_class: Literal[
        "low_price",
        "medium_price",
        "high_price",
        "auto",
    ] = "auto"
    top_n: int = Field(default=5, ge=1, le=20)
    zipf_s: float = Field(default=1.2, gt=0)


def read_csv_records(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(path.name)

    return json.loads(
        pd.read_csv(path).to_json(
            orient="records",
            force_ascii=False,
        )
    )


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


def read_stock_detail_frame() -> pd.DataFrame:
    """讀取 StockDetail 專用資料，並統一股票代號與數值欄位。"""
    if not STOCK_DETAIL_FILE.exists():
        raise FileNotFoundError(STOCK_DETAIL_FILE.name)

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

    return frame.dropna(subset=["stock_id", "date"])


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

    discussion_path = (
        PIPELINE_DIR / "model_3_v5_1_discussion_output.json"
    )
    if not discussion_path.exists():
        raise FileNotFoundError(discussion_path.name)

    discussion = json.loads(
        discussion_path.read_text(encoding="utf-8")
    )

    market = market_rows[-1] if market_rows else {}
    discussion["messages"] = build_discussion_messages(
        discussion,
        market,
        portfolio_rows,
        profile,
    )

    return {
        "profile": profile,
        "market": market or None,
        "portfolio": portfolio_rows,
        "discussion": discussion,
    }


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "pipeline_exists": PIPELINE_FILE.exists(),
        "pipeline_dir": str(PIPELINE_DIR),
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

    with pipeline_lock:
        PROFILE_FILE.write_text(
            json.dumps(
                profile_data,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        process_env = os.environ.copy()
        process_env["PYTHONUTF8"] = "1"

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
                timeout=1800,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=504,
                detail="模型執行超過 30 分鐘，已停止本次分析。",
            ) from exc

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "模型管線執行失敗",
                "return_code": result.returncode,
                "stdout": result.stdout[-4000:],
                "stderr": result.stderr[-4000:],
            },
        )

    try:
        return build_result(profile_data)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"模型完成但找不到輸出檔：{exc}",
        ) from exc
