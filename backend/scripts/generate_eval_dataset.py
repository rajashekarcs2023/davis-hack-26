"""Generate the labeled evaluation dataset.

Produces `app/data/eval_scenes.json` with `n` synthetic field-zone records,
covering all five label classes. Reproducible by seed.

Usage:
    cd backend
    python3 -m scripts.generate_eval_dataset --n 300 --seed 42
"""

from __future__ import annotations

import argparse
import json
import random
import sys

from app.config import DATA_DIR
from app.schemas import AnomalyLabel, AnomalyPattern


PATTERN_MIX = [
    (AnomalyPattern.NORMAL, 0.55),
    (AnomalyPattern.ROW_ALIGNED, 0.18),
    (AnomalyPattern.PATCHY, 0.13),
    (AnomalyPattern.UNIFORM_LOW, 0.09),
    (AnomalyPattern.EDGE, 0.05),
]


def _pick_pattern(rng: random.Random) -> AnomalyPattern:
    r = rng.random()
    cum = 0.0
    for p, w in PATTERN_MIX:
        cum += w
        if r <= cum:
            return p
    return AnomalyPattern.NORMAL


def _label_from(score: float, pattern: AnomalyPattern, rng: random.Random) -> AnomalyLabel:
    if score < 0.15:
        return AnomalyLabel.NORMAL
    if pattern == AnomalyPattern.UNIFORM_LOW and score < 0.5:
        # Add small noise so not 100% deterministic.
        return AnomalyLabel.FALSE_ALARM_CLOUD_NOISE if rng.random() < 0.85 else AnomalyLabel.MILD_STRESS_MONITOR
    if score < 0.35:
        return AnomalyLabel.MILD_STRESS_MONITOR
    if pattern == AnomalyPattern.ROW_ALIGNED:
        return AnomalyLabel.NEEDS_IRRIGATION_INSPECTION
    if pattern == AnomalyPattern.PATCHY:
        return AnomalyLabel.NEEDS_HUMAN_REVIEW if score < 0.7 else AnomalyLabel.NEEDS_IRRIGATION_INSPECTION
    if score >= 0.6:
        return AnomalyLabel.NEEDS_IRRIGATION_INSPECTION
    return AnomalyLabel.MILD_STRESS_MONITOR


def _generate_one(idx: int, rng: random.Random, *, holdout: bool) -> dict:
    pattern = _pick_pattern(rng)
    baseline = round(rng.uniform(0.55, 0.72), 3)

    if pattern == AnomalyPattern.NORMAL:
        ndvi = round(baseline + rng.uniform(-0.04, 0.04), 3)
    elif pattern == AnomalyPattern.UNIFORM_LOW:
        ndvi = round(baseline - rng.uniform(0.05, 0.18), 3)
    else:
        ndvi = round(baseline - rng.uniform(0.10, 0.35), 3)

    drop = round(max(0.0, baseline - ndvi), 3)
    neighbor_avg = round(baseline + rng.uniform(-0.03, 0.03), 3)

    # Approximate the runtime anomaly score with the same logic so labels are consistent.
    drop_norm = max(0.0, min(1.0, drop / 0.30))
    neighbor_gap = max(0.0, neighbor_avg - ndvi)
    z_norm = min(1.0, neighbor_gap / 0.15)
    pattern_bonus = 0.1 if pattern in {AnomalyPattern.ROW_ALIGNED, AnomalyPattern.PATCHY} else 0.0
    score = round(min(1.0, 0.55 * drop_norm + 0.4 * z_norm + pattern_bonus), 3)

    label = _label_from(score, pattern, rng)

    return {
        "scene_id": f"scene_{idx:04d}",
        "zone_id": f"Z{idx:04d}",
        "lat": round(38.5382 + rng.uniform(-0.02, 0.02), 5),
        "lon": round(-121.7617 + rng.uniform(-0.02, 0.02), 5),
        "ndvi": ndvi,
        "ndvi_baseline": baseline,
        "ndvi_drop": drop,
        "pattern": pattern.value,
        "neighbor_avg_ndvi": neighbor_avg,
        "anomaly_score": score,
        "label": label.value,
        "split": "test" if holdout else "train",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=300)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--holdout-fraction", type=float, default=0.10)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    n_holdout = max(1, int(round(args.n * args.holdout_fraction)))
    holdout_ids = set(rng.sample(range(args.n), n_holdout))

    scenes = [_generate_one(i, rng, holdout=(i in holdout_ids)) for i in range(args.n)]

    out = DATA_DIR / "eval_scenes.json"
    out.write_text(json.dumps({"count": args.n, "seed": args.seed, "scenes": scenes}, indent=2))
    print(f"Wrote {len(scenes)} scenes to {out}")
    print(f"  train: {sum(1 for s in scenes if s['split'] == 'train')}")
    print(f"  test:  {sum(1 for s in scenes if s['split'] == 'test')}")

    counts: dict[str, int] = {}
    for s in scenes:
        counts[s["label"]] = counts.get(s["label"], 0) + 1
    print("Label distribution:")
    for label, n in sorted(counts.items()):
        print(f"  {label:38s} {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
