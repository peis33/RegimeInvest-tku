# -*- coding: utf-8 -*-
"""
RUN ALL MODELS — APP PRODUCTION PIPELINE v2.2

Frozen chain:
1) Model 1 V5 App Duration
2) Model 2 Candidate Selection
3) Model 2 V2 Strong App Profile
4) Model 3 V5.1 Structured Multi-Agent

No parameter tuning is performed here.
"""

from pathlib import Path
from datetime import datetime
import importlib.util
import os
import subprocess
import sys
import time
import csv
import json
import pandas as pd

BASE = Path(__file__).resolve().parent

PROFILE_FILE = BASE / "user_profile.json"

STAGES = [
    {
        "name": "Model 1 V5 App Duration",
        "script": "model_1_v5_production_app_duration.py",
        "inputs": [],
        "outputs": [
            "model_1_prediction_output.csv",
            "model_1_production_metadata.csv",
        ],
    },
    {
        "name": "Model 2 Candidate Selection",
        "script": "model_2_candidate_selection_production.py",
        "inputs": [
            "model_1_prediction_output.csv",
            "model_2_investor_profile_historical.csv",
        ],
        "outputs": [
            "model_2_candidate_stocks.csv",
            "experiment_model_2_candidate_selection_audit.csv",
            "experiment_model_2_candidate_selection_summary.csv",
        ],
    },
    {
        "name": "Model 2 V2 Strong App Profile",
        "script": "model_2_v2_strong_production_app_profile.py",
        "inputs": [
            "model_1_prediction_output.csv",
            "model_2_candidate_stocks.csv",
            "model_2_zipf_ga_formal.py",
            "user_profile.json",
        ],
        "outputs": [
            "portfolio_allocation_output.csv",
            "model_2_v2_strong_final_portfolio_audit.csv",
        ],
    },
    {
        "name": "Model 3 V5.1 Structured Multi-Agent",
        "script": "model_3_v5_1_final_freeze_candidate.py",
        "inputs": [
            "portfolio_allocation_output.csv",
            "model_1_prediction_output.csv",
        ],
        "outputs": [
            "model_3_v5_1_final_output.csv",
            "model_3_v5_1_discussion_output.json",
            "model_3_v5_1_production_report.txt",
            "model_3_v5_1_production_audit.csv",
        ],
    },
]

AUDIT_FILE = BASE / "end_to_end_app_pipeline_audit.csv"
REPORT_FILE = BASE / "end_to_end_app_pipeline_report.txt"

MODEL_DEPENDENCIES = {
    "model_1_v5_production_app_duration.py": (
        "tensorflow",
        "hmmlearn",
        "sklearn",
        "scipy",
    ),
    "model_3_v5_1_final_freeze_candidate.py": (
        "ollama",
    ),
}

def module_available(name):
    """檢查目前管線使用的 Python 是否能找到指定套件。"""
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ModuleNotFoundError, ValueError):
        return False


def missing_stage_dependencies(stage):
    """列出階段缺少的套件；缺少時必須直接停止，不使用舊輸出。"""
    return [
        name
        for name in MODEL_DEPENDENCIES.get(stage["script"], ())
        if not module_available(name)
    ]


def add(audit, stage, check, ok, detail):
    audit.append({
        "stage": stage,
        "check_name": check,
        "status": "PASS" if ok else "FAIL",
        "detail": str(detail),
    })


def save_audit(audit):
    fields = ["stage", "check_name", "status", "detail"]
    with AUDIT_FILE.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(audit)


def validate_profile(audit):
    stage = "App Profile Preflight"
    if not PROFILE_FILE.exists():
        add(audit, stage, "user_profile.json exists", False, PROFILE_FILE.name)
        return None

    try:
        raw = json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        add(audit, stage, "user_profile.json valid JSON", False, repr(e))
        return None

    investor_type = str(raw.get("investor_type", "")).lower()
    risk = str(raw.get("risk_preference", "")).lower()

    try:
        budget = float(raw.get("budget", 0))
    except Exception:
        budget = -1

    add(audit, stage, "user_profile.json exists", True, PROFILE_FILE.name)
    add(audit, stage, "investor_type valid",
        investor_type in {"small", "normal", "large"}, investor_type)
    add(audit, stage, "risk_preference valid",
        risk in {"conservative", "neutral", "aggressive"}, risk)
    add(audit, stage, "budget positive", budget > 0, budget)

    ok = (
        investor_type in {"small", "normal", "large"}
        and risk in {"conservative", "neutral", "aggressive"}
        and budget > 0
    )
    if not ok:
        return None

    return {
        "investor_type": investor_type,
        "risk_preference": risk,
        "budget": budget,
        # 與登入頁及 Model 2 的預設一致：未省略設定時允許零股。
        "allow_fractional": bool(raw.get("allow_fractional", True)),
    }


def validate_model1(audit):
    p = BASE / "model_1_prediction_output.csv"
    if not p.exists():
        add(audit, "Interface Audit", "Model 1 output exists", False, p.name)
        return False

    df = pd.read_csv(p)
    required = {
        "target_month",
        "predicted_regime",
        "prob_Bear",
        "prob_Bull",
        "prob_Sideways",
        "expected_regime_duration_months",
        "expected_regime_duration_steps",
        "duration_unit",
        "duration_method",
        "mta_to_bear_months",
        "mta_to_bear_steps",
        "mta_absorbing_regime",
        "mta_method",
    }
    ok_cols = required.issubset(df.columns)
    add(audit, "Interface Audit", "Model 1 App market fields", ok_cols,
        ",".join(df.columns))

    if df.empty:
        add(audit, "Interface Audit", "Model 1 output nonempty", False, "0 rows")
        return False

    row = df.iloc[-1]
    probs = float(row["prob_Bear"]) + float(row["prob_Bull"]) + float(row["prob_Sideways"])
    add(audit, "Interface Audit", "Model 1 probability sum", abs(probs - 1.0) < 1e-5,
        f"{probs:.12f}")

    duration = float(row["expected_regime_duration_steps"])
    mta = float(row["mta_to_bear_steps"])
    add(audit, "Interface Audit", "Model 1 duration positive", duration > 0,
        f"{duration:.6f} HMM steps")
    add(audit, "Interface Audit", "Model 1 MTA nonnegative", mta >= 0,
        f"{mta:.6f} HMM steps")

    return ok_cols and not df.empty and abs(probs - 1.0) < 1e-5 and duration > 0 and mta >= 0


def validate_model2_profile(audit, profile):
    p = BASE / "portfolio_allocation_output.csv"
    if not p.exists():
        add(audit, "Interface Audit", "Model 2 portfolio exists", False, p.name)
        return False

    df = pd.read_csv(p)
    if df.empty:
        add(audit, "Interface Audit", "Model 2 portfolio nonempty", False, "0 rows")
        return False

    it = df["investor_type"].astype(str).str.lower().eq(profile["investor_type"]).all()
    rp = df["risk_preference"].astype(str).str.lower().eq(profile["risk_preference"]).all()
    bd = pd.to_numeric(df["budget"], errors="coerce").eq(profile["budget"]).all()
    weight_sum = pd.to_numeric(df["final_weight"], errors="coerce").sum()

    add(audit, "Interface Audit", "Investor type propagated", it, profile["investor_type"])
    add(audit, "Interface Audit", "Risk preference propagated", rp, profile["risk_preference"])
    add(audit, "Interface Audit", "Budget propagated", bd, profile["budget"])
    add(audit, "Interface Audit", "Portfolio weights sum to one",
        abs(weight_sum - 1.0) < 1e-6, f"{weight_sum:.12f}")

    return it and rp and bd and abs(weight_sum - 1.0) < 1e-6


def validate_model3_app(audit):
    """
    Validate the frozen Model 3 V5.1 App interface.
    Integration-layer check only; does not modify Model 3 decisions.
    """
    p = BASE / "model_3_v5_1_discussion_output.json"
    if not p.exists():
        add(audit, "Interface Audit", "Model 3 discussion JSON exists", False, p.name)
        return False

    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        add(audit, "Interface Audit", "Model 3 discussion JSON valid", False, repr(e))
        return False

    # V5.1 deterministic discussion render. Support the actual frozen schema,
    # while explicitly requiring all five stages.
    rendered = data.get("rendered_discussion")
    required = {
        "risk_seeking_round1",
        "risk_averse_round1",
        "risk_seeking_round2",
        "risk_averse_round2",
        "judge",
    }

    if isinstance(rendered, dict):
        present = set(rendered.keys())
        ok = required.issubset(present)
        detail = f"rendered_discussion keys={sorted(present)}"
    else:
        # Some V5.1 builds expose app_display as the deterministic 5-stage list.
        app_display = data.get("app_display")
        ok = isinstance(app_display, list) and len(app_display) >= 5
        detail = (
            f"app_display stages={len(app_display)}"
            if isinstance(app_display, list)
            else f"available_top_level_keys={sorted(data.keys())}"
        )

    add(
        audit,
        "Interface Audit",
        "Model 3 V5.1 five-stage discussion exposed",
        ok,
        detail,
    )
    return ok

def run_stage(index, stage, audit, total_stages=None):
    print("\n" + "=" * 118)
    print(f"[{index}/{total_stages or len(STAGES)}] {stage['name']}")
    print("=" * 118)

    script = BASE / stage["script"]
    if not script.exists():
        add(audit, stage["name"], "Production script exists", False, stage["script"])
        return False, 0.0

    for name in stage["inputs"]:
        p = BASE / name
        ok = p.exists()
        add(audit, stage["name"], f"Required input: {name}", ok,
            "exists" if ok else "MISSING")
        if not ok:
            print("STOP: missing required input:", name)
            return False, 0.0

    missing_dependencies = missing_stage_dependencies(stage)
    if missing_dependencies:
        dependency_text = ", ".join(missing_dependencies)
        message = (
            f"缺少模型依賴：{dependency_text}。"
            "不使用舊輸出，已停止本次管線。"
        )
        print("\nDEPENDENCY_CHECK_FAILED: " + dependency_text)
        print(message)
        add(
            audit,
            stage["name"],
            "Model dependencies available",
            False,
            dependency_text,
        )
        add(
            audit,
            stage["name"],
            "Process return code",
            False,
            "not started because model dependencies are missing",
        )
        return False, 0.0

    start = time.time()
    result = subprocess.run([sys.executable, str(script)], cwd=str(BASE), check=False)
    elapsed = time.time() - start

    add(audit, stage["name"], "Process return code", result.returncode == 0,
        f"return_code={result.returncode}; elapsed={elapsed:.1f}s")

    if result.returncode != 0:
        return False, elapsed

    all_outputs = True
    for name in stage["outputs"]:
        p = BASE / name
        ok = p.exists() and p.stat().st_size > 0
        add(audit, stage["name"], f"Output created: {name}", ok,
            f"bytes={p.stat().st_size}" if ok else "MISSING/EMPTY")
        all_outputs = all_outputs and ok

    print(f"\nSTAGE RESULT: {'PASS' if all_outputs else 'FAIL'}")
    return all_outputs, elapsed


def main():
    audit = []
    start_all = time.time()
    run_model3 = os.getenv("STOCKAPP_RUN_MODEL3", "1").strip().lower() not in {
        "0",
        "false",
        "no",
    }
    reuse_model1 = os.getenv("STOCKAPP_REUSE_MODEL1", "0").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    available_stages = STAGES if run_model3 else STAGES[:3]
    active_stages = [
        stage
        for stage in available_stages
        if not (
            reuse_model1
            and stage["script"] == "model_1_v5_production_app_duration.py"
        )
    ]

    print("=" * 118)
    print("APP PRODUCTION — RUN ALL MODELS v2.2")
    print("=" * 118)
    print("Pipeline:")
    print("Model 1 market state + duration/MTA")
    print(" -> Model 2 candidate selection")
    print(" -> Model 2 personalized V2 Strong allocation")
    print(
        " -> Model 3 multi-agent discussion/Judge"
        if run_model3
        else " -> Model 3 skipped (可由獨立 API 手動啟動)"
    )
    print(
        "Model 1: reuse cached output (CSV sources unchanged)"
        if reuse_model1
        else "Model 1: run production training/inference"
    )
    print()

    profile = validate_profile(audit)
    if profile is None:
        save_audit(audit)
        print("PROFILE PREFLIGHT: FAIL")
        return 1

    print("APP USER PROFILE")
    print(f"- investor_type   : {profile['investor_type']}")
    print(f"- risk_preference : {profile['risk_preference']}")
    print(f"- budget          : {profile['budget']:.2f}")
    print(f"- allow_fractional: {profile['allow_fractional']}")

    if reuse_model1:
        # 即使來源檔案沒有變更，仍要確認目前這個 Python 環境具備
        # Model 1 依賴；缺少依賴時不能默默沿用舊市場狀態。
        model1_stage = STAGES[0]
        missing_dependencies = missing_stage_dependencies(model1_stage)
        if missing_dependencies:
            dependency_text = ", ".join(missing_dependencies)
            add(
                audit,
                model1_stage["name"],
                "Model dependencies available",
                False,
                dependency_text,
            )
            add(
                audit,
                model1_stage["name"],
                "Cached output reuse allowed",
                False,
                "not reused because Model 1 dependencies are missing",
            )
            save_audit(audit)
            print(
                "\nSTOP: Model 1 cached output cannot be reused because "
                f"dependencies are missing: {dependency_text}"
            )
            return 1

        if not validate_model1(audit):
            save_audit(audit)
            print("\nSTOP: cached Model 1 output audit failed; no reuse.")
            return 1

        add(
            audit,
            model1_stage["name"],
            "Cached Model 1 output reused",
            True,
            "CSV source signatures unchanged",
        )

    times = {}
    for i, stage in enumerate(active_stages, 1):
        ok, sec = run_stage(i, stage, audit, len(active_stages))
        times[stage["name"]] = sec
        save_audit(audit)
        if not ok:
            print("\nEND-TO-END APP PIPELINE: FAIL")
            return 1

        if stage["script"] == "model_1_v5_production_app_duration.py" and not validate_model1(audit):
            save_audit(audit)
            print("\nSTOP: Model 1 App interface audit failed.")
            return 1

        if stage["script"] == "model_2_v2_strong_production_app_profile.py" and not validate_model2_profile(audit, profile):
            save_audit(audit)
            print("\nSTOP: Model 2 App profile propagation audit failed.")
            return 1

        if stage["script"] == "model_3_v5_1_final_freeze_candidate.py" and not validate_model3_app(audit):
            save_audit(audit)
            print("\nSTOP: Model 3 App discussion interface audit failed.")
            return 1

    total = time.time() - start_all
    add(audit, "End-to-End", "All App production stages completed", True,
        (
            "Model 1 -> Model 2 Selection -> Model 2 App Profile -> Model 3"
            if run_model3
            else "Model 1 -> Model 2 Selection -> Model 2 App Profile; Model 3 skipped"
        ))
    save_audit(audit)

    m1 = pd.read_csv(BASE / "model_1_prediction_output.csv").iloc[-1]
    portfolio = pd.read_csv(BASE / "portfolio_allocation_output.csv")

    report = [
        "APP PRODUCTION PIPELINE REPORT",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "USER PROFILE",
        f"investor_type={profile['investor_type']}",
        f"risk_preference={profile['risk_preference']}",
        f"budget={profile['budget']:.2f}",
        "",
        "MODEL 1 APP MARKET STATUS",
        f"model_1_reused={reuse_model1}",
        f"target_month={m1['target_month']}",
        f"predicted_regime={m1['predicted_regime']}",
        f"prob_Bear={float(m1['prob_Bear']):.6f}",
        f"prob_Bull={float(m1['prob_Bull']):.6f}",
        f"prob_Sideways={float(m1['prob_Sideways']):.6f}",
        f"expected_regime_duration_steps={float(m1['expected_regime_duration_steps']):.2f}",
        f"mta_to_bear_steps={float(m1['mta_to_bear_steps']):.2f}",
        "",
        "MODEL 2",
        f"portfolio_rows={len(portfolio)}",
        f"weight_sum={portfolio['final_weight'].sum():.12f}",
        "",
        "MODEL 3",
        (
            "discussion_output=model_3_v5_1_discussion_output.json"
            if run_model3
            else "discussion_output=not_run; no previous discussion reused"
        ),
        "",
        f"TOTAL ELAPSED={total:.1f}s",
        "FINAL RESULT: END-TO-END APP PIPELINE PASS",
    ]
    REPORT_FILE.write_text("\n".join(report), encoding="utf-8")

    print("\n" + "=" * 118)
    print("END-TO-END APP PIPELINE PASS")
    print("=" * 118)
    print(f"Investor type : {profile['investor_type']}")
    print(f"Risk          : {profile['risk_preference']}")
    print(f"Budget        : {profile['budget']:.2f}")
    print(f"Market regime : {m1['predicted_regime']}")
    print(f"Duration      : ~{float(m1['expected_regime_duration_steps']):.2f} trading-day/HMM steps")
    print(f"MTA to Bear   : ~{float(m1['mta_to_bear_steps']):.2f} trading-day/HMM steps")
    print(f"Total elapsed : {total:.1f}s")
    print("\nCreated:")
    print("-", AUDIT_FILE.name)
    print("-", REPORT_FILE.name)
    print("\nFINAL RESULT: END-TO-END APP PIPELINE PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
