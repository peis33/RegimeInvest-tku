from pathlib import Path
import json
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent

PROFILE_FILE = BASE_DIR / "user_profile.json"
MODEL1_FILE = BASE_DIR / "model_1_prediction_output.csv"

POOL_FILES = {
    "small": BASE_DIR / "小戶10.csv",
    "normal": BASE_DIR / "中間戶10.csv",
    "large": BASE_DIR / "大戶10.csv",
}

OUTPUT_CANDIDATES = BASE_DIR / "model_2_candidate_stocks.csv"
OUTPUT_AUDIT = BASE_DIR / "experiment_model_2_candidate_selection_audit.csv"
OUTPUT_SUMMARY = BASE_DIR / "experiment_model_2_candidate_selection_summary.csv"

LOOKBACK_DAYS = 60
MIN_OBSERVATIONS = 40
MIN_GA_STOCKS = 3


def require_columns(df, cols, name):
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{name} missing columns: {missing}")


def normalize_stock_id(value):
    s = str(value).strip()
    extracted = pd.Series([s]).str.extract(r"^\s*(\d+)")[0].iloc[0]
    return str(extracted) if pd.notna(extracted) else s


def read_profile():
    if not PROFILE_FILE.exists():
        raise FileNotFoundError(
            "找不到 user_profile.json。Model 2 production 必須由 App / user_profile 提供使用者設定。"
        )

    profile = json.loads(PROFILE_FILE.read_text(encoding="utf-8"))

    investor_type = str(profile.get("investor_type", "")).strip().lower()
    if investor_type not in POOL_FILES:
        raise ValueError(
            f"Unsupported investor_type={investor_type!r}; "
            "請使用 small / normal / large。"
        )

    selection_mode = str(profile.get("selection_mode", "all")).strip().lower()
    if selection_mode not in {"all", "custom"}:
        raise ValueError(
            f"Unsupported selection_mode={selection_mode!r}; "
            "目前支援 all / custom。"
        )

    raw_ids = profile.get("selected_stock_ids", [])
    if raw_ids is None:
        raw_ids = []
    if not isinstance(raw_ids, list):
        raise ValueError("selected_stock_ids 必須是 JSON array。")

    selected_stock_ids = list(
        dict.fromkeys(
            normalize_stock_id(x)
            for x in raw_ids
            if str(x).strip()
        )
    )

    if selection_mode == "custom" and not selected_stock_ids:
        raise ValueError(
            "selection_mode='custom' 時 selected_stock_ids 不可以是空的。"
        )

    return profile, investor_type, selection_mode, selected_stock_ids


def read_pool(path, investor_type):
    if not path.exists():
        raise FileNotFoundError(f"找不到股票池：{path.name}")

    # 這三份股票池由 TEJ Pro 匯出，實測為 CP950。
    try:
        df = pd.read_csv(path, encoding="cp950", dtype={"證券代碼": str})
    except UnicodeDecodeError:
        df = pd.read_csv(path, encoding="utf-8-sig", dtype={"證券代碼": str})

    required = [
        "證券代碼",
        "年月日",
        "收盤價(元)",
        "成交值(千元)",
        "市值(百萬元)",
        "週轉率％",
    ]
    require_columns(df, required, path.name)

    df["年月日"] = pd.to_datetime(df["年月日"], errors="coerce")

    numeric_cols = [
        "收盤價(元)",
        "成交值(千元)",
        "市值(百萬元)",
        "週轉率％",
    ]

    for col in numeric_cols:
        df[col] = pd.to_numeric(
            df[col]
            .astype(str)
            .str.replace(",", "", regex=False)
            .str.strip(),
            errors="coerce",
        )

    raw_id = df["證券代碼"].astype(str).str.strip()
    extracted = raw_id.str.extract(r"^\s*(\d+)\s*(.*)$")
    df["ticker"] = extracted[0].fillna(raw_id)
    df["name"] = extracted[1].replace("", np.nan).fillna(df["ticker"])
    df["investor_class"] = investor_type

    df = (
        df.replace([np.inf, -np.inf], np.nan)
        .dropna(
            subset=[
                "年月日",
                "收盤價(元)",
                "成交值(千元)",
                "市值(百萬元)",
                "週轉率％",
            ]
        )
        .sort_values(["ticker", "年月日"])
        .drop_duplicates(["ticker", "年月日"], keep="last")
        .reset_index(drop=True)
    )

    if df.empty:
        raise ValueError(f"{path.name} 沒有可用資料。")

    return df


def main():
    print("=" * 120)
    print("MODEL 2 — USER-SCOPED CAUSAL CANDIDATE SELECTION | PRODUCTION")
    print("=" * 120)
    print("Flow: investor_type pool -> frontend selected stocks -> causal evaluation -> candidate set")
    print("No GA optimization is performed here.")

    profile, investor_type, selection_mode, requested_ids = read_profile()

    pool_file = POOL_FILES[investor_type]
    print(f"\nInvestor type : {investor_type}")
    print(f"Pool file     : {pool_file.name}")
    print(f"Selection mode: {selection_mode}")

    df = read_pool(pool_file, investor_type)

    pool_ids = sorted(df["ticker"].astype(str).unique().tolist())

    if selection_mode == "custom":
        requested_set = set(requested_ids)
        valid_ids = [x for x in requested_ids if x in set(pool_ids)]
        excluded_ids = [x for x in requested_ids if x not in set(pool_ids)]

        if not valid_ids:
            raise ValueError(
                "使用者選擇的股票與該 investor_type 股票池沒有任何交集。"
            )

        df = df[df["ticker"].isin(valid_ids)].copy()
    else:
        valid_ids = pool_ids
        excluded_ids = []

    decision_date = df["年月日"].max()
    start_date = decision_date - pd.Timedelta(days=LOOKBACK_DAYS)

    hist = df[
        (df["年月日"] >= start_date)
        & (df["年月日"] <= decision_date)
    ].copy()

    audit = []

    future_rows = int((hist["年月日"] > decision_date).sum())
    audit.append(
        {
            "check_name": "No future observations used",
            "status": "PASS" if future_rows == 0 else "FAIL",
            "detail": f"future_rows={future_rows}",
        }
    )

    audit.append(
        {
            "check_name": "Investor pool restriction applied",
            "status": "PASS",
            "detail": f"investor_type={investor_type}; pool={pool_file.name}; pool_stocks={len(pool_ids)}",
        }
    )

    audit.append(
        {
            "check_name": "Frontend stock scope applied",
            "status": "PASS",
            "detail": (
                f"mode={selection_mode}; requested={len(requested_ids)}; "
                f"valid={len(valid_ids)}; excluded={excluded_ids}"
            ),
        }
    )

    rows = []

    for ticker, g in hist.groupby("ticker"):
        g = g.sort_values("年月日").reset_index(drop=True)

        if len(g) < MIN_OBSERVATIONS:
            continue

        latest = g.iloc[-1]
        closes = pd.to_numeric(g["收盤價(元)"], errors="coerce")

        daily_returns = closes.pct_change()

        ret20 = (
            float(closes.iloc[-1] / closes.iloc[-21] - 1.0)
            if len(closes) >= 21 and closes.iloc[-21] > 0
            else np.nan
        )

        vol20 = (
            float(daily_returns.tail(20).std(ddof=1))
            if daily_returns.tail(20).notna().sum() >= 15
            else np.nan
        )

        avg_value = float(g["成交值(千元)"].tail(20).mean())
        avg_turnover = float(g["週轉率％"].tail(20).mean())

        # 保留舊 Model 2 loader 相容格式："2330 台積電"
        combined_id = f"{ticker} {latest['name']}".strip()

        rows.append(
            {
                "stock_id": combined_id,
                "ticker": str(ticker),
                "name": str(latest["name"]),
                "investor_class": investor_type,
                "decision_date": decision_date.date().isoformat(),
                "latest_price": float(latest["收盤價(元)"]),
                "market_cap_million": float(latest["市值(百萬元)"]),
                "avg_turnover_value_20d_thousand": avg_value,
                "avg_turnover_rate_20d": avg_turnover,
                "return_20d": ret20,
                "volatility_20d": vol20,
                "observations_in_lookback": len(g),
            }
        )

    candidates = pd.DataFrame(rows)

    if candidates.empty:
        raise RuntimeError(
            "目前使用者股票範圍沒有產生任何符合最少觀測數的候選股票。"
        )

    core_cols = [
        "latest_price",
        "market_cap_million",
        "avg_turnover_value_20d_thousand",
        "avg_turnover_rate_20d",
        "return_20d",
        "volatility_20d",
    ]

    before = len(candidates)
    candidates = candidates.dropna(subset=core_cols).copy()
    dropped = before - len(candidates)

    audit.append(
        {
            "check_name": "Core candidate fields complete",
            "status": "PASS" if dropped == 0 else "WARN",
            "detail": f"dropped_missing_core={dropped}",
        }
    )

    candidates["market_cap_rank_pct"] = candidates["market_cap_million"].rank(
        method="average",
        pct=True,
    )

    def cap_class(p):
        if p <= 1 / 3:
            return "Small"
        if p <= 2 / 3:
            return "Mid"
        return "Large"

    candidates["market_cap_class_sample"] = candidates[
        "market_cap_rank_pct"
    ].map(cap_class)

    candidates["liquidity_eligible"] = (
        (candidates["latest_price"] > 0)
        & (candidates["avg_turnover_value_20d_thousand"] > 0)
        & (candidates["market_cap_million"] > 0)
    )

    formal = candidates[candidates["liquidity_eligible"]].copy()

    if formal.empty:
        raise RuntimeError("流動性 / 價格 / 市值檢查後沒有可用股票。")

    formal["score_return"] = formal["return_20d"].rank(pct=True)
    formal["score_liquidity"] = formal[
        "avg_turnover_value_20d_thousand"
    ].rank(pct=True)
    formal["score_turnover"] = formal["avg_turnover_rate_20d"].rank(pct=True)
    formal["score_low_volatility"] = (-formal["volatility_20d"]).rank(pct=True)

    formal["selection_score"] = (
        0.35 * formal["score_return"]
        + 0.30 * formal["score_liquidity"]
        + 0.15 * formal["score_turnover"]
        + 0.20 * formal["score_low_volatility"]
    )

    formal = formal.sort_values(
        ["selection_score", "market_cap_million"],
        ascending=[False, False],
    ).reset_index(drop=True)

    formal["selection_rank"] = np.arange(1, len(formal) + 1)

    audit.append(
        {
            "check_name": "Positive price/liquidity/market cap",
            "status": "PASS" if bool(formal["liquidity_eligible"].all()) else "FAIL",
            "detail": f"eligible={len(formal)}/{len(candidates)}",
        }
    )

    audit.append(
        {
            "check_name": "Candidate IDs unique",
            "status": "PASS" if formal["ticker"].is_unique else "FAIL",
            "detail": f"rows={len(formal)}, unique_stocks={formal['ticker'].nunique()}",
        }
    )

    formal_ids = set(formal["ticker"].astype(str))

    if selection_mode == "custom":
        scope_ok = formal_ids.issubset(set(valid_ids))
    else:
        scope_ok = formal_ids.issubset(set(pool_ids))

    audit.append(
        {
            "check_name": "No stock outside allowed frontend/investor scope",
            "status": "PASS" if scope_ok else "FAIL",
            "detail": f"formal_ids={sorted(formal_ids)}",
        }
    )

    ga_feasible = len(formal) >= MIN_GA_STOCKS

    audit.append(
        {
            "check_name": "Enough stocks for frozen 30% GA cap",
            "status": "PASS" if ga_feasible else "FAIL",
            "detail": f"available={len(formal)}; minimum_required={MIN_GA_STOCKS}",
        }
    )

    if MODEL1_FILE.exists():
        m1 = pd.read_csv(MODEL1_FILE, encoding="utf-8-sig")
        require_columns(
            m1,
            [
                "target_month",
                "predicted_regime",
                "prob_Bear",
                "prob_Bull",
                "prob_Sideways",
            ],
            MODEL1_FILE.name,
        )
        audit.append(
            {
                "check_name": "Model 1 production interface available",
                "status": "PASS",
                "detail": f"{MODEL1_FILE.name}; rows={len(m1)}",
            }
        )
    else:
        audit.append(
            {
                "check_name": "Model 1 production interface available",
                "status": "WARN",
                "detail": f"Missing {MODEL1_FILE.name}",
            }
        )

    audit_df = pd.DataFrame(audit)
    n_fail = int((audit_df["status"] == "FAIL").sum())
    n_warn = int((audit_df["status"] == "WARN").sum())
    n_pass = int((audit_df["status"] == "PASS").sum())

    summary = pd.DataFrame(
        [
            {
                "decision_date": decision_date.date().isoformat(),
                "investor_type": investor_type,
                "pool_file": pool_file.name,
                "selection_mode": selection_mode,
                "requested_stock_count": len(requested_ids),
                "valid_frontend_stock_count": len(valid_ids),
                "excluded_stock_ids": "|".join(excluded_ids),
                "candidate_count": len(formal),
                "lookback_days": LOOKBACK_DAYS,
                "audit_pass_count": n_pass,
                "audit_warn_count": n_warn,
                "audit_fail_count": n_fail,
                "candidate_selection_ready": n_fail == 0,
            }
        ]
    )

    formal["price"] = formal["latest_price"]
    formal["market_cap"] = formal["market_cap_million"]
    formal["avg_volume_value"] = formal["avg_turnover_value_20d_thousand"]

    formal.to_csv(
        OUTPUT_CANDIDATES,
        index=False,
        encoding="utf-8-sig",
    )
    audit_df.to_csv(
        OUTPUT_AUDIT,
        index=False,
        encoding="utf-8-sig",
    )
    summary.to_csv(
        OUTPUT_SUMMARY,
        index=False,
        encoding="utf-8-sig",
    )

    print("\n" + "=" * 120)
    print("CANDIDATE SELECTION SUMMARY")
    print("=" * 120)
    print(summary.to_string(index=False))

    print("\n" + "=" * 120)
    print("CANDIDATES")
    print("=" * 120)

    show_cols = [
        "selection_rank",
        "ticker",
        "name",
        "investor_class",
        "latest_price",
        "market_cap_million",
        "return_20d",
        "volatility_20d",
        "selection_score",
    ]
    print(formal[show_cols].to_string(index=False))

    print("\n" + "=" * 120)
    print("AUDIT DETAIL")
    print("=" * 120)
    print(audit_df.to_string(index=False))

    print("\n已輸出：")
    print(f"- {OUTPUT_CANDIDATES.name}")
    print(f"- {OUTPUT_AUDIT.name}")
    print(f"- {OUTPUT_SUMMARY.name}")

    if n_fail == 0:
        print("\nAUDIT RESULT: MODEL 2 USER-SCOPED CANDIDATE SELECTION PASS")
    else:
        print("\nAUDIT RESULT: MODEL 2 USER-SCOPED CANDIDATE SELECTION HAS FAILURES")
        raise RuntimeError("Model 2 candidate-selection audit failed.")


if __name__ == "__main__":
    main()
