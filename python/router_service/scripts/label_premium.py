#!/usr/bin/env python3
"""Convert GSM8K + HumanEval into router training CSV rows (premium-tier boosters).

Reads:
    data/raw/gsm8k-train.jsonl     (OpenAI GSM8K, MIT license)
    data/raw/humaneval.jsonl       (OpenAI HumanEval, MIT license)

Writes:
    data/gsm8k_labeled.csv
    data/humaneval_labeled.csv

Tier rules
----------
GSM8K:
    All entries are math word problems. Short (<200 chars) single-step ones → mid.
    Multi-sentence or multi-step (>= 200 chars or 2+ sentences) → premium.
HumanEval:
    All entries are real Python programming problems with docstring + tests. → premium.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"


def label_gsm8k() -> tuple[int, dict[str, int]]:
    src = RAW / "gsm8k-train.jsonl"
    dst = ROOT / "data" / "gsm8k_labeled.csv"
    counts = {"mid": 0, "premium": 0}
    rows = []
    with src.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            q = (d.get("question") or "").strip()
            if not q:
                continue
            sents = len(re.split(r"[.!?]+", q.strip()))
            tier = "premium" if (len(q) >= 200 or sents >= 3) else "mid"
            prompt = q.replace("\n", " ")
            if len(prompt) > 2000:
                prompt = prompt[:2000].rstrip() + "..."
            rows.append((prompt, "math", tier))
            counts[tier] += 1
    with dst.open("w", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(["prompt", "task_type", "label_tier"])
        w.writerows(rows)
    print(f"GSM8K -> {dst}  ({len(rows)} rows, tiers={counts})")
    return len(rows), counts


def label_humaneval() -> tuple[int, dict[str, int]]:
    src = RAW / "humaneval.jsonl"
    dst = ROOT / "data" / "humaneval_labeled.csv"
    counts = {"premium": 0}
    rows = []
    with src.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            p = (d.get("prompt") or "").strip()
            if not p:
                continue
            # HumanEval prompts are function signature + docstring + tests. Wrap
            # so the router sees a real natural-language coding ask.
            entry = d.get("entry_point", "function")
            framed = (
                f"Implement the Python function `{entry}` matching this signature "
                f"and docstring. Pass all hidden test cases. ```python\n{p}```"
            )
            if len(framed) > 2000:
                framed = framed[:2000].rstrip() + "..."
            framed = framed.replace("\n", " ")
            rows.append((framed, "coding", "premium"))
            counts["premium"] += 1
    with dst.open("w", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(["prompt", "task_type", "label_tier"])
        w.writerows(rows)
    print(f"HumanEval -> {dst}  ({len(rows)} rows, tiers={counts})")
    return len(rows), counts


if __name__ == "__main__":
    label_gsm8k()
    label_humaneval()
