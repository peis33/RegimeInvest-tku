"""
portfolio_zipf_ga_final.py
============================================================
第三階段：Portfolio Allocation Model（資金配置模型）

流程：
1. HMM + MTA + LSTM -> v2_hmm_mta_lstm_prediction_output.csv
2. 本程式 -> Selection + Zipf + GA + 零股配置
3. Multi-Agent + Yahoo News -> 評估本程式產生的投資組合

輸入：v2_hmm_mta_lstm_prediction_output.csv
選用：candidate_stocks.csv（若不存在，使用內建示範股票池）
輸出：portfolio_allocation_output.csv、portfolio_allocation_report.txt

Demo 與前端共用：
- Demo：直接修改 USER_PROFILE 後執行本檔。
- 前端 / FastAPI：呼叫 portfolio_model(user_profile)。
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Tuple

import numpy as np
import pandas as pd


PREDICTION_FILE = "model_1_prediction_output.csv"
CANDIDATE_STOCK_FILE = "model_2_candidate_stocks.csv"
OUTPUT_FILE = "portfolio_allocation_output.csv"
REPORT_FILE = "portfolio_allocation_report.txt"

RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)

DEMO_MODE = False
LOT_SIZE = 1000

USER_PROFILE = {
    "budget": 50000,
    "investor_type": "small",          # small / normal / large
    "risk_preference": "neutral",      # conservative / neutral / aggressive
    "allow_fractional": True,
    "preferred_stock_class": "low_price",  # low_price / medium_price / high_price / auto
    "top_n": 5,
    "zipf_s": 1.2,
}


def load_latest_prediction(prediction_file: str = PREDICTION_FILE) -> Dict[str, Any]:
    """讀取第一階段 HMM + MTA + LSTM 的最新預測。"""
    path = Path(prediction_file)
    if not path.exists():
        raise FileNotFoundError(
            f"找不到 {prediction_file}。請先執行 model_1_hmm_mta_lstm.py，產生市場狀態預測 CSV。"
        )

    df = pd.read_csv(path)
    if df.empty:
        raise ValueError(f"{prediction_file} 是空的，無法進行資金配置。")

    latest = df.iloc[-1].to_dict()
    prediction = {
        "target_month": latest.get("target_month", "未知"),
        "predicted_regime": str(latest.get("predicted_regime", "Sideways")),
        "prob_Bear": float(latest.get("prob_Bear", 0.0)),
        "prob_Bull": float(latest.get("prob_Bull", 0.0)),
        "prob_Sideways": float(latest.get("prob_Sideways", 0.0)),
    }
    return prediction


def build_default_candidate_stocks() -> pd.DataFrame:
    data = [
        ["2330", "台積電", 950, "stock", "high_price", "value_stock", 0.090, 0.180, 0.98],
        ["2454", "聯發科", 1200, "stock", "high_price", "value_stock", 0.085, 0.200, 0.92],
        ["2317", "鴻海", 180, "stock", "medium_price", "value_stock", 0.065, 0.150, 0.95],
        ["2308", "台達電", 360, "stock", "medium_price", "value_stock", 0.070, 0.145, 0.88],
        ["2357", "華碩", 520, "stock", "medium_price", "normal", 0.060, 0.160, 0.80],
        ["2303", "聯電", 55, "stock", "low_price", "value_stock", 0.045, 0.120, 0.90],
        ["2409", "友達", 18, "stock", "low_price", "normal", 0.035, 0.140, 0.75],
        ["2884", "玉山金", 29, "stock", "low_price", "normal", 0.030, 0.080, 0.85],
        ["2891", "中信金", 38, "stock", "low_price", "normal", 0.035, 0.090, 0.88],
        ["0050", "元大台灣50", 185, "etf", "medium_price", "value_stock", 0.055, 0.100, 0.95],
        ["00878", "國泰永續高股息", 23, "etf", "low_price", "normal", 0.040, 0.070, 0.93],
        ["00713", "元大高息低波", 58, "etf", "low_price", "normal", 0.038, 0.060, 0.86],
    ]
    return pd.DataFrame(
        data,
        columns=[
            "stock_id", "name", "price", "asset_type", "price_class", "value_type",
            "expected_return", "risk", "liquidity_score",
        ],
    )


def load_candidate_stocks(file_path: str = CANDIDATE_STOCK_FILE) -> pd.DataFrame:
    """
    Load the formal causal candidate set produced by model_2_candidate_selection.py.
    No demo fallback is allowed in the formal Model 2 pipeline.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(
            f"找不到 {file_path}。請先執行 model_2_candidate_selection.py。"
        )

    df = pd.read_csv(path, dtype={"stock_id": str})
    if df.empty:
        raise ValueError(f"{file_path} 是空的，無法進行正式資金配置。")

    required_source = [
        "stock_id", "latest_price", "market_cap_million",
        "avg_turnover_value_20d_thousand", "return_20d",
        "volatility_20d", "selection_score"
    ]
    missing = [c for c in required_source if c not in df.columns]
    if missing:
        raise ValueError(
            f"{file_path} 缺少正式 candidate 欄位：{missing}\n目前欄位：{list(df.columns)}"
        )

    # Candidate file currently stores stock_id as "2330 台積電".
    # Split it into a formal numeric ticker and display name.
    raw_id = df["stock_id"].astype(str).str.strip()
    extracted = raw_id.str.extract(r"^\s*(\d+)\s*(.*)$")
    df["stock_id"] = extracted[0].fillna(raw_id)
    df["name"] = extracted[1].replace("", np.nan).fillna(df["stock_id"])

    df["price"] = pd.to_numeric(df["latest_price"], errors="coerce")
    df["expected_return"] = pd.to_numeric(df["return_20d"], errors="coerce")
    df["risk"] = pd.to_numeric(df["volatility_20d"], errors="coerce")

    liquidity_raw = pd.to_numeric(
        df["avg_turnover_value_20d_thousand"], errors="coerce"
    )
    if liquidity_raw.notna().sum() == 0:
        raise ValueError("正式 candidate 的流動性欄位無有效數值。")

    # Convert raw liquidity into a causal cross-sectional [0,1] score.
    df["liquidity_score"] = liquidity_raw.rank(method="average", pct=True)

    df["asset_type"] = "stock"

    # Preserve the original Model 2 price-class preference mechanism,
    # but derive the class from formal TEJ prices instead of demo labels.
    def price_class(price):
        if price < 100:
            return "low_price"
        elif price < 500:
            return "medium_price"
        return "high_price"

    df["price_class"] = df["price"].map(price_class)

    # The old demo "value_type" had no formal TEJ field behind it.
    # Keep interface compatibility without fabricating a value-stock label.
    df["value_type"] = "normal"

    required_model2 = [
        "stock_id", "name", "price", "asset_type", "price_class", "value_type",
        "expected_return", "risk", "liquidity_score",
    ]
    df = df.dropna(
        subset=["price", "expected_return", "risk", "liquidity_score"]
    ).reset_index(drop=True)

    if df.empty:
        raise ValueError("正式 candidate 經欄位轉換後沒有可用股票。")

    if df["stock_id"].duplicated().any():
        raise ValueError("正式 candidate 含重複 stock_id。")

    return df[required_model2 + [
        c for c in ["decision_date", "market_cap_million", "selection_score"]
        if c in df.columns
    ]]


def normalize_user_profile(user_profile: Dict[str, Any] | None) -> Dict[str, Any]:
    profile = USER_PROFILE.copy()
    if user_profile:
        profile.update(user_profile)

    profile["budget"] = float(profile.get("budget", 50000))
    profile["investor_type"] = str(profile.get("investor_type", "small")).lower()
    profile["risk_preference"] = str(profile.get("risk_preference", "neutral")).lower()
    profile["allow_fractional"] = bool(profile.get("allow_fractional", True))
    profile["preferred_stock_class"] = str(profile.get("preferred_stock_class", "auto")).lower()
    profile["top_n"] = int(profile.get("top_n", 5))
    profile["zipf_s"] = float(profile.get("zipf_s", 1.2))

    if profile["investor_type"] not in {"small", "normal", "large"}:
        profile["investor_type"] = "small"
    if profile["risk_preference"] not in {"conservative", "neutral", "aggressive"}:
        profile["risk_preference"] = "neutral"

    if profile["preferred_stock_class"] == "auto":
        if profile["investor_type"] == "small":
            profile["preferred_stock_class"] = "low_price"
        elif profile["investor_type"] == "large":
            profile["preferred_stock_class"] = "high_price"
        else:
            profile["preferred_stock_class"] = "medium_price"
    return profile


def investor_stock_class_weight(price_class: str, preferred: str, investor_type: str) -> float:
    if preferred == "low_price":
        weights = {"low_price": 1.00, "medium_price": 0.70, "high_price": 0.35}
    elif preferred == "medium_price":
        weights = {"medium_price": 1.00, "low_price": 0.80, "high_price": 0.60}
    elif preferred == "high_price":
        weights = {"high_price": 1.00, "medium_price": 0.80, "low_price": 0.55}
    else:
        weights = {"low_price": 0.80, "medium_price": 0.80, "high_price": 0.80}
    base = weights.get(price_class, 0.50)
    if investor_type == "large" and price_class == "high_price":
        base += 0.20
    if investor_type == "small" and price_class == "high_price":
        base -= 0.15
    return max(base, 0.10)


def compute_selection_score(row: pd.Series, prediction: Dict[str, Any], profile: Dict[str, Any]) -> float:
    score = 0.0
    score += 3.0 * investor_stock_class_weight(row["price_class"], profile["preferred_stock_class"], profile["investor_type"])

    if row["asset_type"] == "etf":
        if profile["investor_type"] == "small":
            score += 0.8
        if profile["risk_preference"] == "conservative":
            score += 0.7

    if row["value_type"] == "value_stock" and profile["investor_type"] in {"normal", "large"}:
        score += 0.8

    # 市場狀態直接影響選股，不再使用 Multi-Agent 的 aggressive/defensive 決策。
    bear_p = prediction["prob_Bear"]
    bull_p = prediction["prob_Bull"]
    sideways_p = prediction["prob_Sideways"]

    score += row["expected_return"] * (8 + 10 * bull_p)
    score -= row["risk"] * (2 + 7 * bear_p)
    score += row["liquidity_score"] * (0.5 + 2.0 * bear_p + 0.5 * sideways_p)

    # Bear 時偏好低風險與 ETF；Bull 時允許較高預期報酬標的。
    if row["asset_type"] == "etf":
        score += 0.8 * bear_p

    if profile["risk_preference"] == "aggressive":
        score += row["expected_return"] * 8
    elif profile["risk_preference"] == "conservative":
        score -= row["risk"] * 4
        score += row["liquidity_score"]
    return float(score)


def select_candidates(stocks: pd.DataFrame, prediction: Dict[str, Any], profile: Dict[str, Any]) -> pd.DataFrame:
    stocks = stocks.copy()
    stocks["selection_score"] = stocks.apply(lambda r: compute_selection_score(r, prediction, profile), axis=1)
    return stocks.sort_values("selection_score", ascending=False).head(profile["top_n"]).reset_index(drop=True)


def get_cash_bounds(prediction: Dict[str, Any], profile: Dict[str, Any]) -> Tuple[float, float]:
    """依市場狀態機率決定現金區間；Multi-Agent 不再控制資金配置。"""
    bear_p = prediction["prob_Bear"]
    bull_p = prediction["prob_Bull"]
    sideways_p = prediction["prob_Sideways"]

    # 機率加權的基準現金中心：Bear 高、Sideways 中、Bull 低。
    cash_center = 0.50 * bear_p + 0.28 * sideways_p + 0.15 * bull_p
    cash_min = cash_center - 0.12
    cash_max = cash_center + 0.12

    if profile["risk_preference"] == "conservative":
        cash_min += 0.08
        cash_max += 0.08
    elif profile["risk_preference"] == "aggressive":
        cash_min -= 0.07
        cash_max -= 0.07

    cash_min = min(max(cash_min, 0.05), 0.75)
    cash_max = min(max(cash_max, cash_min + 0.05), 0.85)
    return cash_min, cash_max


def normalize(w: np.ndarray) -> np.ndarray:
    w = np.maximum(w, 0)
    total = w.sum()
    if total == 0:
        return np.ones(len(w)) / len(w)
    return w / total


def zipf_weight(n: int, s: float = 1.2) -> np.ndarray:
    ranks = np.arange(1, n + 1)
    raw = 1 / (ranks ** s)
    return raw / raw.sum()


def repair_cash_constraint(w: np.ndarray, cash_min: float, cash_max: float) -> np.ndarray:
    w = normalize(w)
    cash = w[-1]
    if cash < cash_min:
        w[-1] = cash_min
        if w[:-1].sum() > 0:
            w[:-1] = w[:-1] * ((1 - cash_min) / w[:-1].sum())
    elif cash > cash_max:
        w[-1] = cash_max
        if w[:-1].sum() > 0:
            w[:-1] = w[:-1] * ((1 - cash_max) / w[:-1].sum())
        else:
            w[:-1] = (1 - cash_max) / (len(w) - 1)
    return normalize(w)


def build_initial_weight(selected: pd.DataFrame, prediction: Dict[str, Any], profile: Dict[str, Any]) -> np.ndarray:
    cash_min, cash_max = get_cash_bounds(prediction, profile)
    cash_initial = (cash_min + cash_max) / 2
    risky_weight = zipf_weight(len(selected), s=profile["zipf_s"]) * (1 - cash_initial)
    return normalize(np.append(risky_weight, cash_initial))


def portfolio_metrics(w: np.ndarray, selected: pd.DataFrame) -> Dict[str, float]:
    risky_w = w[:-1]
    cash_w = w[-1]
    port_return = float(np.sum(risky_w * selected["expected_return"].values) + cash_w * 0.005)
    port_risk = float(np.sum(risky_w * selected["risk"].values) + cash_w * 0.005)
    concentration = float(np.max(w))
    diversification = float(1 - np.sum(w ** 2))
    return {
        "expected_return": port_return,
        "risk": port_risk,
        "concentration": concentration,
        "diversification": diversification,
    }


def fitness(w: np.ndarray, selected: pd.DataFrame, prediction: Dict[str, Any], profile: Dict[str, Any]) -> float:
    m = portfolio_metrics(w, selected)
    # Bear 機率越高，GA 對風險的懲罰越強；Bull 越高則較重視報酬。
    risk_lambda = 0.35 + 0.60 * prediction["prob_Bear"] + 0.15 * prediction["prob_Sideways"]

    if profile["risk_preference"] == "conservative":
        risk_lambda += 0.20
    elif profile["risk_preference"] == "aggressive":
        risk_lambda -= 0.15

    cash_w = w[-1]
    risky_w_sum = w[:-1].sum()
    target_cash = 0.50 * prediction["prob_Bear"] + 0.28 * prediction["prob_Sideways"] + 0.15 * prediction["prob_Bull"]
    alignment = -abs(cash_w - target_cash) * 0.04 + risky_w_sum * prediction["prob_Bull"] * 0.015

    return float(
        m["expected_return"]
        - risk_lambda * m["risk"]
        - m["concentration"] * 0.05
        + m["diversification"] * 0.02
        + alignment
    )


def create_population(initial_w: np.ndarray, cash_min: float, cash_max: float, size: int = 80) -> list[np.ndarray]:
    population = [repair_cash_constraint(initial_w, cash_min, cash_max)]
    for _ in range(size - 1):
        noise = np.random.normal(0, 0.08, len(initial_w))
        population.append(repair_cash_constraint(initial_w + noise, cash_min, cash_max))
    return population


def crossover(p1: np.ndarray, p2: np.ndarray) -> np.ndarray:
    alpha = random.random()
    return normalize(alpha * p1 + (1 - alpha) * p2)


def mutate(w: np.ndarray, rate: float = 0.25, scale: float = 0.05) -> np.ndarray:
    child = w.copy()
    for i in range(len(child)):
        if random.random() < rate:
            child[i] += np.random.normal(0, scale)
    return normalize(child)


def run_ga(selected: pd.DataFrame, prediction: Dict[str, Any], profile: Dict[str, Any], initial_w: np.ndarray,
           generations: int = 120, population_size: int = 80) -> Tuple[np.ndarray, float]:
    cash_min, cash_max = get_cash_bounds(prediction, profile)
    population = create_population(initial_w, cash_min, cash_max, size=population_size)
    best_w = None
    best_score = -10**9

    for _ in range(generations):
        scored = []
        for individual in population:
            individual = repair_cash_constraint(individual, cash_min, cash_max)
            scored.append((individual, fitness(individual, selected, prediction, profile)))
        scored.sort(key=lambda x: x[1], reverse=True)
        if scored[0][1] > best_score:
            best_w = scored[0][0].copy()
            best_score = scored[0][1]

        elite_count = max(2, population_size // 5)
        elites = [x[0] for x in scored[:elite_count]]
        new_population = elites.copy()
        while len(new_population) < population_size:
            p1, p2 = random.sample(elites, 2)
            child = mutate(crossover(p1, p2))
            new_population.append(repair_cash_constraint(child, cash_min, cash_max))
        population = new_population

    return repair_cash_constraint(best_w, cash_min, cash_max), float(best_score)


def calculate_position_table(selected: pd.DataFrame, weights: np.ndarray, profile: Dict[str, Any],
                             fitness_score: float, prediction: Dict[str, Any]) -> pd.DataFrame:
    budget = float(profile["budget"])
    allow_fractional = bool(profile["allow_fractional"])
    rows = []

    for i, row in selected.iterrows():
        allocated = float(weights[i] * budget)
        price = float(row["price"])
        if allow_fractional:
            shares = allocated / price
            lots = shares / LOT_SIZE
            actual_amount = allocated
            position_type = "fractional_share"
        else:
            # 台股 1 張 = 1,000 股；關閉零股時只能配置完整的張數。
            lots = np.floor(allocated / (price * LOT_SIZE))
            shares = lots * LOT_SIZE
            actual_amount = shares * price
            position_type = "whole_lot"

        actual_weight = actual_amount / budget if budget > 0 else float(weights[i])

        rows.append({
            "target_month": prediction["target_month"],
            "predicted_regime": prediction["predicted_regime"],
            "prob_Bear": prediction["prob_Bear"],
            "prob_Bull": prediction["prob_Bull"],
            "prob_Sideways": prediction["prob_Sideways"],
            "investor_type": profile["investor_type"],
            "risk_preference": profile["risk_preference"],
            "allow_fractional": profile["allow_fractional"],
            "budget": budget,
            "stock_id": row["stock_id"],
            "name": row["name"],
            "asset_type": row["asset_type"],
            "price_class": row["price_class"],
            "price": price,
            "expected_return": row["expected_return"],
            "risk": row["risk"],
            "selection_score": row["selection_score"],
            # 未開啟零股時，整股取整後的實際成交金額可能低於最佳化目標；
            # 輸出實際配置比例，才能讓股票與現金比例正確合計為 100%。
            "final_weight": float(actual_weight),
            "final_weight_percent": round(float(actual_weight) * 100, 2),
            "allocated_amount": round(float(actual_amount), 2),
            "shares": round(float(shares), 4),
            "lots": round(float(lots), 4),
            "position_type": position_type,
            "fitness_score": fitness_score,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })

    stock_actual_amount = sum(r["allocated_amount"] for r in rows)
    cash_amount = budget - stock_actual_amount if not allow_fractional else float(weights[-1] * budget)
    cash_weight_actual = cash_amount / budget if budget > 0 else weights[-1]

    rows.append({
        "target_month": prediction["target_month"],
        "predicted_regime": prediction["predicted_regime"],
        "prob_Bear": prediction["prob_Bear"],
        "prob_Bull": prediction["prob_Bull"],
        "prob_Sideways": prediction["prob_Sideways"],
        "investor_type": profile["investor_type"],
        "risk_preference": profile["risk_preference"],
        "allow_fractional": profile["allow_fractional"],
        "budget": budget,
        "stock_id": "CASH",
        "name": "現金",
        "asset_type": "cash",
        "price_class": "cash",
        "price": 1.0,
        "expected_return": 0.005,
        "risk": 0.005,
        "selection_score": np.nan,
        "final_weight": float(cash_weight_actual),
        "final_weight_percent": round(float(cash_weight_actual) * 100, 2),
        "allocated_amount": round(float(cash_amount), 2),
        "shares": np.nan,
        "lots": np.nan,
        "position_type": "cash",
        "fitness_score": fitness_score,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })
    return pd.DataFrame(rows)


def save_report(prediction: Dict[str, Any], profile: Dict[str, Any], selected: pd.DataFrame,
                initial_w: np.ndarray, final_w: np.ndarray, portfolio: pd.DataFrame,
                fitness_score: float) -> None:
    cash_min, cash_max = get_cash_bounds(prediction, profile)
    metrics = portfolio_metrics(final_w, selected)
    selected_view = selected[["stock_id", "name", "asset_type", "price", "price_class", "selection_score"]].copy()

    report = f"""
Portfolio Allocation Model Report
=================================

產生時間：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

一、資料來源
---------------------------------
輸入檔案：{PREDICTION_FILE}
輸出檔案：{OUTPUT_FILE}

二、HMM + MTA + LSTM 市場預測摘要
---------------------------------
目標月份：{prediction['target_month']}
預測市場狀態：{prediction['predicted_regime']}
Bear 機率：{prediction['prob_Bear']:.2%}
Bull 機率：{prediction['prob_Bull']:.2%}
Sideways 機率：{prediction['prob_Sideways']:.2%}

三、使用者 Profile
---------------------------------
投資本金：{profile['budget']:,.0f}
投資人類型：{profile['investor_type']}
風險偏好：{profile['risk_preference']}
偏好股票類型：{profile['preferred_stock_class']}
是否允許零股：{profile['allow_fractional']}
Zipf 參數 s：{profile['zipf_s']}

四、Timing 約束
---------------------------------
現金權重下限：{cash_min:.2%}
現金權重上限：{cash_max:.2%}

五、Selection 選股結果
---------------------------------
{selected_view.to_string(index=False)}

六、Zipf 初始權重（最後一個為現金）
---------------------------------
{np.round(initial_w * 100, 2)}

七、GA 最佳化權重（最後一個為現金）
---------------------------------
{np.round(final_w * 100, 2)}

八、投資組合指標
---------------------------------
Expected Return：{metrics['expected_return']:.4f}
Risk：{metrics['risk']:.4f}
Concentration：{metrics['concentration']:.4f}
Diversification：{metrics['diversification']:.4f}
Fitness Score：{fitness_score:.6f}

九、最終資金配置
---------------------------------
{portfolio[['stock_id', 'name', 'asset_type', 'final_weight_percent', 'allocated_amount', 'shares', 'position_type']].to_string(index=False)}
"""
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(report)


def portfolio_model(user_profile: Dict[str, Any] | None = None,
                    prediction_file: str = PREDICTION_FILE,
                    candidate_stock_file: str = CANDIDATE_STOCK_FILE,
                    output_file: str = OUTPUT_FILE) -> pd.DataFrame:
    profile = normalize_user_profile(user_profile)
    prediction = load_latest_prediction(prediction_file)
    stocks = load_candidate_stocks(candidate_stock_file)
    selected = select_candidates(stocks, prediction, profile)

    if selected.empty:
        raise ValueError("選股結果為空，請檢查 candidate_stocks.csv 或 selection rule。")

    initial_w = build_initial_weight(selected, prediction, profile)
    final_w, best_score = run_ga(selected, prediction, profile, initial_w)
    portfolio = calculate_position_table(selected, final_w, profile, best_score, prediction)
    portfolio.to_csv(output_file, index=False, encoding="utf-8-sig")
    save_report(prediction, profile, selected, initial_w, final_w, portfolio, best_score)
    return portfolio



def formal_pipeline_audit() -> pd.DataFrame:
    checks = []

    checks.append({
        "check_name": "Model 1 formal output exists",
        "status": "PASS" if Path(PREDICTION_FILE).exists() else "FAIL",
        "detail": PREDICTION_FILE
    })
    checks.append({
        "check_name": "Formal candidate file exists",
        "status": "PASS" if Path(CANDIDATE_STOCK_FILE).exists() else "FAIL",
        "detail": CANDIDATE_STOCK_FILE
    })

    if Path(PREDICTION_FILE).exists():
        p = load_latest_prediction(PREDICTION_FILE)
        prob_sum = p["prob_Bear"] + p["prob_Bull"] + p["prob_Sideways"]
        checks.append({
            "check_name": "Model 1 probabilities sum to 1",
            "status": "PASS" if abs(prob_sum - 1.0) < 1e-5 else "FAIL",
            "detail": f"sum={prob_sum:.12f}"
        })

    if Path(CANDIDATE_STOCK_FILE).exists():
        stocks = load_candidate_stocks(CANDIDATE_STOCK_FILE)
        checks.append({
            "check_name": "Formal candidates load successfully",
            "status": "PASS" if len(stocks) > 0 else "FAIL",
            "detail": f"rows={len(stocks)}"
        })
        checks.append({
            "check_name": "No demo ETF fallback",
            "status": "PASS" if bool((stocks["asset_type"] == "stock").all()) else "FAIL",
            "detail": f"asset_types={sorted(stocks['asset_type'].unique().tolist())}"
        })
        checks.append({
            "check_name": "Candidate IDs unique",
            "status": "PASS" if stocks["stock_id"].is_unique else "FAIL",
            "detail": f"unique={stocks['stock_id'].nunique()}/{len(stocks)}"
        })

    audit = pd.DataFrame(checks)
    audit.to_csv(
        "experiment_model_2_formal_zipf_ga_interface_audit.csv",
        index=False, encoding="utf-8-sig"
    )
    return audit


def main() -> None:
    print("=" * 80)
    print("MODEL 2 - FORMAL Selection + Zipf + GA")
    print("=" * 80)
    print(f"Model 1 input : {PREDICTION_FILE}")
    print(f"Candidate input: {CANDIDATE_STOCK_FILE}")
    print("Demo candidate fallback: DISABLED")

    audit = formal_pipeline_audit()
    print("\nFORMAL PIPELINE AUDIT")
    print(audit.to_string(index=False))
    if (audit["status"] == "FAIL").any():
        print("\nAUDIT RESULT: MODEL 2 FORMAL ZIPF + GA INTERFACE HAS FAILURES")
        return
    print("\nAUDIT RESULT: MODEL 2 FORMAL ZIPF + GA INTERFACE PASS")

    if DEMO_MODE:
        profile = USER_PROFILE
        print("執行模式：DEMO_MODE=True，使用程式內建 USER_PROFILE。")
    else:
        profile_path = Path("user_profile.json")
        if profile_path.exists():
            with open(profile_path, "r", encoding="utf-8") as f:
                profile = json.load(f)
            print("執行模式：DEMO_MODE=False，讀取 user_profile.json。")
        else:
            profile = USER_PROFILE
            print("正式接軌測試：尚未建立 user_profile.json，使用固定 USER_PROFILE 作為可重現測試設定。")

    portfolio = portfolio_model(profile)
    print("\n最終資金配置：")
    print(portfolio[["stock_id", "name", "asset_type", "final_weight_percent", "allocated_amount", "shares", "position_type"]].to_string(index=False))
    print("\n" + "=" * 80)
    print(f"已輸出：{OUTPUT_FILE}")
    print(f"已輸出：{REPORT_FILE}")
    print("=" * 80)


if __name__ == "__main__":
    main()
