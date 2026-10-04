# -*- coding: utf-8 -*-
"""
model_3_agent_reputation.py

用途：
- 讀取 model_3_feedback.json（投資後績效）
- 讀取 model_3_final_discussion_output.json（第二輪 Agent / Judge 決策）
- 以實際股價判斷各 Agent 的「方向決策準確率」
- 結合：
    1) 投資報酬相對 Model 2 是否改善
    2) Sharpe Ratio 是否改善
    3) 方向決策準確率
    4) 最大回撤是否改善
  更新 Agent Reputation
- INTERIM 回饋會依完成天數降低更新幅度；FINAL_20D 使用完整更新幅度
- 輸出下一輪可使用的 Agent influence weights

說明：
四項指標採等權重（各 25%）。
此權重是本系統的透明實作定義，不是老師文件指定的固定公式。
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

try:
    import yfinance as yf
except ModuleNotFoundError:
    print("缺少 yfinance，請執行：python -m pip install yfinance")
    raise

BASE = Path(__file__).resolve().parent

FEEDBACK_FILE = BASE / "model_3_feedback.json"
DISCUSSION_FILE = BASE / "model_3_final_discussion_output.json"

REPUTATION_JSON = BASE / "model_3_agent_reputation.json"
REPUTATION_CSV = BASE / "model_3_agent_reputation.csv"
REPORT_FILE = BASE / "model_3_agent_reputation_report.txt"

BASE_UPDATE_RATE = 0.20
DEFAULT_REPUTATION = 0.50

AGENTS = ["risk_seeking", "risk_averse"]
JUDGE = "judge"


def sign_score(x: float, eps: float = 1e-12) -> float:
    """改善=1、持平=0.5、惡化=0。"""
    if x > eps:
        return 1.0
    if x < -eps:
        return 0.0
    return 0.5


def clean_asset(v) -> str:
    s = str(v).strip()
    if s.lower() == "cash" or s == "現金":
        return "CASH"
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s


def read_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"找不到 {path.name}")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def get_round2_decision(structured: dict, role: str) -> dict:
    # 正式固定兩輪優先抓 round2；若未來結構不同，退回最後一輪。
    direct = structured.get(f"{role}_round2")
    if isinstance(direct, dict):
        return direct

    candidates = []
    prefix = role + "_round"
    for k, v in structured.items():
        if not k.startswith(prefix) or not isinstance(v, dict):
            continue
        try:
            n = int(k[len(prefix):])
        except ValueError:
            continue
        candidates.append((n, v))

    if candidates:
        return max(candidates, key=lambda x: x[0])[1]

    raise ValueError(f"找不到 {role} 的第二輪/最後一輪決策。")


def extract_deltas(decision: dict) -> dict[str, float]:
    raw = decision.get("weight_changes_pp")
    if isinstance(raw, dict):
        out = {}
        for a, v in raw.items():
            a = clean_asset(a)
            if a == "CASH":
                continue
            try:
                fv = float(v)
            except Exception:
                continue
            if math.isfinite(fv):
                out[a] = fv
        if out:
            return out

    # 若沒有數值 delta，才退回 directions。
    directions = decision.get("directions")
    if isinstance(directions, dict):
        out = {}
        for a, d in directions.items():
            a = clean_asset(a)
            if a == "CASH":
                continue
            d = str(d).strip().lower()
            if d in {"increase", "提高", "增加", "加碼"}:
                out[a] = 1.0
            elif d in {"decrease", "降低", "減少", "減碼"}:
                out[a] = -1.0
            elif d in {"maintain", "維持", "不變"}:
                out[a] = 0.0
        if out:
            return out

    raise ValueError("Agent 決策缺少 weight_changes_pp / directions。")


def download_realized_return(asset: str, entry_date: str, exit_date: str) -> float:
    start = pd.Timestamp(entry_date)
    exit_ts = pd.Timestamp(exit_date)
    end = exit_ts + pd.Timedelta(days=7)

    errors = []
    for suffix in (".TW", ".TWO"):
        symbol = asset if "." in asset else asset + suffix

        try:
            df = yf.download(
                symbol,
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                auto_adjust=True,
                progress=False,
                threads=False,
            )

            if df is None or df.empty:
                errors.append(f"{symbol}: empty")
                continue

            close = df["Close"]
            if isinstance(close, pd.DataFrame):
                close = close.iloc[:, 0]

            close = pd.to_numeric(close, errors="coerce").dropna()
            close.index = pd.to_datetime(close.index).tz_localize(None)

            valid = close[(close.index >= start) & (close.index <= exit_ts)]
            if len(valid) < 2:
                errors.append(f"{symbol}: insufficient rows")
                continue

            return float((valid.iloc[-1] / valid.iloc[0] - 1.0) * 100.0)

        except Exception as e:
            errors.append(f"{symbol}: {e}")

    raise RuntimeError(f"{asset} 無法取得實際報酬；" + " | ".join(errors))


def directional_accuracy(
    deltas: dict[str, float],
    realized_returns: dict[str, float],
) -> tuple[float, list[dict]]:
    """
    僅評估有明確 increase/decrease 的股票。
    maintain 不列入分母，避免任意設定「多少漲跌算維持」的門檻。
    """
    rows = []

    for asset, delta in deltas.items():
        if abs(delta) <= 1e-12:
            rows.append({
                "asset": asset,
                "delta_pp": delta,
                "realized_return_pct": realized_returns.get(asset),
                "evaluated": False,
                "correct": None,
                "reason": "maintain_not_scored",
            })
            continue

        rr = realized_returns.get(asset)
        if rr is None:
            rows.append({
                "asset": asset,
                "delta_pp": delta,
                "realized_return_pct": None,
                "evaluated": False,
                "correct": None,
                "reason": "missing_realized_return",
            })
            continue

        correct = (delta > 0 and rr > 0) or (delta < 0 and rr < 0)

        rows.append({
            "asset": asset,
            "delta_pp": delta,
            "realized_return_pct": rr,
            "evaluated": True,
            "correct": bool(correct),
            "reason": (
                "direction_matches_realized_return"
                if correct
                else "direction_conflicts_with_realized_return"
            ),
        })

    evaluated = [r for r in rows if r["evaluated"]]
    if not evaluated:
        return 0.5, rows

    acc = sum(bool(r["correct"]) for r in evaluated) / len(evaluated)
    return float(acc), rows


def read_previous_reputation() -> dict[str, float]:
    if not REPUTATION_JSON.exists():
        return {
            "risk_seeking": DEFAULT_REPUTATION,
            "risk_averse": DEFAULT_REPUTATION,
            "judge": DEFAULT_REPUTATION,
        }

    try:
        old = read_json(REPUTATION_JSON)
        reps = old.get("reputation_scores", {})
        return {
            role: float(reps.get(role, DEFAULT_REPUTATION))
            for role in ["risk_seeking", "risk_averse", "judge"]
        }
    except Exception:
        return {
            "risk_seeking": DEFAULT_REPUTATION,
            "risk_averse": DEFAULT_REPUTATION,
            "judge": DEFAULT_REPUTATION,
        }


def main():
    feedback = read_json(FEEDBACK_FILE)
    discussion = read_json(DISCUSSION_FILE)

    structured = discussion.get("structured_decisions", {})
    if not isinstance(structured, dict):
        raise ValueError("discussion JSON 缺少 structured_decisions。")

    entry_date = feedback.get("entry_trading_date")
    exit_date = feedback.get("exit_trading_date")
    if not entry_date or not exit_date:
        raise ValueError("feedback JSON 缺少 entry/exit trading date。")

    comparison = feedback.get("comparison", {})
    return_diff = float(
        comparison.get("return_difference_pp_model3_minus_model2", 0.0)
    )
    vol_diff = float(
        comparison.get("volatility_difference_pp_model3_minus_model2", 0.0)
    )
    sharpe_diff = float(
        comparison.get("sharpe_difference_model3_minus_model2", 0.0)
    )
    mdd_diff = float(
        comparison.get("max_drawdown_difference_pp_model3_minus_model2", 0.0)
    )

    holding_days = int(feedback.get("holding_period_trading_days", 0) or 0)
    target_days = int(feedback.get("target_holding_days", 20) or 20)
    confidence = min(1.0, holding_days / max(target_days, 1))
    effective_alpha = BASE_UPDATE_RATE * confidence

    rs = get_round2_decision(structured, "risk_seeking")
    ra = get_round2_decision(structured, "risk_averse")
    judge = structured.get("judge", {})
    if not isinstance(judge, dict):
        judge = {}

    decisions = {
        "risk_seeking": rs,
        "risk_averse": ra,
        "judge": judge,
    }

    deltas = {}
    all_assets = set()
    for role, decision in decisions.items():
        try:
            d = extract_deltas(decision)
        except Exception:
            d = {}
        deltas[role] = d
        all_assets.update(d)

    if not all_assets:
        raise ValueError("找不到可評估的 Agent 股票方向。")

    realized_returns = {}
    for asset in sorted(all_assets):
        print(f"評估 {asset} 實際報酬...")
        realized_returns[asset] = download_realized_return(
            asset, entry_date, exit_date
        )

    # 三個投資績效指標，皆以「Model 3 相對 Model 2 是否改善」計分。
    return_score = sign_score(return_diff)
    sharpe_score = sign_score(sharpe_diff)
    # MDD 越高（越接近0）越好，因此 Model3-Model2 > 0 為改善
    mdd_score = sign_score(mdd_diff)

    previous = read_previous_reputation()
    rows = []
    new_reps = {}
    accuracy_details = {}

    for role in ["risk_seeking", "risk_averse", "judge"]:
        if deltas[role]:
            acc, details = directional_accuracy(
                deltas[role],
                realized_returns,
            )
        else:
            acc, details = 0.5, []

        accuracy_details[role] = details

        # 老師指定四項：return / Sharpe / decision accuracy / max drawdown
        # 本系統採等權重，各 25%。
        case_score = (
            return_score
            + sharpe_score
            + acc
            + mdd_score
        ) / 4.0

        old_rep = float(previous.get(role, DEFAULT_REPUTATION))
        new_rep = (
            old_rep * (1.0 - effective_alpha)
            + case_score * effective_alpha
        )
        new_rep = max(0.0, min(1.0, new_rep))
        new_reps[role] = new_rep

        rows.append({
            "agent": role,
            "previous_reputation": old_rep,
            "directional_accuracy": acc,
            "return_component": return_score,
            "sharpe_component": sharpe_score,
            "max_drawdown_component": mdd_score,
            "case_score": case_score,
            "feedback_confidence": confidence,
            "effective_update_rate": effective_alpha,
            "new_reputation": new_rep,
        })

    # 下一輪辯論只調整兩個 debating agents 的 influence。
    debate_total = new_reps["risk_seeking"] + new_reps["risk_averse"]
    if debate_total <= 0:
        debate_weights = {
            "risk_seeking": 0.5,
            "risk_averse": 0.5,
        }
    else:
        debate_weights = {
            "risk_seeking": new_reps["risk_seeking"] / debate_total,
            "risk_averse": new_reps["risk_averse"] / debate_total,
        }

    status = str(feedback.get("evaluation_status", "UNKNOWN"))

    payload = {
        "schema_version": "agent_reputation_v1",
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "evaluation_status": status,
        "feedback_window": {
            "entry_trading_date": entry_date,
            "exit_trading_date": exit_date,
            "holding_days": holding_days,
            "target_holding_days": target_days,
            "confidence": confidence,
        },
        "metric_definition": {
            "weights": {
                "investment_return": 0.25,
                "sharpe_ratio": 0.25,
                "decision_accuracy": 0.25,
                "maximum_drawdown": 0.25,
            },
            "performance_component_rule": (
                "Model 3 better than Model 2 = 1; equal = 0.5; worse = 0."
            ),
            "decision_accuracy_rule": (
                "For each agent, only non-zero stock increase/decrease calls "
                "are scored. Increase is correct when realized stock return > 0; "
                "decrease is correct when realized stock return < 0; maintain is "
                "excluded from the denominator."
            ),
            "update_rule": (
                "new = old*(1-alpha) + case_score*alpha; "
                "alpha = 0.20 * min(1, holding_days/20)"
            ),
        },
        "portfolio_feedback": {
            "return_difference_pp": return_diff,
            "volatility_difference_pp": vol_diff,
            "sharpe_difference": sharpe_diff,
            "max_drawdown_difference_pp": mdd_diff,
            "return_component": return_score,
            "sharpe_component": sharpe_score,
            "max_drawdown_component": mdd_score,
        },
        "realized_stock_returns_pct": realized_returns,
        "reputation_scores": new_reps,
        "debate_influence_weights": debate_weights,
        "judge_reputation": new_reps["judge"],
        "directional_accuracy_details": accuracy_details,
        "note": (
            "INTERIM feedback is provisional. Its update strength is reduced "
            "according to completed holding days. FINAL_20D uses full alpha=0.20."
        ),
    }

    REPUTATION_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    pd.DataFrame(rows).to_csv(
        REPUTATION_CSV,
        index=False,
        encoding="utf-8-sig",
    )

    def pct(x):
        return f"{x*100:.2f}%"

    report = f"""MODEL 3 AGENT REPUTATION UPDATE
============================================================
Feedback 狀態：{status}
評估期間：{entry_date} ~ {exit_date}
完成交易日：{holding_days}/{target_days}
Feedback confidence：{confidence:.2f}
本次實際更新率 alpha：{effective_alpha:.3f}

投資結果相對 Model 2：
- 報酬差異：{return_diff:+.2f} 個百分點
- Sharpe 差異：{sharpe_diff:+.4f}
- 最大回撤差異：{mdd_diff:+.2f} 個百分點
- 年化波動差異：{vol_diff:+.2f} 個百分點（保留作風險說明，不重複計入四項 Reputation）

四項 Reputation 指標採等權重：
Return 25% + Sharpe 25% + Decision Accuracy 25% + Max Drawdown 25%

Risk-Seeking Agent
- Directional Accuracy：{pct(rows[0]['directional_accuracy'])}
- Previous Reputation：{rows[0]['previous_reputation']:.4f}
- Case Score：{rows[0]['case_score']:.4f}
- New Reputation：{rows[0]['new_reputation']:.4f}

Risk-Averse Agent
- Directional Accuracy：{pct(rows[1]['directional_accuracy'])}
- Previous Reputation：{rows[1]['previous_reputation']:.4f}
- Case Score：{rows[1]['case_score']:.4f}
- New Reputation：{rows[1]['new_reputation']:.4f}

Judge
- Directional Accuracy：{pct(rows[2]['directional_accuracy'])}
- Previous Reputation：{rows[2]['previous_reputation']:.4f}
- Case Score：{rows[2]['case_score']:.4f}
- New Reputation：{rows[2]['new_reputation']:.4f}

下一輪 Debate Influence：
- Risk-Seeking：{pct(debate_weights['risk_seeking'])}
- Risk-Averse：{pct(debate_weights['risk_averse'])}

說明：
目前若為 INTERIM，Reputation 為暫時值。
等完整 20 個交易日後再次跑 feedback，再執行本程式即可更新正式分數。
============================================================
"""

    REPORT_FILE.write_text(report, encoding="utf-8")
    print("\n" + report)
    print("Created:")
    print(f"- {REPUTATION_JSON.name}")
    print(f"- {REPUTATION_CSV.name}")
    print(f"- {REPORT_FILE.name}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n[ERROR] {type(exc).__name__}: {exc}")
        sys.exit(1)
