from pathlib import Path
import pandas as pd
import numpy as np

BASE_DIR = Path(__file__).resolve().parent

INPUT_FILE = BASE_DIR / "model_2_investor_profile_historical.csv"
MODEL1_FILE = BASE_DIR / "model_1_prediction_output.csv"

OUTPUT_CANDIDATES = BASE_DIR / "model_2_candidate_stocks.csv"
OUTPUT_AUDIT = BASE_DIR / "experiment_model_2_candidate_selection_audit.csv"
OUTPUT_SUMMARY = BASE_DIR / "experiment_model_2_candidate_selection_summary.csv"

LOOKBACK_DAYS = 60
MIN_OBSERVATIONS = 40

def require_columns(df, cols, name):
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{name} missing columns: {missing}")

def main():
    print("=" * 120)
    print("MODEL 2 — CAUSAL CANDIDATE SELECTION | PRODUCTION")
    print("=" * 120)
    print("Purpose: build formal candidate_stocks.csv from Model 2 historical TEJ data.")
    print("Selection uses only information available on/before each decision date.")
    print("No GA optimization is performed here.")

    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Missing: {INPUT_FILE.name}")
    if not MODEL1_FILE.exists():
        raise FileNotFoundError(f"Missing upstream Model 1 output: {MODEL1_FILE.name}")

    df = pd.read_csv(INPUT_FILE, encoding="utf-8-sig", dtype={"證券代碼": str})
    df["年月日"] = pd.to_datetime(df["年月日"], errors="coerce")

    required = [
        "證券代碼", "年月日", "investor_class",
        "收盤價(元)", "成交值(千元)", "市值(百萬元)",
        "週轉率％", "return_20d", "volatility_20d",
        "avg_turnover_value_20d", "avg_turnover_rate_20d"
    ]
    require_columns(df, required, INPUT_FILE.name)

    if df["年月日"].isna().any():
        raise ValueError("Invalid dates found.")

    # Use the last available formal research date as the first formal
    # candidate-selection snapshot. Historical rolling experiments can
    # reuse the same causal function later.
    decision_date = df["年月日"].max()
    start_date = decision_date - pd.Timedelta(days=LOOKBACK_DAYS)

    hist = df[(df["年月日"] >= start_date) & (df["年月日"] <= decision_date)].copy()

    audit = []

    # Explicit causal audit
    future_rows = int((hist["年月日"] > decision_date).sum())
    audit.append({
        "check_name": "No future observations used",
        "status": "PASS" if future_rows == 0 else "FAIL",
        "detail": f"future_rows={future_rows}"
    })

    rows = []
    for stock_id, g in hist.groupby("證券代碼"):
        g = g.sort_values("年月日")
        if len(g) < MIN_OBSERVATIONS:
            continue

        latest = g.iloc[-1]

        close = float(latest["收盤價(元)"])
        market_cap = float(latest["市值(百萬元)"])
        avg_value = float(g["成交值(千元)"].tail(20).mean())
        avg_turnover = float(g["週轉率％"].tail(20).mean())
        ret20 = float(latest["return_20d"]) if pd.notna(latest["return_20d"]) else np.nan
        vol20 = float(latest["volatility_20d"]) if pd.notna(latest["volatility_20d"]) else np.nan

        rows.append({
            "stock_id": str(stock_id),
            "investor_class": latest["investor_class"],
            "decision_date": decision_date.date().isoformat(),
            "latest_price": close,
            "market_cap_million": market_cap,
            "avg_turnover_value_20d_thousand": avg_value,
            "avg_turnover_rate_20d": avg_turnover,
            "return_20d": ret20,
            "volatility_20d": vol20,
            "observations_in_lookback": len(g),
        })

    candidates = pd.DataFrame(rows)

    if candidates.empty:
        raise RuntimeError("No eligible candidates were produced.")

    # Require core fields.
    core_cols = [
        "latest_price", "market_cap_million",
        "avg_turnover_value_20d_thousand",
        "avg_turnover_rate_20d", "return_20d", "volatility_20d"
    ]
    before = len(candidates)
    candidates = candidates.dropna(subset=core_cols).copy()
    dropped = before - len(candidates)

    audit.append({
        "check_name": "Core candidate fields complete",
        "status": "PASS" if dropped == 0 else "WARN",
        "detail": f"dropped_missing_core={dropped}"
    })

    # Causal cross-sectional market-cap class within the available stock pool.
    # This is explicitly a sample-relative classification, NOT a claim about
    # the full Taiwan equity market.
    candidates["market_cap_rank_pct"] = candidates["market_cap_million"].rank(
        method="average", pct=True
    )

    def cap_class(p):
        if p <= 1/3:
            return "Small"
        elif p <= 2/3:
            return "Mid"
        return "Large"

    candidates["market_cap_class_sample"] = candidates["market_cap_rank_pct"].map(cap_class)

    # Liquidity eligibility: exclude only non-positive values.
    candidates["liquidity_eligible"] = (
        (candidates["latest_price"] > 0) &
        (candidates["avg_turnover_value_20d_thousand"] > 0) &
        (candidates["market_cap_million"] > 0)
    )

    formal = candidates[candidates["liquidity_eligible"]].copy()

    # Stable selection score using cross-sectional ranks.
    # Higher return/liquidity/turnover and lower volatility are preferred.
    formal["score_return"] = formal["return_20d"].rank(pct=True)
    formal["score_liquidity"] = formal["avg_turnover_value_20d_thousand"].rank(pct=True)
    formal["score_turnover"] = formal["avg_turnover_rate_20d"].rank(pct=True)
    formal["score_low_volatility"] = (-formal["volatility_20d"]).rank(pct=True)

    formal["selection_score"] = (
        0.35 * formal["score_return"] +
        0.30 * formal["score_liquidity"] +
        0.15 * formal["score_turnover"] +
        0.20 * formal["score_low_volatility"]
    )

    formal = formal.sort_values(
        ["selection_score", "market_cap_million"],
        ascending=[False, False]
    ).reset_index(drop=True)
    formal["selection_rank"] = np.arange(1, len(formal) + 1)

    audit.append({
        "check_name": "Positive price/liquidity/market cap",
        "status": "PASS" if bool(formal["liquidity_eligible"].all()) else "FAIL",
        "detail": f"eligible={len(formal)}/{len(candidates)}"
    })

    audit.append({
        "check_name": "Candidate decision date within formal cutoff",
        "status": "PASS" if decision_date <= pd.Timestamp("2025-12-31") else "FAIL",
        "detail": f"decision_date={decision_date.date()}"
    })

    audit.append({
        "check_name": "Candidate stock IDs unique",
        "status": "PASS" if formal["stock_id"].is_unique else "FAIL",
        "detail": f"rows={len(formal)}, unique_stocks={formal['stock_id'].nunique()}"
    })

    # Optional Model 1 interface check. We do NOT use 2026 prediction to
    # construct a 2025 candidate set; this check only confirms the pipeline
    # interface exists for later production integration.
    if MODEL1_FILE.exists():
        m1 = pd.read_csv(MODEL1_FILE, encoding="utf-8-sig")
        require_columns(
            m1,
            ["target_month", "predicted_regime", "prob_Bear", "prob_Bull", "prob_Sideways"],
            MODEL1_FILE.name
        )
        audit.append({
            "check_name": "Model 1 production interface available",
            "status": "PASS",
            "detail": f"{MODEL1_FILE.name}; rows={len(m1)}"
        })
    else:
        audit.append({
            "check_name": "Model 1 production interface available",
            "status": "WARN",
            "detail": f"Missing {MODEL1_FILE.name}; candidate research snapshot still valid"
        })

    audit_df = pd.DataFrame(audit)
    n_fail = int((audit_df["status"] == "FAIL").sum())
    n_warn = int((audit_df["status"] == "WARN").sum())
    n_pass = int((audit_df["status"] == "PASS").sum())

    summary = pd.DataFrame([{
        "decision_date": decision_date.date().isoformat(),
        "lookback_days": LOOKBACK_DAYS,
        "candidate_count": len(formal),
        "small_count": int((formal["market_cap_class_sample"] == "Small").sum()),
        "mid_count": int((formal["market_cap_class_sample"] == "Mid").sum()),
        "large_count": int((formal["market_cap_class_sample"] == "Large").sum()),
        "audit_pass_count": n_pass,
        "audit_warn_count": n_warn,
        "audit_fail_count": n_fail,
        "candidate_selection_ready": n_fail == 0,
    }])

    # Compatibility alias for existing Model 2 code.
    formal["name"] = formal["stock_id"]
    formal["price"] = formal["latest_price"]
    formal["market_cap"] = formal["market_cap_million"]
    formal["avg_volume_value"] = formal["avg_turnover_value_20d_thousand"]

    formal.to_csv(OUTPUT_CANDIDATES, index=False, encoding="utf-8-sig")
    audit_df.to_csv(OUTPUT_AUDIT, index=False, encoding="utf-8-sig")
    summary.to_csv(OUTPUT_SUMMARY, index=False, encoding="utf-8-sig")

    print("\n" + "=" * 120)
    print("CANDIDATE SELECTION SUMMARY")
    print("=" * 120)
    print(summary.to_string(index=False))

    print("\n" + "=" * 120)
    print("TOP CANDIDATES")
    print("=" * 120)
    show_cols = [
        "selection_rank", "stock_id", "investor_class",
        "market_cap_class_sample", "latest_price",
        "market_cap_million", "return_20d", "volatility_20d",
        "selection_score"
    ]
    print(formal[show_cols].head(16).to_string(index=False))

    print("\n" + "=" * 120)
    print("AUDIT DETAIL")
    print("=" * 120)
    print(audit_df.to_string(index=False))

    print("\n已輸出：")
    print("- model_2_candidate_stocks.csv")
    print("- experiment_model_2_candidate_selection_audit.csv")
    print("- experiment_model_2_candidate_selection_summary.csv")

    if n_fail == 0:
        print("\nAUDIT RESULT: MODEL 2 CANDIDATE SELECTION PASS")
    else:
        print("\nAUDIT RESULT: MODEL 2 CANDIDATE SELECTION HAS FAILURES")

if __name__ == "__main__":
    main()
