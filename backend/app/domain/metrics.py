"""Eval metrics for the Best AI/ML pitch.

Computes precision / recall / F1 of the rule-based anomaly classifier against
the labeled eval set. Held-out 'test' split drives the "unseen layout
accuracy" headline metric.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.config import DATA_DIR
from app.domain.anomaly_engine import classify_zone
from app.schemas import AnomalyLabel, AnomalyPattern, Zone


@dataclass
class ConfusionRow:
    label: str
    tp: int
    fp: int
    fn: int

    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) > 0 else 0.0

    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if (self.tp + self.fn) > 0 else 0.0

    def f1(self) -> float:
        p, r = self.precision(), self.recall()
        return 2 * p * r / (p + r) if (p + r) > 0 else 0.0


def _scene_to_zone(scene: dict) -> Zone:
    return Zone(
        zone_id=scene["zone_id"],
        lat=scene["lat"],
        lon=scene["lon"],
        ndvi=scene["ndvi"],
        ndvi_baseline=scene["ndvi_baseline"],
        ndvi_drop=scene["ndvi_drop"],
        pattern=AnomalyPattern(scene["pattern"]),
        neighbor_avg_ndvi=scene["neighbor_avg_ndvi"],
        anomaly_score=scene["anomaly_score"],
    )


def _confusion(scenes: list[dict]) -> dict[str, ConfusionRow]:
    rows = {label.value: ConfusionRow(label=label.value, tp=0, fp=0, fn=0) for label in AnomalyLabel}
    for s in scenes:
        truth = s["label"]
        zone = _scene_to_zone(s)
        pred = classify_zone(zone).label.value
        if pred == truth:
            rows[truth].tp += 1
        else:
            rows[pred].fp += 1
            rows[truth].fn += 1
    return rows


def compute_metrics(eval_path: Path | None = None) -> dict:
    path = eval_path or DATA_DIR / "eval_scenes.json"
    if not path.exists():
        return {
            "ok": False,
            "reason": f"{path.name} not found. Run scripts/generate_eval_dataset.py.",
        }

    raw = json.loads(path.read_text())
    scenes = raw.get("scenes", [])
    train = [s for s in scenes if s.get("split") == "train"]
    test = [s for s in scenes if s.get("split") == "test"]

    overall = _confusion(scenes)
    test_only = _confusion(test) if test else {}

    def summarize(rows: dict[str, ConfusionRow]) -> dict:
        labels = list(rows.values())
        macro_p = sum(r.precision() for r in labels) / max(1, len(labels))
        macro_r = sum(r.recall() for r in labels) / max(1, len(labels))
        macro_f1 = sum(r.f1() for r in labels) / max(1, len(labels))
        accuracy = sum(r.tp for r in labels) / max(1, sum(r.tp + r.fn for r in labels))
        per_class = {
            r.label: {
                "tp": r.tp,
                "fp": r.fp,
                "fn": r.fn,
                "precision": round(r.precision(), 3),
                "recall": round(r.recall(), 3),
                "f1": round(r.f1(), 3),
            }
            for r in labels
        }
        return {
            "accuracy": round(accuracy, 3),
            "macro_precision": round(macro_p, 3),
            "macro_recall": round(macro_r, 3),
            "macro_f1": round(macro_f1, 3),
            "per_class": per_class,
        }

    return {
        "ok": True,
        "n_total": len(scenes),
        "n_train": len(train),
        "n_test_unseen": len(test),
        "overall": summarize(overall),
        "unseen": summarize(test_only) if test_only else None,
        "headline": {
            "anomaly_detection_accuracy": summarize(overall)["accuracy"],
            "unseen_accuracy": summarize(test_only)["accuracy"] if test_only else None,
            "inspection_needed_f1": (
                summarize(overall)["per_class"]
                .get(AnomalyLabel.NEEDS_IRRIGATION_INSPECTION.value, {})
                .get("f1")
            ),
        },
    }
