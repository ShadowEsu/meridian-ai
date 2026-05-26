#!/usr/bin/env python3
"""Persistent stdin/stdout MLP predictor.

Protocol
--------
Reads one JSON line per request from stdin:
    {"id": "<arbitrary>", "prompt": "<text>", "task_type": "<optional>"}

Writes one JSON line per response to stdout:
    {"id": "<echo>", "tier": "cheap|mid|premium", "confidence": 0.92,
     "probs": {"cheap":0.04, "mid":0.04, "premium":0.92}}

Errors:
    {"id": "<echo>", "error": "<message>"}

Designed to be spawned once by the Node server. Loads the joblib bundle on
boot, then services requests in a tight loop (no per-call import / fit cost).

Flush after every response so the parent never deadlocks.

Usage
-----
    python3 predict_cli.py [--model artifacts/router.joblib]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import warnings
from pathlib import Path

# Silence the StandardScaler-on-zero-variance hash buckets warnings (cosmetic,
# does not affect predictions). Filter before importing sklearn.
warnings.filterwarnings("ignore", category=RuntimeWarning)

import joblib  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from features import extract_features, vectorize, vectorize_rich  # noqa: E402


def vectorize_for_bundle(bundle: dict, prompt: str, task: str | None) -> list[float]:
    name = bundle.get("vectorizer", "features.vectorize")
    if name == "features.vectorize_rich":
        return vectorize_rich(prompt, task)
    return vectorize(extract_features(prompt, task))


def serve(model_path: Path) -> None:
    if not model_path.is_file():
        sys.stderr.write(f"[predict_cli] missing model: {model_path}\n")
        sys.stderr.flush()
        sys.exit(2)

    bundle = joblib.load(model_path)
    pipe = bundle["pipeline"]
    le = bundle["label_encoder"]
    classes = [str(c) for c in le.classes_]

    # Ready signal to parent.
    sys.stderr.write(
        f"[predict_cli] ready model={model_path.name} kind={bundle.get('kind','legacy')} "
        f"vectorizer={bundle.get('vectorizer','features.vectorize')} classes={classes}\n"
    )
    sys.stderr.flush()

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({"id": None, "error": f"bad json: {e}"}) + "\n")
            sys.stdout.flush()
            continue

        req_id = req.get("id")
        prompt = req.get("prompt") or ""
        task = req.get("task_type")
        try:
            if not isinstance(prompt, str) or not prompt.strip():
                raise ValueError("prompt must be a non-empty string")
            vec = vectorize_for_bundle(bundle, prompt, task)
            probs = pipe.predict_proba([vec])[0]
            idx = int(np.argmax(probs))
            resp = {
                "id": req_id,
                "tier": classes[idx],
                "confidence": float(probs[idx]),
                "probs": {classes[i]: float(probs[i]) for i in range(len(classes))},
            }
        except Exception as e:  # noqa: BLE001
            resp = {"id": req_id, "error": str(e)}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path,
                    default=ROOT / "artifacts" / "router.joblib")
    args = ap.parse_args()
    serve(args.model)
