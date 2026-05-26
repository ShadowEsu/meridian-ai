#!/usr/bin/env python3
"""Train an MLP router classifier on labeled (prompt, task_type) → tier data.

Architecture
------------
Input: 536-d feature vector (24 structural + 512 hashed char n-grams)
       (see features.vectorize_rich)
Net:   StandardScaler → MLPClassifier(hidden=(256, 128, 64), relu, Adam,
       L2 alpha=1e-4, early stopping on validation split)
Output: 3-class softmax over [cheap, mid, premium]

Class imbalance is handled via per-sample weights (inverse class frequency)
since sklearn's MLPClassifier does not accept class_weight directly.

Usage
-----
    python train_mlp.py --data data/merged_labeled.csv --out artifacts/router.joblib

Artifact bundle
---------------
joblib.dump({
    "kind": "mlp_v1",
    "pipeline": Pipeline([StandardScaler, MLPClassifier]),
    "label_encoder": LabelEncoder,
    "feature_dim": 536,
    "vectorizer": "features.vectorize_rich",
    "tier_order": ["cheap","mid","premium"],
}, out)

The smoke / inference path loads the bundle, looks at `vectorizer`, and
calls features.vectorize_rich(prompt, task) before pipeline.predict_proba.
"""
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler

from features import rich_feature_dim, vectorize_rich

TIER_ORDER = ["cheap", "mid", "premium"]


def load_dataset(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for col in ("prompt", "label_tier"):
        if col not in df.columns:
            raise SystemExit(f"CSV must contain column: {col}")
    df["label_tier"] = df["label_tier"].str.lower().str.strip()
    bad = ~df["label_tier"].isin(TIER_ORDER)
    if bad.any():
        raise SystemExit(f"Invalid label_tier values: {df.loc[bad, 'label_tier'].unique()}")
    if "task_type" not in df.columns:
        df["task_type"] = "unknown"
    df["task_type"] = df["task_type"].fillna("unknown").str.lower().str.strip()
    df["prompt"] = df["prompt"].astype(str)
    return df


def featurize(df: pd.DataFrame) -> np.ndarray:
    rows = [vectorize_rich(p, t) for p, t in zip(df["prompt"], df["task_type"])]
    return np.asarray(rows, dtype=np.float32)


def compute_sample_weights(y: np.ndarray, classes: np.ndarray) -> np.ndarray:
    counts = Counter(int(v) for v in y)
    n = float(len(y))
    n_classes = float(len(classes))
    weights = {c: n / (n_classes * counts[c]) for c in counts}
    return np.asarray([weights[int(v)] for v in y], dtype=np.float32)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("artifacts/router.joblib"))
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument("--random-state", type=int, default=42)
    ap.add_argument("--hidden", type=str, default="256,128,64",
                    help="Comma-separated hidden layer sizes")
    ap.add_argument("--max-iter", type=int, default=200)
    ap.add_argument("--alpha", type=float, default=1e-4)
    args = ap.parse_args()

    df = load_dataset(args.data)
    print(f"Loaded {len(df)} rows from {args.data}")
    print("Tier dist:", df["label_tier"].value_counts().to_dict())

    X = featurize(df)
    print(f"Feature matrix: {X.shape} (expected dim={rich_feature_dim()})")

    le = LabelEncoder()
    le.fit(TIER_ORDER)
    y = le.transform(df["label_tier"].tolist())

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y,
        test_size=args.test_size,
        random_state=args.random_state,
        stratify=y,
    )

    hidden = tuple(int(h) for h in args.hidden.split(",") if h.strip())
    pipe = Pipeline([
        ("scaler", StandardScaler(with_mean=True)),
        ("mlp", MLPClassifier(
            hidden_layer_sizes=hidden,
            activation="relu",
            solver="adam",
            alpha=args.alpha,
            batch_size=256,
            learning_rate_init=1e-3,
            max_iter=args.max_iter,
            early_stopping=True,
            validation_fraction=0.1,
            n_iter_no_change=10,
            random_state=args.random_state,
            verbose=False,
        )),
    ])

    sw = compute_sample_weights(y_tr, np.unique(y_tr))
    print(f"Training MLP hidden={hidden} alpha={args.alpha} on {len(X_tr)} rows...")
    # MLPClassifier doesn't accept sample_weight in fit, so weight via resampling:
    # bootstrap sample with replacement proportional to weights.
    rng = np.random.default_rng(args.random_state)
    weighted_idx = rng.choice(
        np.arange(len(X_tr)),
        size=len(X_tr),
        replace=True,
        p=sw / sw.sum(),
    )
    X_tr_b = X_tr[weighted_idx]
    y_tr_b = y_tr[weighted_idx]
    pipe.fit(X_tr_b, y_tr_b)

    pred = pipe.predict(X_te)
    print("\n=== Test-set metrics ===")
    print(classification_report(
        y_te, pred, target_names=le.classes_, digits=3, zero_division=0
    ))
    print("Confusion matrix (rows=true, cols=pred):")
    print(pd.DataFrame(
        confusion_matrix(y_te, pred),
        index=[f"true_{c}" for c in le.classes_],
        columns=[f"pred_{c}" for c in le.classes_],
    ))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "kind": "mlp_v1",
        "pipeline": pipe,
        "label_encoder": le,
        "feature_dim": rich_feature_dim(),
        "vectorizer": "features.vectorize_rich",
        "tier_order": TIER_ORDER,
        "trained_on": str(args.data),
        "rows": int(len(df)),
        "hidden_layer_sizes": list(hidden),
    }
    joblib.dump(bundle, args.out)
    print(f"\nSaved bundle → {args.out}")


if __name__ == "__main__":
    main()
