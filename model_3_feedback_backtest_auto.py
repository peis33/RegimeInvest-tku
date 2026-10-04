# -*- coding: utf-8 -*-
"""
model_3_feedback_backtest_auto.py

自動版：
- 不需要手動輸入日期。
- 自動從 experiment_model_2_candidate_selection_summary.csv 讀 decision_date。
- 自動從「下一個共同交易日」開始計算。
- 最多評估 20 個交易日；若目前尚不足 20 日，就輸出 Interim N-day Feedback。
- 比較 Model 2（GA）與 Model 3（GA + Agent）。
"""

from __future__ import annotations

import json
import math
import sys
from datetime import timedelta
from pathlib import Path

import pandas as pd

try:
    import yfinance as yf
except ModuleNotFoundError:
    print("缺少 yfinance，請執行：python -m pip install yfinance")
    raise

BASE = Path(__file__).resolve().parent

DECISION_FILE = BASE / "experiment_model_2_candidate_selection_summary.csv"
MODEL2_FILE = BASE / "portfolio_allocation_output.csv"
MODEL3_FILE = BASE / "model_3_advisory_allocation.csv"

OUT_SUMMARY = BASE / "model_3_feedback_backtest_results.csv"
OUT_DAILY = BASE / "model_3_feedback_daily_nav.csv"
OUT_JSON = BASE / "model_3_feedback.json"
OUT_REPORT = BASE / "model_3_feedback_report.txt"

TARGET_HOLDING_DAYS = 20
TRADING_DAYS_PER_YEAR = 252


def clean_asset(v):
    s = str(v).strip()
    if s.lower() == "cash" or s == "現金":
        return "CASH"
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s


def detect_col(df, names, label):
    for c in names:
        if c in df.columns:
            return c
    raise ValueError(f"找不到 {label} 欄位。現有欄位：{list(df.columns)}")


def read_decision_date():
    if not DECISION_FILE.exists():
        raise FileNotFoundError(f"找不到 {DECISION_FILE.name}")

    df = pd.read_csv(DECISION_FILE, encoding="utf-8-sig")
    if df.empty or "decision_date" not in df.columns:
        raise ValueError(
            f"{DECISION_FILE.name} 找不到 decision_date。"
        )

    value = pd.to_datetime(df.iloc[-1]["decision_date"], errors="coerce")
    if pd.isna(value):
        raise ValueError("decision_date 無法解析。")
    return pd.Timestamp(value).normalize()


def normalize_weights(s):
    s = pd.to_numeric(s, errors="coerce").fillna(0.0).astype(float)
    if s.sum() <= 1.05 and s.abs().max() <= 1.0:
        s = s * 100.0
    return s


def load_weights(path, model_name):
    if not path.exists():
        raise FileNotFoundError(f"找不到 {path.name}")

    df = pd.read_csv(path, encoding="utf-8-sig")

    asset_col = detect_col(
        df,
        ["asset", "stock_id", "stock_code", "ticker", "symbol", "code"],
        f"{model_name} 股票代碼",
    )

    if model_name == "Model 2":
        weight_candidates = [
            "final_weight_percent",
            "weight_percent",
            "final_weight",
            "weight",
            "allocation_percent",
        ]
    else:
        weight_candidates = [
            "proposed_weight_percent",
            "advisory_weight_percent",
            "final_weight_percent",
            "weight_percent",
            "weight",
        ]

    weight_col = detect_col(df, weight_candidates, f"{model_name} 權重")

    assets = df[asset_col].map(clean_asset)
    weights = normalize_weights(df[weight_col])

    out = {}
    for a, w in zip(assets, weights):
        if not a or a.lower() == "nan":
            continue
        out[a] = out.get(a, 0.0) + float(w)

    total = sum(out.values())
    if abs(total - 100.0) > 0.5:
        raise ValueError(f"{model_name} 權重總和不是 100%：{total:.4f}%")
    return out


def download_stock(asset, start, end):
    errors = []

    for suffix in (".TW", ".TWO"):
        symbol = asset if "." in asset else asset + suffix
        try:
            d = yf.download(
                symbol,
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                auto_adjust=True,
                progress=False,
                threads=False,
            )

            if d is None or d.empty:
                errors.append(f"{symbol}: empty")
                continue

            close = d["Close"]
            if isinstance(close, pd.DataFrame):
                close = close.iloc[:, 0]

            close = pd.to_numeric(close, errors="coerce").dropna()
            if len(close) >= 2:
                close.name = asset
                return close

            errors.append(f"{symbol}: insufficient rows")

        except Exception as e:
            errors.append(f"{symbol}: {e}")

    raise RuntimeError(f"{asset} 無法取得價格資料；" + " | ".join(errors))


def build_price_panel(assets, decision_date):
    stocks = sorted(a for a in set(assets) if a != "CASH")
    start = decision_date
    end = decision_date + timedelta(days=70)

    rows = []
    for asset in stocks:
        print(f"下載 {asset} 價格...")
        rows.append(download_stock(asset, start, end))

    prices = pd.concat(rows, axis=1, join="inner").sort_index()
    prices.index = pd.to_datetime(prices.index).tz_localize(None)

    # 真正投資從 decision_date 之後的下一個共同交易日開始
    prices = prices.loc[prices.index > decision_date]

    if len(prices) < 2:
        raise ValueError("decision_date 之後沒有足夠的共同交易日資料。")

    # 需要 entry + N 個後續交易日，因此最多取 21 列
    max_rows = TARGET_HOLDING_DAYS + 1
    return prices.iloc[:max_rows].copy()


def nav_from_weights(prices, weights):
    rel = prices / prices.iloc[0]
    nav = pd.Series(0.0, index=prices.index, dtype=float)

    for asset, pct in weights.items():
        w = float(pct) / 100.0
        if asset == "CASH":
            nav += w
        else:
            if asset not in rel.columns:
                raise ValueError(f"價格資料缺少 {asset}")
            nav += w * rel[asset]

    return nav


def calc_metrics(nav):
    r = nav.pct_change().dropna()
    holding_return = (nav.iloc[-1] / nav.iloc[0] - 1.0) * 100.0

    if len(r) >= 2 and float(r.std(ddof=1)) > 0:
        vol = float(r.std(ddof=1) * math.sqrt(TRADING_DAYS_PER_YEAR) * 100.0)
        sharpe = float(
            r.mean() / r.std(ddof=1) * math.sqrt(TRADING_DAYS_PER_YEAR)
        )
    else:
        vol = 0.0
        sharpe = 0.0

    dd = nav / nav.cummax() - 1.0

    return {
        "actual_holding_return_pct": float(holding_return),
        "annualized_volatility_pct": vol,
        "sharpe_ratio_rf0": sharpe,
        "max_drawdown_pct": float(dd.min() * 100.0),
    }


def main():
    decision_date = read_decision_date()

    print("=" * 88)
    print("MODEL 3 AUTO POST-INVESTMENT FEEDBACK BACKTEST")
    print("=" * 88)
    print(f"自動讀取 decision_date：{decision_date:%Y-%m-%d}")
    print("進場規則：decision_date 後的下一個共同交易日")
    print(f"目標評估期間：{TARGET_HOLDING_DAYS} 個交易日")

    model2 = load_weights(MODEL2_FILE, "Model 2")
    model3 = load_weights(MODEL3_FILE, "Model 3")

    prices = build_price_panel(set(model2) | set(model3), decision_date)

    actual_holding_days = len(prices) - 1
    status = (
        "FINAL_20D"
        if actual_holding_days >= TARGET_HOLDING_DAYS
        else f"INTERIM_{actual_holding_days}D"
    )

    nav2 = nav_from_weights(prices, model2)
    nav3 = nav_from_weights(prices, model3)

    m2 = calc_metrics(nav2)
    m3 = calc_metrics(nav3)

    return_diff = m3["actual_holding_return_pct"] - m2["actual_holding_return_pct"]
    vol_diff = m3["annualized_volatility_pct"] - m2["annualized_volatility_pct"]
    sharpe_diff = m3["sharpe_ratio_rf0"] - m2["sharpe_ratio_rf0"]
    mdd_diff = m3["max_drawdown_pct"] - m2["max_drawdown_pct"]

    summary = pd.DataFrame([
        {"portfolio": "Model 2 GA", **m2},
        {"portfolio": "Model 3 GA+Agent", **m3},
    ])
    summary["evaluation_status"] = status
    summary["holding_days"] = actual_holding_days
    summary.to_csv(OUT_SUMMARY, index=False, encoding="utf-8-sig")

    daily = pd.DataFrame({
        "date": prices.index.strftime("%Y-%m-%d"),
        "model2_nav": nav2.values,
        "model3_nav": nav3.values,
    })
    daily["model2_daily_return_pct"] = nav2.pct_change().fillna(0).values * 100
    daily["model3_daily_return_pct"] = nav3.pct_change().fillna(0).values * 100
    daily.to_csv(OUT_DAILY, index=False, encoding="utf-8-sig")

    feedback = {
        "schema_version": "model_3_post_investment_feedback_auto_v1",
        "evaluation_status": status,
        "decision_date": decision_date.strftime("%Y-%m-%d"),
        "entry_trading_date": prices.index[0].strftime("%Y-%m-%d"),
        "exit_trading_date": prices.index[-1].strftime("%Y-%m-%d"),
        "holding_period_trading_days": actual_holding_days,
        "target_holding_days": TARGET_HOLDING_DAYS,
        "model2_weights_percent": model2,
        "model3_weights_percent": model3,
        "model2_metrics": m2,
        "model3_metrics": m3,
        "comparison": {
            "return_difference_pp_model3_minus_model2": return_diff,
            "volatility_difference_pp_model3_minus_model2": vol_diff,
            "sharpe_difference_model3_minus_model2": sharpe_diff,
            "max_drawdown_difference_pp_model3_minus_model2": mdd_diff,
        },
        "feedback_for_next_agent_round": {
            "instruction": (
                "此結果作為下一期 Agent 的歷史績效 Evidence；"
                "不回頭修改前一期配置，也不是重新訓練 LLM 參數。"
            ),
            "return_difference_pp": return_diff,
            "volatility_difference_pp": vol_diff,
            "sharpe_difference": sharpe_diff,
            "max_drawdown_difference_pp": mdd_diff,
        },
    }

    OUT_JSON.write_text(
        json.dumps(feedback, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    report = f"""MODEL 3 投資後績效回饋
============================================================
評估狀態：{status}
Model 2 決策日：{decision_date:%Y-%m-%d}
實際進場交易日：{prices.index[0]:%Y-%m-%d}
實際截止交易日：{prices.index[-1]:%Y-%m-%d}
實際評估期間：{actual_holding_days} 個交易日
目標評估期間：{TARGET_HOLDING_DAYS} 個交易日

【Model 2：GA】
實際報酬率：{m2['actual_holding_return_pct']:.2f}%
年化波動率：{m2['annualized_volatility_pct']:.2f}%
Sharpe Ratio：{m2['sharpe_ratio_rf0']:.4f}
最大回撤：{m2['max_drawdown_pct']:.2f}%

【Model 3：GA + Agent】
實際報酬率：{m3['actual_holding_return_pct']:.2f}%
年化波動率：{m3['annualized_volatility_pct']:.2f}%
Sharpe Ratio：{m3['sharpe_ratio_rf0']:.4f}
最大回撤：{m3['max_drawdown_pct']:.2f}%

【加入 Agent 後差異】
報酬率：{return_diff:+.2f} 個百分點
年化波動率：{vol_diff:+.2f} 個百分點
Sharpe Ratio：{sharpe_diff:+.4f}
最大回撤差異：{mdd_diff:+.2f} 個百分點

說明：
{'已完成正式 20 交易日評估。' if status == 'FINAL_20D' else f'目前只有 {actual_holding_days} 個完整交易日，因此這是暫時性回饋；之後再次執行會自動延長，最多到 20 個交易日。'}

本次結果會寫入 model_3_feedback.json，
供下一期 Agent 作為歷史績效 Feedback Evidence。
============================================================
"""

    OUT_REPORT.write_text(report, encoding="utf-8")
    print("\n" + report)
    print("Created:")
    print(f"- {OUT_SUMMARY.name}")
    print(f"- {OUT_DAILY.name}")
    print(f"- {OUT_JSON.name}")
    print(f"- {OUT_REPORT.name}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n[ERROR] {type(exc).__name__}: {exc}")
        sys.exit(1)
