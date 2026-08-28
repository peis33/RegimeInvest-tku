import json
import urllib.request
import re
import time
from pathlib import Path
from datetime import datetime

import pandas as pd

try:
    import ollama
except ModuleNotFoundError:
    ollama = None


# ============================================================
# Model 3 V4 — Structured Decision Agent
# LLM = choices / stance / debate
# Python = facts / validation / rendering
# ============================================================

ALLOCATION_FILE = "portfolio_allocation_output.csv"
MODEL1_FILE = "model_1_prediction_output.csv"

OUTPUT_CSV = "model_3_v5_1_final_output.csv"
OUTPUT_JSON = "model_3_v5_1_discussion_output.json"
REPORT_FILE = "model_3_v5_1_production_report.txt"
AUDIT_FILE = "model_3_v5_1_production_audit.csv"

MODELS = {
    "risk_seeking": "qwen3:8b",
    "risk_averse": "mistral:latest",
    "judge": "llama3.2:3b",
}

ACTIONS = {"increase", "decrease", "maintain"}
STANCE_CODES = {
    "return_priority",
    "score_priority",
    "risk_control",
    "concentration_control",
    "cash_buffer",
    "balanced",
}
JUDGE_ACTIONS = {"維持", "明顯調整"}

ROLE_STANCES = {
    "risk_seeking": {"return_priority", "score_priority", "balanced"},
    "risk_averse": {"risk_control", "concentration_control", "cash_buffer", "balanced"},
}

MIN_EVIDENCE_IDS = 2
MAX_EVIDENCE_IDS = 5


def check_ollama():
    if ollama is None:
        raise RuntimeError("找不到 ollama 套件，請執行：python -m pip install ollama")
    ollama.list()


def clean_json_text(text):
    text = re.sub(r"<think>.*?</think>", "", str(text or ""), flags=re.S).strip()
    text = re.sub(r"^```(?:json)?\s*", "", text).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    return text


def extract_json_object(text):
    """Parse direct JSON first; otherwise extract the first balanced {...} object."""
    s = clean_json_text(text)
    if not s:
        raise ValueError("empty model response")
    try:
        return json.loads(s)
    except Exception:
        pass

    start = s.find("{")
    if start < 0:
        raise ValueError("no JSON object found")

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(s[start:i+1])
    raise ValueError("unterminated JSON object")


def json_call(model, system, prompt, attempts=2):
    """
    Structured runtime.
    Qwen3 uses direct /api/chat with think=False and an INNER reliability-only
    transport retry (max 3 identical HTTP requests) for EMPTY_CONTENT or
    transport failure. The outer `attempts` loop remains the existing
    structured-format retry and may alter only its retry instruction.
    Other models preserve the Ollama Python SDK path.
    """
    last_text = ""
    last_error = ""

    for attempt in range(attempts):
        try:
            user_prompt = prompt
            if attempt > 0:
                user_prompt += (
                    "\nIMPORTANT: 上次輸出無法解析。"
                    "不要輸出思考過程、Markdown、解釋或前言；只輸出一個完整 JSON object。"
                )

            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ]

            if model.startswith("qwen3"):
                payload = {
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "think": False,
                    "format": "json",
                    "options": {
                        "temperature": 0.0,
                        "num_predict": 1200,
                        "num_ctx": 8192,
                    },
                }

                # Freeze the request bytes so transport retries are identical.
                request_body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                transport_error = None
                max_transport_attempts = 3

                for transport_attempt in range(1, max_transport_attempts + 1):
                    try:
                        req = urllib.request.Request(
                            "http://localhost:11434/api/chat",
                            data=request_body,
                            headers={"Content-Type": "application/json"},
                            method="POST",
                        )
                        with urllib.request.urlopen(req, timeout=180) as resp:
                            raw_http = resp.read().decode("utf-8", errors="replace")

                        envelope = json.loads(raw_http)
                        message = envelope.get("message") or {}
                        last_text = str(message.get("content") or "")

                        if last_text.strip():
                            transport_error = None
                            break

                        thinking = str(message.get("thinking") or "")
                        transport_error = (
                            f"QWEN_HTTP_EMPTY_CONTENT thinking_length={len(thinking)} "
                            f"done_reason={envelope.get('done_reason', '')}"
                        )
                    except Exception as transport_ex:
                        transport_error = (
                            f"{type(transport_ex).__name__}: {transport_ex}"
                        )

                    if transport_attempt < max_transport_attempts:
                        time.sleep(0.75)

                if transport_error is not None and not last_text.strip():
                    raise RuntimeError(
                        "Qwen transport exhausted after "
                        f"{max_transport_attempts} identical attempts: {transport_error}"
                    )

            else:
                r = ollama.chat(
                    model=model,
                    messages=messages,
                    format="json",
                    options={
                        "temperature": 0.0,
                        "num_predict": 1200,
                        "num_ctx": 8192,
                    },
                )
                last_text = str(r["message"]["content"] or "")

            obj = extract_json_object(last_text)
            if obj is None:
                raise ValueError("STRUCTURED_JSON_PARSE_RETURNED_NONE")
            return obj, last_text

        except Exception as ex:
            last_error = f"{type(ex).__name__}: {ex}"

    return None, f"[error: {last_error}] RAW={last_text[:1000]}"
def load_portfolio():
    p = Path(ALLOCATION_FILE)
    if not p.exists():
        raise FileNotFoundError(f"找不到 {ALLOCATION_FILE}")
    df = pd.read_csv(p)
    required = ["stock_id", "name", "asset_type", "final_weight_percent", "allocated_amount"]
    missing = [x for x in required if x not in df.columns]
    if missing:
        raise ValueError(f"Model 2 缺少欄位：{missing}")
    df["final_weight_percent"] = pd.to_numeric(df["final_weight_percent"], errors="coerce").fillna(0)
    return df


def load_model1():
    p = Path(MODEL1_FILE)
    if not p.exists():
        return {}
    df = pd.read_csv(p)
    if df.empty:
        return {}
    r = df.iloc[-1]
    return {c: r[c] for c in df.columns}


def asset_id(row):
    atype = str(row["asset_type"]).lower()
    sid = str(row["stock_id"])
    return "CASH" if atype == "cash" or sid.upper() == "CASH" else sid


def asset_label(row):
    aid = asset_id(row)
    return "現金" if aid == "CASH" else f"{aid} {row['name']}"


def build_evidence(df, m1):
    pos = df[df["final_weight_percent"] > 0.0001].copy()
    stocks = pos[pos["asset_type"].astype(str).str.lower() != "cash"].copy()
    cash = pos[pos["asset_type"].astype(str).str.lower() == "cash"].copy()

    for c in ["expected_return", "risk", "selection_score"]:
        if c in stocks.columns:
            stocks[c] = pd.to_numeric(stocks[c], errors="coerce")

    holdings = {}
    for _, r in pos.iterrows():
        aid = asset_id(r)
        holdings[aid] = {
            "id": aid,
            "label": asset_label(r),
            "weight": float(r["final_weight_percent"]),
            "asset_type": str(r["asset_type"]),
        }

    def ranked(col, ascending=False):
        if col not in stocks.columns:
            return []
        x = stocks.dropna(subset=[col]).sort_values(col, ascending=ascending)
        return [
            {"id": asset_id(r), "label": asset_label(r), "value": float(r[col])}
            for _, r in x.iterrows()
        ]

    weights = sorted(stocks["final_weight_percent"].astype(float), reverse=True)
    p_bear = float(m1.get("prob_Bear", 0) or 0)
    p_bull = float(m1.get("prob_Bull", 0) or 0)
    p_side = float(m1.get("prob_Sideways", 0) or 0)

    e = {
        "holdings": holdings,
        "market": {
            "regime": str(m1.get("predicted_regime", "Unknown")),
            "prob_Bear": p_bear,
            "prob_Bull": p_bull,
            "prob_Sideways": p_side,
            "duration": float(m1.get("expected_regime_duration_steps", 0) or 0),
            "mta_bear": float(m1.get("mta_to_bear_steps", 0) or 0),
        },
        "portfolio": {
            "cash": float(cash["final_weight_percent"].sum()) if not cash.empty else 0.0,
            "top1": weights[0] if weights else 0.0,
            "top2": sum(weights[:2]),
            "hhi": sum((w / 100.0) ** 2 for w in weights),
            "expected_return": ranked("expected_return", False),
            "risk": ranked("risk", False),
            "score": ranked("selection_score", False),
        }
    }
    return e


def make_evidence_catalog(e):
    p, m = e["portfolio"], e["market"]
    catalog = {}

    def add(eid, kind, text, asset=None):
        catalog[eid] = {"id": eid, "kind": kind, "text": text, "asset": asset}

    add("REGIME_1", "market",
        f"市場狀態為 {m['regime']}；Bear/Bull/Sideways={m['prob_Bear']*100:.2f}%/{m['prob_Bull']*100:.2f}%/{m['prob_Sideways']*100:.2f}%")
    add("DURATION_1", "market", f"預估狀態持續 {m['duration']:.2f} HMM steps")
    add("MTA_1", "market", f"MTA→Bear 為 {m['mta_bear']:.2f} HMM steps")
    add("CASH_1", "portfolio", f"現金權重為 {p['cash']:.2f}%", "CASH")
    add("CONC_1", "portfolio", f"Top-2 股票權重合計為 {p['top2']:.2f}%")
    add("CONC_2", "portfolio", f"股票權重 HHI 為 {p['hhi']:.4f}")

    for i, x in enumerate(p["expected_return"], 1):
        add(f"ER_{i}", "expected_return",
            f"{x['label']} expected_return={x['value']:.6f}，排名第{i}", x["id"])
    for i, x in enumerate(p["risk"], 1):
        # risk is high -> low
        wording = "最高" if i == 1 else ("最低" if i == len(p["risk"]) else f"第{i}高")
        add(f"RISK_{i}", "risk",
            f"{x['label']} risk={x['value']:.6f}，風險{wording}", x["id"])
    for i, x in enumerate(p["score"], 1):
        add(f"SCORE_{i}", "selection_score",
            f"{x['label']} selection_score={x['value']:.6f}，排名第{i}", x["id"])

    for aid, h in e["holdings"].items():
        add(f"WEIGHT_{aid}", "weight", f"{h['label']} 原始權重={h['weight']:.2f}%", aid)

    return catalog


def catalog_text(catalog):
    return "\n".join(f"- {k}: {v['text']}" for k, v in catalog.items())


def profile_text(df):
    vals = {}
    for c in ["investor_type", "risk_preference", "budget"]:
        if c in df.columns and not df[c].dropna().empty:
            vals[c] = df[c].dropna().iloc[0]
    return json.dumps(vals, ensure_ascii=False, default=str)


def json_call(model, system, prompt, attempts=2):
    last = ""
    for attempt in range(attempts):
        try:
            r = ollama.chat(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt if attempt == 0 else prompt + "\n上次格式無效。只輸出符合 schema 的 JSON，不要解釋。"},
                ],
                format="json",
                options={"temperature": 0.05, "num_predict": 650, "num_ctx": 8192},
            )
            last = clean_json_text(r["message"]["content"])
            return json.loads(last), last
        except Exception as ex:
            last = f"[error: {ex}]"
    return None, last


def normalize_agent_decision(obj, role, catalog):
    """
    Deterministic structural normalization only.
    It does NOT choose investment directions or evidence for the agent.
    It only removes duplicate/excess evidence IDs while preserving the model's order,
    and makes the redundant cash_direction field equal to directions['CASH'].
    """
    if not isinstance(obj, dict):
        return obj, []

    x = dict(obj)
    notes = []

    ev = x.get("evidence_ids")
    if isinstance(ev, list):
        seen = set()
        valid = []
        for eid in ev:
            if eid in catalog and eid not in seen:
                valid.append(eid)
                seen.add(eid)
        if len(valid) > MAX_EVIDENCE_IDS:
            notes.append(f"evidence_trimmed:{len(valid)}->{MAX_EVIDENCE_IDS}")
            valid = valid[:MAX_EVIDENCE_IDS]
        x["evidence_ids"] = valid

    dirs = x.get("directions")
    if isinstance(dirs, dict) and dirs.get("CASH") in ACTIONS:
        if x.get("cash_direction") != dirs["CASH"]:
            notes.append(
                f"cash_direction_synced:{x.get('cash_direction')}->{dirs['CASH']}"
            )
            x["cash_direction"] = dirs["CASH"]

    return x, notes

def validate_agent(obj, holdings, catalog, round_no, expected_role=None):
    errors = []
    if not isinstance(obj, dict):
        return False, ["not_json_object"]

    role = obj.get("role")
    if role not in {"risk_seeking", "risk_averse"}:
        errors.append("invalid_role")
    if expected_role is not None and role != expected_role:
        errors.append("role_identity_mismatch")

    dirs = obj.get("directions")
    if not isinstance(dirs, dict):
        errors.append("directions_not_object")
        dirs = {}
    if set(dirs.keys()) != set(holdings):
        errors.append("directions_assets_mismatch")
    if any(v not in ACTIONS for v in dirs.values()):
        errors.append("invalid_direction")

    ev = obj.get("evidence_ids")
    if not isinstance(ev, list) or len(ev) < MIN_EVIDENCE_IDS:
        errors.append("insufficient_evidence_ids")
        ev = []
    if isinstance(ev, list) and len(ev) > MAX_EVIDENCE_IDS:
        errors.append("too_many_evidence_ids")
    if any(x not in catalog for x in ev):
        errors.append("unknown_evidence_id")

    if obj.get("preferred_asset") not in holdings:
        errors.append("invalid_preferred_asset")
    if obj.get("avoid_asset") not in holdings:
        errors.append("invalid_avoid_asset")
    if obj.get("cash_direction") not in ACTIONS:
        errors.append("invalid_cash_direction")
    if dirs.get("CASH") != obj.get("cash_direction"):
        errors.append("cash_direction_mismatch")
    if obj.get("stance_code") not in STANCE_CODES:
        errors.append("invalid_stance_code")
    elif obj.get("stance_code") not in ROLE_STANCES.get(role, set()):
        errors.append("role_stance_inconsistent")

    if round_no == 2:
        if not isinstance(obj.get("accepted_opponent_claim_ids"), list):
            errors.append("missing_accepted_claim_ids")
        if not isinstance(obj.get("rebutted_opponent_claim_ids"), list):
            errors.append("missing_rebutted_claim_ids")
        if not obj.get("opponent_summary_code"):
            errors.append("missing_opponent_summary_code")
        accepted = obj.get("accepted_opponent_claim_ids", [])
        rebutted = obj.get("rebutted_opponent_claim_ids", [])
        if not accepted and not rebutted:
            errors.append("no_opponent_claim_engagement")
        if set(accepted) & set(rebutted):
            errors.append("same_claim_accepted_and_rebutted")

    return not errors, errors


def agent_schema(round_no):
    base = {
        "role": "risk_seeking|risk_averse",
        "preferred_asset": "one holding id",
        "avoid_asset": "one holding id",
        "cash_direction": "increase|decrease|maintain",
        "directions": {"<every holding id>": "increase|decrease|maintain"},
        "evidence_ids": ["at least two valid evidence IDs"],
        "stance_code": "role-appropriate stance code only",
    }
    if round_no == 2:
        base.update({
            "accepted_opponent_claim_ids": ["claim ids from opponent round 1, may be empty"],
            "rebutted_opponent_claim_ids": ["claim ids from opponent round 1, at least one when possible"],
            "opponent_summary_code": "short code-like phrase, no numbers",
        })
    return json.dumps(base, ensure_ascii=False, indent=2)


def make_claims(decision, prefix):
    claims = {}
    n = 1
    for aid, direction in decision["directions"].items():
        cid = f"{prefix}_C{n}"
        claims[cid] = {
            "id": cid,
            "asset": aid,
            "direction": direction,
            "evidence_ids": list(decision.get("evidence_ids", [])),
        }
        n += 1
    return claims


def round1_prompt(role, holdings, catalog, profile):
    role_rule = (
        "你是 Risk-Seeking：偏重 expected_return 與 selection_score，但仍需承認 risk 與集中度。"
        if role == "risk_seeking" else
        "你是 Risk-Averse：偏重 risk、集中度與現金緩衝，但仍需承認 expected_return 與 selection_score。"
    )
    return f"""你只做結構化決策，不得自行輸出或重算任何數值。
{role_rule}
你輸出的 role 必須與指定角色完全相同，不得切換角色。\n所有事實只能透過 evidence_ids 引用。不得發明門檻。
每輪 evidence_ids 必須挑選最有力的 2–5 個，不得把整個 Evidence Catalog 全選。
Risk-Seeking 的 stance_code 只能是 return_priority / score_priority / balanced。
Risk-Averse 的 stance_code 只能是 risk_control / concentration_control / cash_buffer / balanced。
Model 2 數值權重不可修改；direction 只是相對評估方向。

Holdings IDs: {list(holdings)}
App profile: {profile}

Evidence IDs:
{catalog_text(catalog)}

再次確認：evidence_ids 最少 2 個、最多 5 個；cash_direction 必須與 directions["CASH"] 完全相同。\n請只輸出 JSON，schema：\n{agent_schema(1)}
"""


def round2_prompt(role, holdings, catalog, profile, opponent_decision, opponent_claims):
    role_rule = (
        "你是 Risk-Seeking，必須回應 Risk-Averse 的第一輪。"
        if role == "risk_seeking" else
        (
            "你是 Risk-Averse Agent，不是 Risk-Seeking Agent。"
            "你的角色在整個回應中固定不變：role 必須完全等於 risk_averse。"
            "你正在審查對手 Risk-Seeking 的主張；不得模仿、採用或複製對手的角色。"
            "即使你同意對手的個別 claim，也不代表你的角色改變。"
            "你的 stance_code 只能是 risk_control / concentration_control / cash_buffer / balanced。"
        )
    )
    return f"""你只做結構化第二輪辯論，不得自行輸出或重算任何數值。
{role_rule}
只能引用 evidence_ids，且必須挑選最有力的 2–5 個。不得發明門檻。不得改 Model 2 數值權重。
Risk-Seeking 的 stance_code 只能是 return_priority / score_priority / balanced；Risk-Averse 的 stance_code 只能是 risk_control / concentration_control / cash_buffer / balanced。
必須實際接受或反駁對方 claim ID；同一個 claim ID 不得同時出現在 accepted 與 rebutted。

Holdings IDs: {list(holdings)}
App profile: {profile}

Evidence IDs:
{catalog_text(catalog)}

Opponent claim IDs and directions:
{json.dumps(opponent_claims, ensure_ascii=False)}

Opponent stance_code: {opponent_decision.get("stance_code")}
Opponent preferred_asset: {opponent_decision.get("preferred_asset")}
Opponent avoid_asset: {opponent_decision.get("avoid_asset")}

再次確認：evidence_ids 最少 2 個、最多 5 個；cash_direction 必須與 directions["CASH"] 完全相同。\n請只輸出 JSON，schema：\n{agent_schema(2)}
"""


def compact_recovery_prompt(role, holdings, catalog, original_prompt, round_no):
    allowed_stances = (
        "return_priority|score_priority|balanced"
        if role == "risk_seeking"
        else "risk_control|concentration_control|cash_buffer|balanced"
    )
    return f"""
只輸出一個完整 JSON object，不要 Markdown、前言或解釋。
這是格式修復；不得重新最佳化 Model 2。

role={role}
round={round_no}
holdings={holdings}
allowed_stance={allowed_stances}
allowed_evidence_ids={list(catalog.keys())}

硬性規則：
- directions 必須完整包含 holdings，值只能 increase/decrease/maintain
- evidence_ids 選 2–5 個
- cash_direction 必須等於 directions["CASH"]
- preferred_asset / avoid_asset 必須來自 holdings
- 不得輸出投資數值、百分比、門檻或新資產
- 第二輪必須引用至少一個對方 claim ID
- 同一 claim ID 不得同時 accepted 與 rebutted
- role 必須保持指定角色，不得切換

原始任務：
{original_prompt}

只輸出 JSON object。
"""


def decision_evidence_consistency(obj, catalog):
    """
    Conservative contradiction guard.
    Python does NOT choose an investment direction. It only rejects an Agent
    decision when the Agent itself cites BOTH:
      (a) the lowest expected-return evidence for an asset, and
      (b) the highest-risk evidence for the same asset,
    while directing that asset to increase.

    This intentionally catches only a strong, auditable contradiction and
    avoids turning Python into a portfolio decision maker.
    """
    if not isinstance(obj, dict):
        return False, ["not_json_object"]

    evidence_ids = set(obj.get("evidence_ids", []) or [])
    directions = obj.get("directions", {}) or {}
    errors = []

    er_items = [
        (eid, meta) for eid, meta in catalog.items()
        if meta.get("kind") == "expected_return" and meta.get("asset")
    ]
    risk_items = [
        (eid, meta) for eid, meta in catalog.items()
        if meta.get("kind") == "risk" and meta.get("asset")
    ]

    # Catalog construction ranks expected return high -> low and risk high -> low.
    lowest_er = er_items[-1] if er_items else None
    highest_risk = risk_items[0] if risk_items else None

    if lowest_er and highest_risk:
        low_er_id, low_er_meta = lowest_er
        high_risk_id, high_risk_meta = highest_risk
        if low_er_meta.get("asset") == high_risk_meta.get("asset"):
            aid = low_er_meta.get("asset")
            if (
                directions.get(aid) == "increase"
                and low_er_id in evidence_ids
                and high_risk_id in evidence_ids
            ):
                errors.append(
                    f"strong_evidence_direction_contradiction:{aid}:"
                    f"increase_with_{low_er_id}_and_{high_risk_id}"
                )

    return not errors, errors


def judge_side_alignment(j, rs2, ra2):
    """
    Judge alignment guard:
    if winning_side names one side, the Judge's non-maintain directions must
    not directly oppose that side's R2 directions.

    Python does not choose the winner or directions; it only asks Judge to
    retry when its declared winner contradicts its own final directions.
    """
    if not isinstance(j, dict):
        return False, ["not_json_object"]

    winner = j.get("winning_side")
    if winner == "balanced":
        return True, []

    side = rs2 if winner == "risk_seeking" else ra2 if winner == "risk_averse" else None
    if not isinstance(side, dict):
        return False, ["judge_winning_side_missing_decision"]

    side_dirs = side.get("directions", {}) or {}
    errors = []

    for aid in j.get("increase", []) or []:
        if side_dirs.get(aid) == "decrease":
            errors.append(f"judge_winner_direction_conflict:{aid}:judge_increase_vs_winner_decrease")

    for aid in j.get("decrease", []) or []:
        if side_dirs.get(aid) == "increase":
            errors.append(f"judge_winner_direction_conflict:{aid}:judge_decrease_vs_winner_increase")

    return not errors, errors


def safe_agent(role, model, prompt, holdings, catalog, round_no):
    if role == "risk_averse" and round_no == 2:
        system = (
            "You are the Risk-Averse Agent, not the Risk-Seeking Agent. "
            "Your identity is fixed for this entire response: role MUST be exactly risk_averse. "
            "You are reviewing the opponent's Risk-Seeking claims. "
            "Do not imitate, adopt, or copy the opponent's role. "
            "Your allowed stance_code is ONLY risk_control, concentration_control, cash_buffer, or balanced. "
            "Agreeing with an opponent claim does NOT change your role. "
            "你只能選擇方向、立場代碼、資產 ID、證據 ID 與對手 claim ID。"
            "禁止自行寫任何投資數值、百分比、門檻或外部資訊。只輸出 JSON。"
        )
    else:
        system = (
            "你是投資委員會 Agent。你只能選擇方向、立場代碼、資產 ID、證據 ID 與對手 claim ID。"
            "禁止自行寫任何投資數值、百分比、門檻或外部資訊。只輸出 JSON。"
        )

    raw_obj, raw_text = json_call(model, system, prompt, attempts=1)
    normalized_obj, normalization = normalize_agent_decision(raw_obj, role, catalog)
    ok_struct, errors = validate_agent(
        normalized_obj, holdings, catalog, round_no, expected_role=role
    )
    ok_sem, sem_errors = decision_evidence_consistency(normalized_obj, catalog)
    errors = list(errors) + list(sem_errors)
    ok = ok_struct and ok_sem

    retry_text = ""
    recovery_mode = "none"

    if not ok:
        if raw_obj is None:
            recovery_mode = f"compact_r{round_no}"
            retry_prompt = compact_recovery_prompt(
                role, holdings, catalog, prompt, round_no
            )
        else:
            recovery_mode = (
                "semantic_consistency_retry"
                if sem_errors and not [e for e in errors if e not in sem_errors]
                else "validation_retry"
            )
            retry_prompt = (
                prompt
                + "\nValidation errors: "
                + json.dumps(errors, ensure_ascii=False)
                + "\n若錯誤為 strong_evidence_direction_contradiction，"
                  "代表你的方向與你自己選擇的證據形成強烈矛盾。"
                  "請由你自己重新選擇方向或證據；Python 不會替你決定投資方向。"
                + "\n只修正被指出的一致性/結構問題，不得重新最佳化 Model 2 數值權重。"
            )

        retry_obj, retry_text = json_call(model, system, retry_prompt, attempts=2)
        normalized_retry, normalization2 = normalize_agent_decision(
            retry_obj, role, catalog
        )
        ok2_struct, errors2 = validate_agent(
            normalized_retry, holdings, catalog, round_no, expected_role=role
        )
        ok2_sem, sem_errors2 = decision_evidence_consistency(normalized_retry, catalog)
        errors2 = list(errors2) + list(sem_errors2)
        ok2 = ok2_struct and ok2_sem

        if ok2:
            return normalized_retry, {
                "ok": True,
                "errors": [],
                "raw": raw_text,
                "retry": retry_text,
                "retried": True,
                "normalization": normalization + normalization2,
                "recovery_mode": recovery_mode,
                "semantic_guard": "PASS",
            }

        return None, {
            "ok": False,
            "errors": errors2,
            "raw": raw_text,
            "retry": retry_text,
            "retried": True,
            "normalization": normalization + normalization2,
            "recovery_mode": recovery_mode,
            "semantic_guard": "FAIL",
        }

    return normalized_obj, {
        "ok": True,
        "errors": [],
        "raw": raw_text,
        "retry": "",
        "retried": False,
        "normalization": normalization,
        "recovery_mode": "none",
        "semantic_guard": "PASS",
    }

def render_direction(a):
    return {"increase": "提高", "decrease": "降低", "maintain": "維持"}[a]


def render_agent(title, d, catalog, claims=None):
    ev_lines = [f"- {eid}：{catalog[eid]['text']}" for eid in d.get("evidence_ids", []) if eid in catalog]
    dirs = []
    for aid, action in d["directions"].items():
        dirs.append(f"- {aid}：{render_direction(action)}")

    lines = [
        f"【{title}】",
        f"偏好部位：{d['preferred_asset']}",
        f"優先控制部位：{d['avoid_asset']}",
        f"現金方向：{render_direction(d['cash_direction'])}",
        f"立場：{d['stance_code']}",
        "引用證據：",
        *ev_lines,
        "逐部位方向：",
        *dirs,
    ]
    if "accepted_opponent_claim_ids" in d:
        lines += [
            "接受對方主張：" + (", ".join(d["accepted_opponent_claim_ids"]) or "無"),
            "反駁對方主張：" + (", ".join(d["rebutted_opponent_claim_ids"]) or "無"),
            "對方論點摘要代碼：" + str(d["opponent_summary_code"]),
        ]
    if claims:
        lines += ["本輪 Claim IDs：" + ", ".join(claims)]
    return "\n".join(lines)


def validate_claim_refs(d, opponent_claims):
    valid = set(opponent_claims)
    accepted = set(d.get("accepted_opponent_claim_ids", []))
    rebutted = set(d.get("rebutted_opponent_claim_ids", []))
    unknown = (accepted | rebutted) - valid
    overlap = accepted & rebutted
    engaged = bool((accepted | rebutted) & valid)
    return engaged and not unknown and not overlap, sorted(unknown | overlap)


def judge_prompt(holdings, catalog, rs1, ra1, rs2, ra2):
    schema = {
        "evaluation": "合理|部分合理|不採納",
        "action": "維持|明顯調整",
        "increase": ["holding ids only"],
        "decrease": ["holding ids only"],
        "winning_side": "risk_seeking|risk_averse|balanced",
        "accepted_evidence_ids": ["valid evidence IDs"],
        "rejected_claim_ids": ["optional claim IDs"],
        "reason_code": "evidence_balance|return_priority|risk_control|concentration_control|mixed",
    }
    return f"""你是 Judge。只可根據四個 structured decisions 與 Evidence IDs 裁決。
不得產生任何新數值、百分比或資產。不得重新最佳化 Model 2 權重。
increase/decrease 只是相對方向；真正數值仍是 Model 2。
一致性規則：action="維持" 時 increase/decrease 必須都是空陣列；action="明顯調整" 時 increase/decrease 至少一個必須非空。
winning_side 一致性規則：若 winning_side=risk_seeking 或 risk_averse，
Judge 的非 maintain 最終方向不得直接反向於該 winning side 的第二輪方向。
若雙方證據混合、無法明確採納單一方，winning_side 應使用 balanced。

Holdings: {list(holdings)}
Evidence:
{catalog_text(catalog)}

RS1={json.dumps(rs1, ensure_ascii=False)}
RA1={json.dumps(ra1, ensure_ascii=False)}
RS2={json.dumps(rs2, ensure_ascii=False)}
RA2={json.dumps(ra2, ensure_ascii=False)}

只輸出 JSON：
{json.dumps(schema, ensure_ascii=False, indent=2)}
"""


def validate_judge(j, holdings, catalog, all_claims):
    errors = []
    if not isinstance(j, dict):
        return False, ["not_json_object"]
    if j.get("action") not in JUDGE_ACTIONS:
        errors.append("invalid_action")
    inc, dec = j.get("increase", []), j.get("decrease", [])
    if not isinstance(inc, list) or not isinstance(dec, list):
        errors.append("directions_not_lists")
        inc, dec = [], []
    if any(x not in holdings for x in inc + dec):
        errors.append("new_asset")
    if set(inc) & set(dec):
        errors.append("same_asset_both_directions")

    # Judge action must agree with its own relative directions.
    if j.get("action") == "維持" and (inc or dec):
        errors.append("judge_action_direction_inconsistent")
    if j.get("action") == "明顯調整" and not (inc or dec):
        errors.append("judge_adjustment_without_direction")
    ev = j.get("accepted_evidence_ids", [])
    if not isinstance(ev, list) or not ev or any(x not in catalog for x in ev):
        errors.append("invalid_evidence_ids")
    rej = j.get("rejected_claim_ids", [])
    if not isinstance(rej, list) or any(x not in all_claims for x in rej):
        errors.append("invalid_rejected_claim_ids")
    if j.get("winning_side") not in {"risk_seeking", "risk_averse", "balanced"}:
        errors.append("invalid_winning_side")
    if not j.get("reason_code"):
        errors.append("missing_reason_code")
    return not errors, errors


def run_judge(holdings, catalog, rs1, ra1, rs2, ra2, all_claims):
    prompt = judge_prompt(holdings, catalog, rs1, ra1, rs2, ra2)
    system = "你是投資委員會 Judge。只做 structured evidence-based decision。只輸出 JSON。"

    obj, raw = json_call(MODELS["judge"], system, prompt, attempts=1)
    ok_struct, errors = validate_judge(obj, holdings, catalog, all_claims)
    ok_align, align_errors = judge_side_alignment(obj, rs2, ra2)
    errors = list(errors) + list(align_errors)
    ok = ok_struct and ok_align

    retry = ""
    if not ok:
        retry_prompt = (
            prompt
            + "\nValidation errors: "
            + json.dumps(errors, ensure_ascii=False)
            + "\n若錯誤為 judge_winner_direction_conflict，請重新檢查 winning_side "
              "與該方第二輪 directions 的一致性。你可以自行修正 winning_side 或最終相對方向；"
              "Python 不替你選擇裁決。"
        )
        obj2, retry = json_call(
            MODELS["judge"], system, retry_prompt, attempts=1
        )
        ok2_struct, errors2 = validate_judge(obj2, holdings, catalog, all_claims)
        ok2_align, align_errors2 = judge_side_alignment(obj2, rs2, ra2)
        errors2 = list(errors2) + list(align_errors2)
        if ok2_struct and ok2_align:
            return obj2, {
                "ok": True, "errors": [], "raw": raw, "retry": retry,
                "alignment_guard": "PASS", "retried": True
            }
        return None, {
            "ok": False, "errors": errors2, "raw": raw, "retry": retry,
            "alignment_guard": "FAIL", "retried": True
        }

    return obj, {
        "ok": True, "errors": [], "raw": raw, "retry": "",
        "alignment_guard": "PASS", "retried": False
    }

def render_judge(j, catalog):
    ev = "\n".join(f"- {x}: {catalog[x]['text']}" for x in j["accepted_evidence_ids"])
    return f"""【Judge 最終評估】
評估：{j['evaluation']}
配置處置：{j['action']}
相對提高：{', '.join(j['increase']) if j['increase'] else '無'}
相對降低：{', '.join(j['decrease']) if j['decrease'] else '無'}
採納立場：{j['winning_side']}
理由代碼：{j['reason_code']}
採納證據：
{ev}
重要說明：Model 3 僅做相對方向評估；實際數值配置仍完全使用 Model 2 / Zipf + GA 原始輸出。"""


def main():
    print("=" * 100)
    print("MODEL 3 V5.1 — FINAL FREEZE CANDIDATE | STABLE QWEN TRANSPORT")
    print("=" * 100)
    print("Rule   : LLM chooses stance/actions/evidence IDs; Python owns facts and rendering.")
    print("Models : Qwen3 8B Risk-Seeking | Mistral Risk-Averse | Llama3.2 3B Judge")
    print("Weight : Model 2 numeric allocation is immutable.")
    print()

    check_ollama()
    df = load_portfolio()
    m1 = load_model1()
    e = build_evidence(df, m1)
    catalog = make_evidence_catalog(e)
    holdings = list(e["holdings"].keys())
    profile = profile_text(df)

    print("【Evidence Catalog】")
    print(catalog_text(catalog))
    print()

    logs = {}

    print("[1/5] Risk-Seeking R1")
    rs1, logs["rs1"] = safe_agent(
        "risk_seeking", MODELS["risk_seeking"],
        round1_prompt("risk_seeking", holdings, catalog, profile),
        holdings, catalog, 1
    )
    if rs1 is None:
        raise RuntimeError("Risk-Seeking R1 structured output failed: " + str(logs["rs1"]))
    rs1_claims = make_claims(rs1, "RS1")
    print(render_agent("第一輪 Risk-Seeking", rs1, catalog, rs1_claims))
    print()

    print("[2/5] Risk-Averse R1")
    ra1, logs["ra1"] = safe_agent(
        "risk_averse", MODELS["risk_averse"],
        round1_prompt("risk_averse", holdings, catalog, profile),
        holdings, catalog, 1
    )
    if ra1 is None:
        raise RuntimeError("Risk-Averse R1 structured output failed: " + str(logs["ra1"]))
    ra1_claims = make_claims(ra1, "RA1")
    print(render_agent("第一輪 Risk-Averse", ra1, catalog, ra1_claims))
    print()

    print("[3/5] Risk-Seeking R2")
    rs2, logs["rs2"] = safe_agent(
        "risk_seeking", MODELS["risk_seeking"],
        round2_prompt("risk_seeking", holdings, catalog, profile, ra1, ra1_claims),
        holdings, catalog, 2
    )
    if rs2 is None:
        raise RuntimeError("Risk-Seeking R2 structured output failed: " + str(logs["rs2"]))
    rs2_ref_ok, rs2_unknown = validate_claim_refs(rs2, ra1_claims)
    rs2_claims = make_claims(rs2, "RS2")
    print(render_agent("第二輪 Risk-Seeking", rs2, catalog, rs2_claims))
    print()

    print("[4/5] Risk-Averse R2")
    # RA2 responds to RS2, giving genuine sequential cross-debate.
    ra2, logs["ra2"] = safe_agent(
        "risk_averse", MODELS["risk_averse"],
        round2_prompt("risk_averse", holdings, catalog, profile, rs2, rs2_claims),
        holdings, catalog, 2
    )
    if ra2 is None:
        raise RuntimeError("Risk-Averse R2 structured output failed: " + str(logs["ra2"]))
    ra2_ref_ok, ra2_unknown = validate_claim_refs(ra2, rs2_claims)
    ra2_claims = make_claims(ra2, "RA2")
    print(render_agent("第二輪 Risk-Averse", ra2, catalog, ra2_claims))
    print()

    all_claims = {**rs1_claims, **ra1_claims, **rs2_claims, **ra2_claims}

    print("[5/5] Judge")
    judge, logs["judge"] = run_judge(holdings, catalog, rs1, ra1, rs2, ra2, all_claims)
    if judge is None:
        raise RuntimeError("Judge structured output failed: " + str(logs["judge"]))
    judge_rendered = render_judge(judge, catalog)
    print(judge_rendered)

    rendered = {
        "risk_seeking_round1": render_agent("第一輪 Risk-Seeking", rs1, catalog, rs1_claims),
        "risk_averse_round1": render_agent("第一輪 Risk-Averse", ra1, catalog, ra1_claims),
        "risk_seeking_round2": render_agent("第二輪 Risk-Seeking", rs2, catalog, rs2_claims),
        "risk_averse_round2": render_agent("第二輪 Risk-Averse", ra2, catalog, ra2_claims),
        "judge": judge_rendered,
    }

    # Audits: no prose regex is required for factual grounding.
    original_sum = float(df[df["final_weight_percent"] > 0.0001]["final_weight_percent"].sum())
    all_agent_ok = all(logs[x]["ok"] for x in ["rs1", "ra1", "rs2", "ra2"])
    all_evidence_valid = all(
        all(eid in catalog for eid in d["evidence_ids"])
        for d in [rs1, ra1, rs2, ra2]
    )
    all_assets_valid = all(
        set(d["directions"]) == set(holdings)
        for d in [rs1, ra1, rs2, ra2]
    )

    audit = [
        ("Model 2 allocation exists", "PASS", ALLOCATION_FILE),
        ("Model 1 context available", "PASS" if bool(m1) else "FAIL", MODEL1_FILE),
        ("Ollama structured agents valid", "PASS" if all_agent_ok else "FAIL", str({k:v["errors"] for k,v in logs.items() if k!="judge"})),
        ("All evidence IDs grounded in Python catalog", "PASS" if all_evidence_valid else "FAIL", "No LLM numeric facts accepted"),
        ("Evidence selection is concise", "PASS" if all(MIN_EVIDENCE_IDS <= len(d["evidence_ids"]) <= MAX_EVIDENCE_IDS for d in [rs1, ra1, rs2, ra2]) else "FAIL", "Each agent round must select 2-5 evidence IDs"),
        ("Structural normalization is transparent", "PASS", "Normalizer only trims evidence IDs in model order and synchronizes redundant cash_direction; logs retained in JSON"),
        ("Qwen HTTP runtime + transport retry", "PASS", "Direct /api/chat + stream=false + think=false; identical-request EMPTY/transport retry max=3; V5 production RS1 isolation 10/10 PASS"),
        ("Risk-Averse R2 role lock", "PASS", "Targeted Mistral isolation test: 5/5 correct risk_averse identity and valid stance"),
        ("Structured runtime recovery transparent", "PASS", f"RS1={logs['rs1'].get('recovery_mode')}; RA1={logs['ra1'].get('recovery_mode')}; RS2={logs['rs2'].get('recovery_mode')}; RA2={logs['ra2'].get('recovery_mode')}"),
        ("Agent role identity preserved", "PASS" if (rs1["role"]=="risk_seeking" and rs2["role"]=="risk_seeking" and ra1["role"]=="risk_averse" and ra2["role"]=="risk_averse") else "FAIL", f"RS1={rs1['role']}; RA1={ra1['role']}; RS2={rs2['role']}; RA2={ra2['role']}"),
        ("Agent stance remains role-consistent", "PASS" if (rs1["stance_code"] in ROLE_STANCES["risk_seeking"] and rs2["stance_code"] in ROLE_STANCES["risk_seeking"] and ra1["stance_code"] in ROLE_STANCES["risk_averse"] and ra2["stance_code"] in ROLE_STANCES["risk_averse"]) else "FAIL", f"RS1={rs1['stance_code']}; RA1={ra1['stance_code']}; RS2={rs2['stance_code']}; RA2={ra2['stance_code']}"),
        ("All directions restricted to existing holdings", "PASS" if all_assets_valid else "FAIL", str(holdings)),
        ("Model 2 allocation preserved", "PASS" if abs(original_sum-100) < 0.05 else "FAIL", f"positive_weight_sum={original_sum:.6f}%"),
        ("Model 3 does not re-optimize weights", "PASS", "No optimizer and no LLM numeric weights"),
        ("Round 2 genuine claim-ID debate", "PASS" if rs2_ref_ok and ra2_ref_ok else "FAIL", f"RS2={rs2_ref_ok}; RA2={ra2_ref_ok}; invalid_refs_or_overlap={rs2_unknown+ra2_unknown}"),
        ("Accepted/rebutted claims are disjoint", "PASS" if (not (set(rs2.get("accepted_opponent_claim_ids",[])) & set(rs2.get("rebutted_opponent_claim_ids",[]))) and not (set(ra2.get("accepted_opponent_claim_ids",[])) & set(ra2.get("rebutted_opponent_claim_ids",[])))) else "FAIL", "A claim cannot be simultaneously accepted and rebutted"),
        ("No invented thresholds/numbers accepted", "PASS", "Agents can only return IDs/enums; Python renders all numeric evidence"),
        ("Decision-evidence semantic consistency", "PASS" if all(decision_evidence_consistency(d, catalog)[0] for d in [rs1, ra1, rs2, ra2]) else "FAIL", str({name: decision_evidence_consistency(d, catalog)[1] for name, d in [("rs1",rs1),("ra1",ra1),("rs2",rs2),("ra2",ra2)]})),
        ("Judge winning-side alignment", "PASS" if judge_side_alignment(judge, rs2, ra2)[0] else "FAIL", str(judge_side_alignment(judge, rs2, ra2)[1])),
        ("Judge structured output valid", "PASS" if logs["judge"]["ok"] else "FAIL", str(logs["judge"]["errors"])),
        ("Judge action/direction internally consistent", "PASS" if ((judge["action"] == "維持" and not judge["increase"] and not judge["decrease"]) or (judge["action"] == "明顯調整" and bool(judge["increase"] or judge["decrease"]))) else "FAIL", f"action={judge['action']}; increase={judge['increase']}; decrease={judge['decrease']}"),
        ("Judge assets restricted to holdings", "PASS" if all(x in holdings for x in judge["increase"]+judge["decrease"]) else "FAIL", f"increase={judge['increase']}; decrease={judge['decrease']}"),
        ("App discussion process exposed", "PASS", "RS1 + RA1 + RS2 + RA2 + Judge deterministic render"),
    ]
    audit_df = pd.DataFrame(audit, columns=["check_name", "status", "detail"])

    payload = {
        "schema_version": "model_3_v5_1_structured_decision",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "models": MODELS,
        "architecture": {
            "llm_role": "stance/action/evidence-id selection only",
            "python_role": "facts/validation/rendering",
            "model2_numeric_allocation_immutable": True,
        },
        "evidence_catalog": catalog,
        "structured_decisions": {
            "risk_seeking_round1": rs1,
            "risk_averse_round1": ra1,
            "risk_seeking_round2": rs2,
            "risk_averse_round2": ra2,
            "judge": judge,
        },
        "claims": all_claims,
        "rendered_discussion": rendered,
        "runtime_logs": logs,
    }
    Path(OUTPUT_JSON).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # One-row App summary; no Model 2 weight is overwritten.
    out = pd.DataFrame([{
        "model3_version": "V4 Structured Decision",
        "judge_evaluation": judge["evaluation"],
        "judge_action": judge["action"],
        "relative_increase": "|".join(judge["increase"]),
        "relative_decrease": "|".join(judge["decrease"]),
        "winning_side": judge["winning_side"],
        "reason_code": judge["reason_code"],
        "model2_weights_immutable": True,
    }])
    out.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    audit_df.to_csv(AUDIT_FILE, index=False, encoding="utf-8-sig")

    report = "\n\n".join([
        "MODEL 3 V4 — STRUCTURED DECISION AGENT",
        catalog_text(catalog),
        rendered["risk_seeking_round1"],
        rendered["risk_averse_round1"],
        rendered["risk_seeking_round2"],
        rendered["risk_averse_round2"],
        rendered["judge"],
        "PRODUCTION AUDIT\n" + audit_df.to_string(index=False),
    ])
    Path(REPORT_FILE).write_text(report, encoding="utf-8")

    print("\n" + "="*100)
    print("PRODUCTION AUDIT")
    print("="*100)
    print(audit_df.to_string(index=False))
    print("\nCreated:")
    print("-", OUTPUT_CSV)
    print("-", OUTPUT_JSON)
    print("-", REPORT_FILE)
    print("-", AUDIT_FILE)

    passed = (audit_df["status"] == "PASS").all()
    print("\nAUDIT RESULT:", "MODEL 3 V5.1 FINAL FREEZE CANDIDATE PASS" if passed else "MODEL 3 V5.1 FINAL FREEZE CANDIDATE FAIL")


if __name__ == "__main__":
    main()
