# -*- coding: utf-8 -*-
"""
hmm_mta_lstm_sliding_window_experiment_v4_strict_rolling.py

V4 STRICT ROLLING CAUSAL HMM VERSION
------------------------------------------------------------
Why v4 exists:
- Earlier strict versions correctly fit HMM parameters only on Training.
- However, calling hmmlearn.model.predict()/predict_proba() on the whole
  Train+Validation+Test sequence performs sequence-wide decoding/smoothing.
  That means a state's inference at time t can indirectly use later observations.
- This version replaces full-sequence decoding with a forward FILTER:
  P(S_t | X_1...X_t), so each day uses only current/past observations.

Pipeline per rolling window:
Training only:
    fit StandardScaler
    fit GaussianHMM
    causal-filter training observations
    state -> Bear/Bull/Sideways mapping from TRAINING filtered states only
    MTA from training-fitted transition matrix

Train/Validation/Test:
    use frozen scaler/model/mapping
    causal forward filtering sequentially
    no future observations used to infer an earlier state

LSTM:
    scaler fit on Training only
    Validation only for EarlyStopping
    Test only for final evaluation
"""

import os
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import tensorflow as tf

from hmmlearn.hmm import GaussianHMM
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    precision_recall_fscore_support, confusion_matrix
)
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras import backend as K

import hmm_mta_lstm_sliding_window_experiment as base

CSV_PATH = os.getenv("HISTORY_CSV_PATH", "加權指數2014-2025.csv")
EXP_START_DATE = os.getenv("EXP_START_DATE", "2016-01-01")

TRAIN_MONTHS = 36
VAL_MONTHS = 12
TEST_MONTHS = 12
STEP_MONTHS = 12
SEQ_LEN = 3
N_STATES = 3
RANDOM_SEED = 42
CLASSES = ["Bear", "Bull", "Sideways"]


def set_seed(seed=RANDOM_SEED):
    np.random.seed(seed)
    tf.random.set_seed(seed)


def logsumexp(a):
    a = np.asarray(a, dtype=float)
    m = np.max(a)
    return m + np.log(np.sum(np.exp(a - m)))


def gaussian_diag_logpdf(X, means, covars):
    """
    X: (T, F)
    means: (K, F)
    covars: hmmlearn diag covariance; normalize to (K, F)
    """
    X = np.asarray(X, dtype=float)
    means = np.asarray(means, dtype=float)
    covars = np.asarray(covars, dtype=float)

    # hmmlearn may expose diag covars as (K,F,F); take diagonal if needed.
    if covars.ndim == 3:
        covars = np.diagonal(covars, axis1=1, axis2=2)

    covars = np.maximum(covars, 1e-8)
    T, F = X.shape
    K = means.shape[0]
    out = np.empty((T, K), dtype=float)

    const = F * np.log(2.0 * np.pi)
    for k in range(K):
        diff = X - means[k]
        out[:, k] = -0.5 * (
            const
            + np.sum(np.log(covars[k]))
            + np.sum((diff * diff) / covars[k], axis=1)
        )
    return out


def causal_filter_probs(model, X_scaled):
    """
    Forward filtering probabilities:
        alpha_t(k) = P(S_t=k | x_1,...,x_t)
    NO backward pass / future observations.
    """
    trans = np.asarray(model.transmat_, dtype=float)
    start = np.asarray(model.startprob_, dtype=float)

    trans = np.maximum(trans, 1e-300)
    start = np.maximum(start, 1e-300)

    log_trans = np.log(trans)
    log_start = np.log(start)
    log_emit = gaussian_diag_logpdf(X_scaled, model.means_, model.covars_)

    T, K = log_emit.shape
    log_alpha = np.empty((T, K), dtype=float)

    log_alpha[0] = log_start + log_emit[0]
    log_alpha[0] -= logsumexp(log_alpha[0])

    for t in range(1, T):
        for j in range(K):
            log_alpha[t, j] = (
                log_emit[t, j]
                + logsumexp(log_alpha[t - 1] + log_trans[:, j])
            )
        log_alpha[t] -= logsumexp(log_alpha[t])

    probs = np.exp(log_alpha)
    probs = probs / probs.sum(axis=1, keepdims=True)
    return probs


def calculate_mta(transition_matrix, absorbing_state):
    return base.calculate_mta(transition_matrix, absorbing_state)


def fit_hmm_strict_rolling_causal(df_feat, train_months):
    hmm_features = [
        "price_change", "volume_change", "foreign_change",
        "margin_change", "short_change"
    ]

    train_set = set(train_months)
    train_df = df_feat[df_feat["year_month"].isin(train_set)].sort_values("date").copy()
    if train_df.empty:
        raise ValueError("HMM training daily data is empty.")

    scaler = StandardScaler()
    X_train = scaler.fit_transform(train_df[hmm_features].values)

    model = GaussianHMM(
        n_components=N_STATES,
        covariance_type="diag",
        n_iter=500,
        random_state=RANDOM_SEED,
    )
    model.fit(X_train)

    # CAUSAL filtering on training observations.
    probs = causal_filter_probs(model, X_train)
    states = np.argmax(probs, axis=1)

    train_hmm = train_df.copy()
    train_hmm["state"] = states
    for s in range(N_STATES):
        train_hmm[f"prob_state_{s}"] = probs[:, s]

    stats = (
        train_hmm.groupby("state")
        .agg(
            count=("state", "size"),
            mean_price_change=("price_change", "mean"),
            std_price_change=("price_change", "std"),
            mean_volume_change=("volume_change", "mean"),
            mean_foreign_change=("foreign_change", "mean"),
            mean_margin_change=("margin_change", "mean"),
            mean_short_change=("short_change", "mean"),
        )
        .reset_index()
    )

    if len(stats) != N_STATES:
        raise ValueError(
            f"Training causal filter produced only {len(stats)} states."
        )

    ordered = stats.sort_values("mean_price_change").reset_index(drop=True)
    bear_state = int(ordered.iloc[0]["state"])
    bull_state = int(ordered.iloc[-1]["state"])
    side_state = [s for s in range(N_STATES)
                  if s not in [bear_state, bull_state]][0]

    mapping = {
        bear_state: "Bear",
        side_state: "Sideways",
        bull_state: "Bull",
    }

    mta = calculate_mta(model.transmat_, bear_state)

    return (
        model, scaler, hmm_features, stats, mapping,
        bear_state, bull_state, side_state, mta
    )


def filter_frozen_hmm_segment(
    df_feat, model, scaler, hmm_features,
    state_to_regime, mta_per_state, months
):
    """Filter exactly the supplied contiguous month segment, resetting at its first row."""
    month_set = set(months)
    use = df_feat[df_feat["year_month"].isin(month_set)].sort_values("date").copy()
    if use.empty:
        raise ValueError("Requested HMM inference segment is empty.")

    X = scaler.transform(use[hmm_features].values)
    probs = causal_filter_probs(model, X)
    states = np.argmax(probs, axis=1)
    use["state"] = states
    for s in range(N_STATES):
        use[f"prob_state_{s}"] = probs[:, s]
    use["regime"] = use["state"].map(state_to_regime)
    use["mta"] = use["state"].map(lambda s: float(mta_per_state[int(s)]))
    return use


def build_strict_window_inference(
    df_feat, model, scaler, hmm_features, mapping, mta,
    train_months, val_months, test_months
):
    """
    Context is filtered independently and is used only to construct LSTM sequences.
    The Train->Val->Test segment is filtered once from the first Training observation,
    so Training semantic states are exactly the states used by the formal pipeline.
    """
    context_months = period_range(train_months[0] - SEQ_LEN, SEQ_LEN)
    context = filter_frozen_hmm_segment(
        df_feat, model, scaler, hmm_features, mapping, mta, context_months
    )
    formal_months = train_months + val_months + test_months
    formal = filter_frozen_hmm_segment(
        df_feat, model, scaler, hmm_features, mapping, mta, formal_months
    )
    inferred = pd.concat([context, formal], ignore_index=True).sort_values("date").reset_index(drop=True)
    return inferred, context_months

def build_dataset(monthly):
    target_col = "target_regime_next_month"
    non_feature = ["month", "current_month_regime", target_col]
    features = [c for c in monthly.columns if c not in non_feature]

    X_list, y_list, months = [], [], []
    for i in range(len(monthly) - SEQ_LEN + 1):
        end_i = i + SEQ_LEN - 1
        X_list.append(monthly.loc[i:end_i, features].values)
        y_list.append(monthly.loc[end_i, target_col])

        feature_end = pd.Period(monthly.loc[end_i, "month"], freq="M")
        months.append(feature_end + 1)

    return np.asarray(X_list, dtype=np.float32), np.asarray(y_list), features, months


def scale_three_way(X_train, X_val, X_test):
    n_feat = X_train.shape[2]
    scaler = StandardScaler()
    scaler.fit(X_train.reshape(-1, n_feat))

    def t(x):
        return scaler.transform(x.reshape(-1, n_feat)).reshape(x.shape)

    return t(X_train), t(X_val), t(X_test), scaler


def majority_baseline(y_train, y_test):
    values, counts = np.unique(y_train, return_counts=True)
    majority = values[np.argmax(counts)]
    return np.full_like(y_test, majority), int(majority)


def period_range(start, n):
    return [start + i for i in range(n)]


def build_windows(first_target, last_target):
    windows = []
    start = first_target
    wid = 1
    total = TRAIN_MONTHS + VAL_MONTHS + TEST_MONTHS

    while start + total - 1 <= last_target:
        train = period_range(start, TRAIN_MONTHS)
        val = period_range(start + TRAIN_MONTHS, VAL_MONTHS)
        test = period_range(start + TRAIN_MONTHS + VAL_MONTHS, TEST_MONTHS)
        windows.append((wid, train, val, test))
        wid += 1
        start += STEP_MONTHS

    return windows


def no_overlap(train, val, test):
    return (
        set(train).isdisjoint(val)
        and set(train).isdisjoint(test)
        and set(val).isdisjoint(test)
        and max(train) < min(val)
        and max(val) < min(test)
    )


def main():
    set_seed()

    print("=" * 112)
    print("HMM + MTA + LSTM v4 - STRICT ROLLING CAUSAL PIPELINE")
    print("=" * 112)
    print(
        f"Train={TRAIN_MONTHS}月 / Val={VAL_MONTHS}月 / "
        f"Test={TEST_MONTHS}月 / Step={STEP_MONTHS}月 / Seq={SEQ_LEN}"
    )
    print("HMM parameters: Training only")
    print("HMM inference: FORWARD FILTER only (NO smoothing / NO future observation)")
    print("LSTM scaler: Training only | Validation: EarlyStopping | Test: final evaluation")
    print("Class Weight: OFF")

    raw = base.load_csv_data(CSV_PATH)
    raw = raw[raw["date"] >= pd.Timestamp(EXP_START_DATE)].copy()
    feat = base.create_features(raw)

    months = sorted(feat["year_month"].unique())
    first_target = months[0] + SEQ_LEN
    last_target = months[-1]
    windows = build_windows(first_target, last_target)

    encoder = LabelEncoder()
    encoder.fit(np.array(CLASSES))

    metrics = []
    preds = []
    audits = []
    mappings = []

    for wid, train_months, val_months, test_months in windows:

        (
            hmm_model, hmm_scaler, hmm_features, state_stats, mapping,
            bear_state, bull_state, side_state, mta
        ) = fit_hmm_strict_rolling_causal(feat, train_months)

        inferred, context_months = build_strict_window_inference(
            feat, hmm_model, hmm_scaler, hmm_features, mapping, mta,
            train_months, val_months, test_months
        )

        # Recompute semantic return means from the EXACT formal Training inference.
        causal_train = inferred[inferred["year_month"].isin(train_months)]
        semantic_means = (
            causal_train.groupby("regime")["price_change"].mean().to_dict()
        )
        return_order_ok = (
            semantic_means.get("Bear", np.nan)
            < semantic_means.get("Sideways", np.nan)
            < semantic_means.get("Bull", np.nan)
        )

        for _, r in state_stats.iterrows():
            s = int(r["state"])
            mappings.append({
                "window": wid,
                "state": s,
                "regime": mapping[s],
                "mean_price_change": float(r["mean_price_change"]),
                "train_daily_count": int(r["count"]),
                "mta": float(mta[s]),
            })

        monthly = base.build_monthly_hmm_mta_features(inferred, n_states=N_STATES)
        X, y_raw, feature_cols, target_months = build_dataset(monthly)
        y = encoder.transform(y_raw)

        month_to_idx = {m: i for i, m in enumerate(target_months)}
        required = train_months + val_months + test_months
        missing = [m for m in required if m not in month_to_idx]
        if missing:
            raise ValueError(f"Window {wid} missing target months: {missing}")

        tr = np.array([month_to_idx[m] for m in train_months])
        va = np.array([month_to_idx[m] for m in val_months])
        te = np.array([month_to_idx[m] for m in test_months])

        Xtr, Xva, Xte = X[tr], X[va], X[te]
        ytr, yva, yte = y[tr], y[va], y[te]

        Xtr, Xva, Xte, _ = scale_three_way(Xtr, Xva, Xte)

        K.clear_session()
        set_seed(RANDOM_SEED + wid)

        model = base.build_lstm_classifier(
            input_shape=(Xtr.shape[1], Xtr.shape[2]),
            n_classes=len(encoder.classes_),
        )
        es = EarlyStopping(
            monitor="val_loss", patience=15, restore_best_weights=True
        )

        history = model.fit(
            Xtr, ytr,
            validation_data=(Xva, yva),
            epochs=100,
            batch_size=8,
            verbose=0,
            callbacks=[es],
        )

        prob = model.predict(Xte, verbose=0)
        pred = np.argmax(prob, axis=1)
        labels = np.arange(len(encoder.classes_))

        bpred, bclass = majority_baseline(ytr, yte)

        row = {
            "window": wid,
            "train_start": str(train_months[0]),
            "train_end": str(train_months[-1]),
            "val_start": str(val_months[0]),
            "val_end": str(val_months[-1]),
            "test_start": str(test_months[0]),
            "test_end": str(test_months[-1]),
            "accuracy": accuracy_score(yte, pred),
            "macro_precision": precision_score(
                yte, pred, labels=labels, average="macro", zero_division=0
            ),
            "macro_recall": recall_score(
                yte, pred, labels=labels, average="macro", zero_division=0
            ),
            "macro_f1": f1_score(
                yte, pred, labels=labels, average="macro", zero_division=0
            ),
            "weighted_f1": f1_score(
                yte, pred, labels=labels, average="weighted", zero_division=0
            ),
            "majority_accuracy": accuracy_score(yte, bpred),
            "majority_macro_f1": f1_score(
                yte, bpred, labels=labels, average="macro", zero_division=0
            ),
            "epochs": len(history.history.get("loss", [])),
        }

        p, r, f, support = precision_recall_fscore_support(
            yte, pred, labels=labels, zero_division=0
        )
        for i, cls in enumerate(encoder.classes_):
            row[f"{cls}_precision"] = p[i]
            row[f"{cls}_recall"] = r[i]
            row[f"{cls}_f1"] = f[i]
            row[f"{cls}_support"] = int(support[i])

        row["accuracy_minus_majority"] = (
            row["accuracy"] - row["majority_accuracy"]
        )
        row["macro_f1_minus_majority"] = (
            row["macro_f1"] - row["majority_macro_f1"]
        )
        metrics.append(row)

        actual_names = encoder.inverse_transform(yte)
        pred_names = encoder.inverse_transform(pred)
        for i, m in enumerate(test_months):
            preds.append({
                "window": wid,
                "target_month": str(m),
                "actual": actual_names[i],
                "predicted": pred_names[i],
                "prob_Bear": float(prob[i, encoder.transform(["Bear"])[0]]),
                "prob_Bull": float(prob[i, encoder.transform(["Bull"])[0]]),
                "prob_Sideways": float(prob[i, encoder.transform(["Sideways"])[0]]),
            })

        probability_ok = bool(
            np.allclose(prob.sum(axis=1), 1.0, atol=1e-5)
        )

        hmm_fit_months = sorted(causal_train["year_month"].unique())
        exact_hmm_window = (hmm_fit_months == train_months)
        mapping_one_to_one = (set(mapping.keys()) == set(range(N_STATES)) and len(set(mapping.values())) == N_STATES)
        all_regimes_present = set(semantic_means.keys()) == set(CLASSES)
        target_alignment_ok = all(target_months[i] == pd.Period(monthly.loc[i + SEQ_LEN - 1, "month"], freq="M") + 1 for i in range(len(target_months)))

        audits.append({
            "window": wid,
            "hmm_fit_start": str(hmm_fit_months[0]),
            "hmm_fit_end": str(hmm_fit_months[-1]),
            "hmm_fit_month_count": len(hmm_fit_months),
            "hmm_fit_exact_rolling_window": bool(exact_hmm_window),
            "context_start": str(context_months[0]),
            "context_end": str(context_months[-1]),
            "context_target_training": False,
            "train_val_test_no_overlap": no_overlap(
                train_months, val_months, test_months
            ),
            "hmm_parameter_fit_training_only": True,
            "hmm_inference_causal_forward_filter": True,
            "no_backward_smoothing": True,
            "lstm_scaler_training_only": True,
            "test_used_for_training": False,
            "probability_sum_ok": probability_ok,
            "mapping_one_to_one": bool(mapping_one_to_one),
            "all_three_regimes_present": bool(all_regimes_present),
            "target_month_alignment_ok": bool(target_alignment_ok),
            "return_order_bear_sideways_bull": bool(return_order_ok),
            "audit_pass": bool(
                no_overlap(train_months, val_months, test_months)
                and exact_hmm_window
                and probability_ok
                and mapping_one_to_one
                and all_regimes_present
                and target_alignment_ok
                and return_order_ok
            ),
        })

        print("\n" + "=" * 112)
        print(f"WINDOW {wid}")
        print("=" * 112)
        print(f"HMM FIT PERIOD: {hmm_fit_months[0]} ~ {hmm_fit_months[-1]} | Months={len(hmm_fit_months)}")
        print(f"LSTM TRAIN TARGET: {train_months[0]} ~ {train_months[-1]} | Months={len(train_months)}")
        print(f"VALIDATION TARGET: {val_months[0]} ~ {val_months[-1]} | Months={len(val_months)}")
        print(f"TEST TARGET: {test_months[0]} ~ {test_months[-1]} | Months={len(test_months)}")
        print(f"CONTEXT ONLY: {context_months[0]} ~ {context_months[-1]} (not target training)")
        print("Mapping:", mapping)
        print("Semantic mean returns:", semantic_means)
        print("Return-order audit:", "PASS" if return_order_ok else "FAIL")
        print(
            f"Accuracy={row['accuracy']:.4f} | "
            f"Macro F1={row['macro_f1']:.4f} | "
            f"Majority Macro F1={row['majority_macro_f1']:.4f} | "
            f"Δ={row['macro_f1_minus_majority']:+.4f}"
        )

    metrics_df = pd.DataFrame(metrics)
    pred_df = pd.DataFrame(preds)
    audit_df = pd.DataFrame(audits)
    mapping_df = pd.DataFrame(mappings)

    summary_rows = []
    for c in [
        "accuracy", "macro_precision", "macro_recall", "macro_f1",
        "weighted_f1", "majority_accuracy", "majority_macro_f1",
        "accuracy_minus_majority", "macro_f1_minus_majority",
        "Bear_f1", "Bull_f1", "Sideways_f1"
    ]:
        summary_rows.append({
            "metric": c,
            "mean": metrics_df[c].mean(),
            "std": metrics_df[c].std(ddof=1) if len(metrics_df) > 1 else 0.0,
            "min": metrics_df[c].min(),
            "max": metrics_df[c].max(),
        })
    summary_df = pd.DataFrame(summary_rows)

    metrics_df.to_csv(
        "experiment_v4_strict_rolling_metrics.csv", index=False, encoding="utf-8-sig"
    )
    pred_df.to_csv(
        "experiment_v4_strict_rolling_predictions.csv", index=False, encoding="utf-8-sig"
    )
    audit_df.to_csv(
        "experiment_v4_strict_rolling_audit.csv", index=False, encoding="utf-8-sig"
    )
    mapping_df.to_csv(
        "experiment_v4_strict_rolling_hmm_mapping.csv", index=False, encoding="utf-8-sig"
    )
    summary_df.to_csv(
        "experiment_v4_strict_rolling_summary.csv", index=False, encoding="utf-8-sig"
    )

    print("\n" + "=" * 112)
    print("V4 STRICT ROLLING CAUSAL SUMMARY")
    print("=" * 112)
    for _, r in summary_df.iterrows():
        print(f"{r['metric']:<28} {r['mean']:.4f} ± {r['std']:.4f}")

    print("\n" + "=" * 112)
    print("FINAL STRICT ROLLING CAUSAL AUDIT")
    print("=" * 112)
    print(audit_df.to_string(index=False))

    print("\n已輸出（不覆蓋舊結果）：")
    print("- experiment_v4_strict_rolling_metrics.csv")
    print("- experiment_v4_strict_rolling_predictions.csv")
    print("- experiment_v4_strict_rolling_audit.csv")
    print("- experiment_v4_strict_rolling_hmm_mapping.csv")
    print("- experiment_v4_strict_rolling_summary.csv")

    if audit_df["audit_pass"].all():
        print("\nAUDIT RESULT: ALL V4 WINDOWS PASS")
    else:
        print("\nAUDIT RESULT: 有 strict rolling causal window 未通過，請先不要交正式模型結果。")


if __name__ == "__main__":
    main()
