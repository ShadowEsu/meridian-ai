#!/usr/bin/env python3
"""Smoke test: load trained router, predict tier on sample prompts.

Supports both bundle kinds:
- legacy (HistGradientBoosting): uses features.vectorize(extract_features(...))
- mlp_v1: uses features.vectorize_rich(...)
"""
from __future__ import annotations

import sys
from pathlib import Path

import joblib
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from features import extract_features, vectorize, vectorize_rich  # noqa: E402

ARTIFACT = ROOT / "artifacts" / "router.joblib"

SAMPLES = [
    ("What is the capital of France?", "qa"),
    ("Translate 'good morning' to Spanish.", "translation"),
    ("Summarize this 800-word article into three bullet points.", "summarization"),
    ("Convert this SQL query into an equivalent pandas DataFrame chain and explain each step.", "coding"),
    ("Draft a polite email declining a vendor meeting.", "writing"),
    ("Design an end-to-end ML system that detects wasteful LLM API calls in real time across heterogeneous providers; include feature schema, online vs offline components, drift handling, and a cost model.", "architecture"),
    ("Prove that the sum of two odd numbers is always even, then generalize to k odd numbers.", "math"),
    ("Implement the Python function `merge_sort` recursively with type hints and a docstring.", "coding"),
]


def vectorize_for_bundle(bundle: dict, prompt: str, task: str) -> list[float]:
    name = bundle.get("vectorizer", "features.vectorize")
    if name == "features.vectorize_rich":
        return vectorize_rich(prompt, task)
    return vectorize(extract_features(prompt, task))


def main() -> None:
    bundle = joblib.load(ARTIFACT)
    pipe = bundle["pipeline"]
    le = bundle["label_encoder"]
    kind = bundle.get("kind", "legacy")
    print(f"Loaded bundle kind={kind} vectorizer={bundle.get('vectorizer', 'features.vectorize')}")
    print(f"Classes: {list(le.classes_)}\n")

    seen = set()
    for prompt, task in SAMPLES:
        x = vectorize_for_bundle(bundle, prompt, task)
        proba = pipe.predict_proba([x])[0]
        idx = int(np.argmax(proba))
        tier = le.inverse_transform([idx])[0]
        conf = float(proba[idx])
        seen.add(tier)
        snippet = prompt if len(prompt) <= 72 else prompt[:69] + "..."
        proba_str = " ".join(f"{c}={p:.2f}" for c, p in zip(le.classes_, proba))
        print(f"[{tier:7s} {conf:.2f}]  {snippet}\n             {proba_str}")

    print(f"\nTiers reached: {sorted(seen)} / available: {list(le.classes_)}")


if __name__ == "__main__":
    main()
