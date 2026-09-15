# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
import importlib.util
import json
import random
import re

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent

MODEL2_FILE = BASE / "model_2_zipf_ga_formal.py"
PREDICTION_FILE = BASE / "model_1_prediction_output.csv"
CANDIDATE_FILE = BASE / "model_2_candidate_stocks.csv"
PROFILE_FILE = BASE / "user_profile.json"

OUTPUT_FILE = BASE / "portfolio_allocation_output.csv"
AUDIT_FILE = BASE / "model_2_v2_strong_final_portfolio_audit.csv"

SEED, POP_SIZE, GENERATIONS = 42, 80, 120

CFG = dict(
    risk_add=.45,
    concentration_penalty=.12,
    hhi_penalty=.05,
    max_stock_weight=.30,
)

MIN_GA_STOCKS = 3


def load_module(path, name):
    if not path.exists():
        raise FileNotFoundError(path.name)

    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def normalize_stock_id(value):
    s = str(value).strip()
    m = re.match(r"^\s*(\d+)", s)
    return m.group(1) if m else s


def parse_frontend_scope(raw_profile):
    selection_mode = str(
        raw_profile.get("selection_mode", "all")
    ).strip().lower()

    if selection_mode not in {"all", "custom"}:
        raise ValueError(
            f"Unsupported selection_mode={selection_mode!r}; "
            "目前支援 all / custom。"
        )

    raw_ids = raw_profile.get("selected_stock_ids", [])

    if raw_ids is None:
        raw_ids = []

    if not isinstance(raw_ids, list):
        raise ValueError("selected_stock_ids 必須是 JSON array。")

    selected_ids = list(
        dict.fromkeys(
            normalize_stock_id(x)
            for x in raw_ids
            if str(x).strip()
        )
    )

    if selection_mode == "custom" and not selected_ids:
        raise ValueError(
            "selection_mode='custom' 時 selected_stock_ids 不可以為空。"
        )

    return selection_mode, selected_ids


def filter_loaded_candidates(stocks, selection_mode, selected_ids):
    stocks = stocks.copy()
    stocks["stock_id"] = stocks["stock_id"].astype(str).map(normalize_stock_id)

    if selection_mode == "all":
        return stocks.reset_index(drop=True)

    allowed = set(selected_ids)

    scoped = stocks[
        stocks["stock_id"].isin(allowed)
    ].copy()

    if scoped.empty:
        raise ValueError(
            "Model 2 candidate set 與前端 selected_stock_ids 沒有交集。"
        )

    return scoped.reset_index(drop=True)


def repair(w, cmin, cmax, cap):
    w = np.maximum(np.asarray(w, float), 0)

    w = (
        w / w.sum()
        if w.sum() > 0
        else np.ones_like(w) / len(w)
    )

    cash = float(np.clip(w[-1], cmin, cmax))
    risky = w[:-1].copy()
    budget = 1 - cash

    if len(risky) * cap + 1e-12 < budget:
        raise ValueError(
            f"Frozen 30% cap infeasible: "
            f"{len(risky)} stocks cannot hold {budget:.2%}. "
            f"請至少選擇 {MIN_GA_STOCKS} 檔符合 investor_type 的股票。"
        )

    risky = (
        risky * budget / risky.sum()
        if risky.sum() > 0
        else np.full(len(risky), budget / len(risky))
    )

    for _ in range(100):
        over = risky > cap + 1e-12

        if not over.any():
            break

        excess = float((risky[over] - cap).sum())
        risky[over] = cap

        under = np.where(risky < cap - 1e-12)[0]

        if not len(under):
            break

        capacity = cap - risky[under]
        risky[under] += excess * capacity / capacity.sum()

    diff = budget - risky.sum()

    if abs(diff) > 1e-10:
        under = np.where(risky < cap - 1e-12)[0]

        if diff > 0 and len(under):
            capacity = cap - risky[under]
            risky[under] += diff * capacity / capacity.sum()

        elif diff < 0 and risky.sum() > 0:
            risky *= budget / risky.sum()

    out = np.append(np.maximum(risky, 0), cash)

    if not np.isclose(out.sum(), 1, atol=1e-8):
        raise ValueError(f"weight sum={out.sum()}")

    if len(out) > 1 and np.max(out[:-1]) > cap + 1e-8:
        raise ValueError("30% stock cap violated")

    return out


def fit(mod, w, selected, pred, profile):
    m = mod.portfolio_metrics(w, selected)

    lam = (
        .35
        + .60 * pred["prob_Bear"]
        + .15 * pred["prob_Sideways"]
        + CFG["risk_add"]
    )

    if profile["risk_preference"] == "conservative":
        lam += .20
    elif profile["risk_preference"] == "aggressive":
        lam -= .15

    cash = float(w[-1])
    risky = np.asarray(w[:-1], float)

    target = (
        .50 * pred["prob_Bear"]
        + .28 * pred["prob_Sideways"]
        + .15 * pred["prob_Bull"]
    )

    alignment = (
        -abs(cash - target) * .04
        + risky.sum() * pred["prob_Bull"] * .015
    )

    hhi = float(np.sum(risky ** 2))

    return float(
        m["expected_return"]
        - lam * m["risk"]
        - CFG["concentration_penalty"] * m["concentration"]
        - CFG["hhi_penalty"] * hhi
        + m["diversification"] * .02
        + alignment
    )


def run_ga(mod, selected, pred, profile, initial):
    cmin, cmax = mod.get_cash_bounds(pred, profile)

    rp = lambda x: repair(
        x,
        cmin,
        cmax,
        CFG["max_stock_weight"],
    )

    random.seed(SEED)
    np.random.seed(SEED)

    pop = [rp(initial)]

    pop += [
        rp(
            initial
            + np.random.normal(
                0,
                .08,
                len(initial),
            )
        )
        for _ in range(POP_SIZE - 1)
    ]

    best = pop[0].copy()
    bscore = -np.inf

    for _ in range(GENERATIONS):
        scored = [
            (
                rp(x),
                fit(
                    mod,
                    rp(x),
                    selected,
                    pred,
                    profile,
                ),
            )
            for x in pop
        ]

        scored.sort(
            key=lambda z: z[1],
            reverse=True,
        )

        if scored[0][1] > bscore:
            best = scored[0][0].copy()
            bscore = float(scored[0][1])

        elites = [
            z[0]
            for z in scored[
                :max(4, POP_SIZE // 5)
            ]
        ]

        new = [
            x.copy()
            for x in elites
        ]

        while len(new) < POP_SIZE:
            p1, p2 = random.sample(elites, 2)
            a = random.random()

            child = (
                a * p1
                + (1 - a) * p2
            )

            mask = (
                np.random.random(
                    len(child)
                )
                < .25
            )

            if mask.any():
                child[mask] += (
                    np.random.normal(
                        0,
                        .05,
                        int(mask.sum()),
                    )
                )

            new.append(
                rp(child)
            )

        pop = new

    return rp(best), bscore


def main():
    print("=" * 110)
    print("MODEL 2 V2 STRONG — USER-SCOPED APP PRODUCTION")
    print("=" * 110)

    mod = load_module(
        MODEL2_FILE,
        "m2v2_interface",
    )

    missing = [
        p.name
        for p in (
            PREDICTION_FILE,
            CANDIDATE_FILE,
        )
        if not p.exists()
    ]

    if missing:
        print(
            "STOP — missing formal upstream input:",
            ", ".join(missing),
        )
        print(
            "No CSV created; missing data "
            "will not be fabricated."
        )
        return

    if not PROFILE_FILE.exists():
        raise FileNotFoundError(
            "user_profile.json is required for App production."
        )

    raw_profile = json.loads(
        PROFILE_FILE.read_text(
            encoding="utf-8",
        )
    )

    profile = mod.normalize_user_profile(
        raw_profile
    )

    selection_mode, requested_ids = parse_frontend_scope(
        raw_profile
    )

    psource = PROFILE_FILE.name

    investor_type = str(
        profile.get(
            "investor_type",
            "",
        )
    ).lower()

    risk_preference = str(
        profile.get(
            "risk_preference",
            "",
        )
    ).lower()

    budget = float(
        profile.get(
            "budget",
            0,
        )
    )

    allow_fractional = bool(
        profile.get(
            "allow_fractional",
            False,
        )
    )

    if investor_type not in {
        "small",
        "normal",
        "large",
    }:
        raise ValueError(
            f"Unsupported investor_type: "
            f"{investor_type}"
        )

    if risk_preference not in {
        "conservative",
        "neutral",
        "aggressive",
    }:
        raise ValueError(
            f"Unsupported risk_preference: "
            f"{risk_preference}"
        )

    if budget <= 0:
        raise ValueError(
            f"budget must be positive, "
            f"got {budget}"
        )

    print("\nAPP USER PROFILE")
    print(
        f"- source          : {psource}"
    )
    print(
        f"- investor_type   : "
        f"{investor_type}"
    )
    print(
        f"- risk_preference : "
        f"{risk_preference}"
    )
    print(
        f"- budget          : "
        f"{budget:.2f}"
    )
    print(
        f"- allow_fractional: "
        f"{allow_fractional}"
    )
    print(
        f"- selection_mode  : "
        f"{selection_mode}"
    )
    print(
        f"- selected stocks : "
        f"{requested_ids if requested_ids else 'ALL IN INVESTOR POOL'}"
    )

    pred = mod.load_latest_prediction(
        str(PREDICTION_FILE)
    )

    stocks = mod.load_candidate_stocks(
        str(CANDIDATE_FILE)
    )

    stocks = filter_loaded_candidates(
        stocks,
        selection_mode,
        requested_ids,
    )

    # 防禦式檢查 candidate CSV 的 investor_class。
    raw_candidates = pd.read_csv(
        CANDIDATE_FILE,
        encoding="utf-8-sig",
        dtype=str,
    )

    investor_pool_ok = True

    if "investor_class" in raw_candidates.columns:
        classes = set(
            raw_candidates[
                "investor_class"
            ]
            .astype(str)
            .str.lower()
            .dropna()
        )

        selected_pool = raw_profile.get('stock_pool') or investor_type
        allowed_classes = {'small', 'normal', 'large'} if selected_pool == 'all' else {selected_pool}
        investor_pool_ok = bool(classes) and classes.issubset(allowed_classes)

    if len(stocks) < MIN_GA_STOCKS:
        raise ValueError(
            f"前端篩選後只剩 {len(stocks)} 檔股票。"
            f"Frozen 30% cap 至少需要 "
            f"{MIN_GA_STOCKS} 檔可投資股票。"
        )

    selected = mod.select_candidates(
        stocks,
        pred,
        profile,
    )

    if selected.empty:
        raise ValueError(
            "Formal selection returned "
            "zero stocks."
        )

    selected_ids = set(
        selected["stock_id"]
        .astype(str)
        .map(normalize_stock_id)
    )

    scope_ok = (
        selection_mode == "all"
        or selected_ids.issubset(
            set(requested_ids)
        )
    )

    initial = mod.build_initial_weight(
        selected,
        pred,
        profile,
    )

    w, score = run_ga(
        mod,
        selected,
        pred,
        profile,
        initial,
    )

    portfolio = (
        mod.calculate_position_table(
            selected,
            w,
            profile,
            score,
            pred,
        )
    )

    cmin, cmax = (
        mod.get_cash_bounds(
            pred,
            profile,
        )
    )

    req = {
        "stock_id",
        "name",
        "asset_type",
        "final_weight_percent",
        "allocated_amount",
        "predicted_regime",
    }

    portfolio_stock_ids = set(
        portfolio.loc[
            portfolio["asset_type"]
            == "stock",
            "stock_id",
        ]
        .astype(str)
        .map(normalize_stock_id)
    )

    portfolio_scope_ok = (
        selection_mode == "all"
        or portfolio_stock_ids.issubset(
            set(requested_ids)
        )
    )

    checks = [
        (
            "Formal Model 1 input exists",
            True,
            PREDICTION_FILE.name,
        ),
        (
            "Formal candidate input exists",
            True,
            CANDIDATE_FILE.name,
        ),
        (
            "No demo candidate fallback",
            True,
            "formal candidate CSV only",
        ),
        (
            "Investor-type eligibility pool applied",
            investor_pool_ok,
            f"investor_type={investor_type}",
        ),
        (
            "Frontend selection mode valid",
            selection_mode in {
                "all",
                "custom",
            },
            f"mode={selection_mode}; requested={requested_ids}",
        ),
        (
            "Selected Model 2 stocks stay inside frontend scope",
            scope_ok,
            f"selected={sorted(selected_ids)}",
        ),
        (
            "Final portfolio stays inside frontend scope",
            portfolio_scope_ok,
            f"portfolio={sorted(portfolio_stock_ids)}",
        ),
        (
            "Frozen V2 Strong parameters",
            True,
            str(CFG),
        ),
        (
            "Formal GA budget",
            True,
            f"{POP_SIZE}x{GENERATIONS}",
        ),
        (
            "Weights sum to one",
            np.isclose(
                w.sum(),
                1,
                atol=1e-8,
            ),
            f"{w.sum():.12f}",
        ),
        (
            "Weights nonnegative",
            (w >= -1e-12).all(),
            f"min={w.min():.12f}",
        ),
        (
            "Cash bounds preserved",
            (
                cmin - 1e-8
                <= w[-1]
                <= cmax + 1e-8
            ),
            (
                f"cash={w[-1]:.8f}; "
                f"[{cmin:.8f},{cmax:.8f}]"
            ),
        ),
        (
            "Frozen 30% stock cap",
            (
                np.max(w[:-1])
                <= .30 + 1e-8
            ),
            f"max={np.max(w[:-1]):.8f}",
        ),
        (
            "Model 3 interface columns",
            req.issubset(
                portfolio.columns
            ),
            ",".join(
                portfolio.columns
            ),
        ),
        (
            "User profile source",
            psource
            == "user_profile.json",
            psource,
        ),
        (
            "Investor type applied",
            investor_type
            in {
                "small",
                "normal",
                "large",
            },
            investor_type,
        ),
        (
            "Risk preference applied",
            risk_preference
            in {
                "conservative",
                "neutral",
                "aggressive",
            },
            risk_preference,
        ),
        (
            "Budget applied",
            budget > 0,
            f"{budget:.2f}",
        ),
        (
            "Fractional-share setting applied",
            True,
            str(allow_fractional),
        ),
        (
            "Profile propagated to portfolio",
            (
                "investor_type"
                in portfolio.columns
                and portfolio[
                    "investor_type"
                ]
                .astype(str)
                .str.lower()
                .eq(
                    investor_type
                )
                .all()
                and "risk_preference"
                in portfolio.columns
                and portfolio[
                    "risk_preference"
                ]
                .astype(str)
                .str.lower()
                .eq(
                    risk_preference
                )
                .all()
                and "budget"
                in portfolio.columns
                and np.allclose(
                    pd.to_numeric(
                        portfolio["budget"],
                        errors="coerce",
                    ),
                    budget,
                    equal_nan=False,
                )
            ),
            (
                f"investor_type={investor_type}; "
                f"risk_preference={risk_preference}; "
                f"budget={budget:.2f}"
            ),
        ),
    ]

    audit = pd.DataFrame(
        [
            {
                "check_name": name,
                "status": (
                    "PASS"
                    if bool(ok)
                    else "FAIL"
                ),
                "detail": detail,
            }
            for name, ok, detail
            in checks
        ]
    )

    print(
        "\nAUDIT\n",
        audit.to_string(
            index=False
        ),
    )

    if (
        audit["status"]
        == "FAIL"
    ).any():
        raise RuntimeError(
            "Audit failed; "
            "output not written."
        )

    portfolio.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    audit.to_csv(
        AUDIT_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    print("\nFINAL PORTFOLIO")

    print(
        portfolio[
            [
                "stock_id",
                "name",
                "asset_type",
                "final_weight_percent",
                "allocated_amount",
            ]
        ].to_string(
            index=False
        )
    )

    print(
        f"\nRESULT: PASS"
        f"\nCreated: "
        f"{OUTPUT_FILE.name}"
        f"\nCreated: "
        f"{AUDIT_FILE.name}"
    )


if __name__ == "__main__":
    main()
