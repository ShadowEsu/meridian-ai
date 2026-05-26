#!/usr/bin/env python3
"""Convert Databricks Dolly-15k into router training CSV.

Reads:  data/raw/dolly-15k.jsonl
Writes: data/dolly_labeled.csv  (prompt, task_type, label_tier)

Mapping rules
-------------
task_type:
    closed_qa, open_qa, general_qa, information_extraction -> qa
    summarization                                          -> summarization
    classification                                         -> classification
    creative_writing                                       -> writing
    brainstorming                                          -> brainstorming

label_tier (deterministic heuristic over instruction + context + response):
    cheap   = short prompt AND short response AND simple category
              (no code, no math, no multi-step reasoning markers)
    premium = long prompt OR long response OR contains code/math/proof markers
              OR explicit multi-step / design / analyze / prove instructions
    mid     = everything else
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "raw" / "dolly-15k.jsonl"
DST = ROOT / "data" / "dolly_labeled.csv"

CATEGORY_TO_TASK = {
    "closed_qa": "qa",
    "open_qa": "qa",
    "general_qa": "qa",
    "information_extraction": "qa",
    "summarization": "summarization",
    "classification": "classification",
    "creative_writing": "writing",
    "brainstorming": "brainstorming",
}

PREMIUM_MARKERS = re.compile(
    r"```|def \w+\(|class \w+|SELECT .* FROM|"
    r"\\\\frac|\\\\sum|\\\\int|theorem|prove that|"
    r"step[- ]by[- ]step|first.*then.*finally|"
    r"design (a|an|the) (system|architecture|model|protocol)|"
    r"implement (a|an|the) |refactor this|"
    r"analy[sz]e (the|this) |compare and contrast|"
    r"trade[- ]?offs?\b|root cause|critique",
    re.IGNORECASE,
)

CHEAP_CATEGORIES = {"closed_qa", "classification", "information_extraction"}


def classify_tier(instruction: str, context: str, response: str, category: str) -> str:
    instr_len = len(instruction)
    resp_len = len(response)
    ctx_len = len(context)
    body = f"{instruction}\n{response}"

    has_premium_marker = bool(PREMIUM_MARKERS.search(body))

    if has_premium_marker:
        return "premium"
    if instr_len > 400 or resp_len > 900 or ctx_len > 2500:
        return "premium"
    # Decisive cheap: short instruction OR short response on factual categories.
    if instr_len < 100 and ctx_len < 500:
        return "cheap"
    if instr_len < 160 and resp_len < 200 and category in CHEAP_CATEGORIES:
        return "cheap"
    return "mid"


def build_prompt(instruction: str, context: str) -> str:
    instruction = (instruction or "").strip()
    context = (context or "").strip()
    if context:
        full = f"{instruction}\n\nContext: {context}"
    else:
        full = instruction
    if len(full) > 2000:
        full = full[:2000].rstrip() + "..."
    return full.replace("\n", " ").strip()


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source file: {SRC}")

    rows = []
    tier_counts = {"cheap": 0, "mid": 0, "premium": 0}
    task_counts: dict[str, int] = {}
    skipped = 0

    with SRC.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue
            instruction = d.get("instruction", "")
            context = d.get("context", "")
            response = d.get("response", "")
            category = d.get("category", "")
            if not instruction:
                skipped += 1
                continue
            prompt = build_prompt(instruction, context)
            if not prompt:
                skipped += 1
                continue
            task_type = CATEGORY_TO_TASK.get(category, "qa")
            tier = classify_tier(instruction, context, response, category)
            rows.append((prompt, task_type, tier))
            tier_counts[tier] += 1
            task_counts[task_type] = task_counts.get(task_type, 0) + 1

    DST.parent.mkdir(parents=True, exist_ok=True)
    with DST.open("w", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(["prompt", "task_type", "label_tier"])
        w.writerows(rows)

    print(f"Wrote {len(rows)} rows -> {DST}")
    print(f"Tier distribution: {tier_counts}")
    print(f"Task-type distribution: {task_counts}")
    print(f"Skipped: {skipped}")


if __name__ == "__main__":
    main()
