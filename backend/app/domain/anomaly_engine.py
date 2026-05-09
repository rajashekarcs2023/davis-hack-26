"""Anomaly detection + zone classification.

Reads the field grid JSON, computes neighbor-relative NDVI z-scores, and
classifies each zone using a simple rule-based policy. Designed so the metrics
page has something concrete to evaluate — not a black box.

Why rule-based and not a trained model? Hackathon time. The anomaly *policy*
is small and explainable; the value-add of a trained classifier on synthetic
data is near zero. The labeled eval set tests this policy against ground truth.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.config import DATA_DIR
from app.schemas import AnomalyLabel, AnomalyPattern, FieldGrid, Zone


@dataclass
class AnomalyClassification:
    label: AnomalyLabel
    confidence: float
    reasoning: str


# ---------------------------------------------------------------------------
# Field grid I/O
# ---------------------------------------------------------------------------


def load_field_grid(path: Path | None = None) -> FieldGrid:
    p = path or DATA_DIR / "field_grid.json"
    with p.open("r") as f:
        raw = json.load(f)
    return FieldGrid(**raw)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def compute_anomaly_score(zone: Zone, neighbors: list[Zone]) -> float:
    """Z-score-style anomaly. 0 = healthy, 1 = strongly anomalous.

    `ndvi_drop` already encodes how far the zone is below its baseline; we
    blend it with how far it is below its neighbors so localized stress beats
    field-wide drift.
    """
    drop = max(0.0, min(1.0, zone.ndvi_drop / 0.30))  # 0.30 NDVI drop is "severe"
    neighbor_vals = [n.ndvi for n in neighbors] or [zone.ndvi]
    n_mean = float(np.mean(neighbor_vals))
    n_std = float(np.std(neighbor_vals)) or 0.05
    z = max(0.0, (n_mean - zone.ndvi) / n_std)
    z_norm = min(1.0, z / 3.0)  # 3 sigma -> 1.0
    pattern_bonus = 0.1 if zone.pattern in {AnomalyPattern.ROW_ALIGNED, AnomalyPattern.PATCHY} else 0.0
    raw = 0.55 * drop + 0.4 * z_norm + pattern_bonus
    return round(min(1.0, raw), 3)


def classify_zone(zone: Zone) -> AnomalyClassification:
    """Map an anomaly score + pattern into a label.

    Thresholds chosen so the eval-set generator can produce all five classes.
    """
    score = zone.anomaly_score

    if score < 0.15:
        return AnomalyClassification(
            AnomalyLabel.NORMAL,
            confidence=1.0 - score,
            reasoning="Vegetation health is consistent with neighbors and baseline.",
        )

    if zone.pattern == AnomalyPattern.UNIFORM_LOW and score < 0.5:
        # Whole-field low NDVI smells like a satellite/cloud artifact, not localized stress.
        return AnomalyClassification(
            AnomalyLabel.FALSE_ALARM_CLOUD_NOISE,
            confidence=0.55 + 0.3 * (0.5 - score),
            reasoning="Uniform-low pattern across the field suggests image-quality noise rather than stress.",
        )

    if score < 0.35:
        return AnomalyClassification(
            AnomalyLabel.MILD_STRESS_MONITOR,
            confidence=0.65,
            reasoning="Mild deviation from neighbors; recommend monitoring before dispatching the robot.",
        )

    if zone.pattern == AnomalyPattern.ROW_ALIGNED and score >= 0.45:
        return AnomalyClassification(
            AnomalyLabel.NEEDS_IRRIGATION_INSPECTION,
            confidence=min(0.95, 0.5 + score * 0.5),
            reasoning="Row-aligned vegetation drop is a strong indicator of irrigation-line failure.",
        )

    if zone.pattern == AnomalyPattern.PATCHY and score >= 0.5:
        return AnomalyClassification(
            AnomalyLabel.NEEDS_HUMAN_REVIEW,
            confidence=0.7,
            reasoning="Patchy stress could be disease, pest, or weed pressure — pattern is ambiguous.",
        )

    if score >= 0.6:
        return AnomalyClassification(
            AnomalyLabel.NEEDS_IRRIGATION_INSPECTION,
            confidence=0.75,
            reasoning="Strong localized vegetation drop without row alignment — still warrants ground-truth.",
        )

    return AnomalyClassification(
        AnomalyLabel.MILD_STRESS_MONITOR,
        confidence=0.6,
        reasoning="Moderate anomaly without a clear pattern; default to monitoring.",
    )


def neighbors_of(zone: Zone, grid: FieldGrid) -> list[Zone]:
    """4-connected neighbors by zone-id naming convention (row-letter + col-number)."""
    if not zone.zone_id or len(zone.zone_id) < 2:
        return []
    row, col = zone.zone_id[0].upper(), zone.zone_id[1:]
    try:
        col_n = int(col)
    except ValueError:
        return []
    cand = [
        f"{row}{col_n - 1}",
        f"{row}{col_n + 1}",
        f"{chr(ord(row) - 1)}{col_n}",
        f"{chr(ord(row) + 1)}{col_n}",
    ]
    by_id = {z.zone_id: z for z in grid.zones}
    return [by_id[c] for c in cand if c in by_id]


def annotate_grid(grid: FieldGrid) -> FieldGrid:
    """Return a copy of the grid with `anomaly_score` recomputed."""
    annotated: list[Zone] = []
    for z in grid.zones:
        nbrs = neighbors_of(z, grid)
        score = compute_anomaly_score(z, nbrs)
        annotated.append(z.model_copy(update={"anomaly_score": score, "neighbor_avg_ndvi": _avg(nbrs, z.ndvi)}))
    return grid.model_copy(update={"zones": annotated})


def _avg(zones: list[Zone], default: float) -> float:
    if not zones:
        return default
    return round(float(np.mean([z.ndvi for z in zones])), 3)


def rank_anomalies(grid: FieldGrid, *, top_k: int = 5) -> list[Zone]:
    """Highest anomaly first."""
    return sorted(grid.zones, key=lambda z: z.anomaly_score, reverse=True)[:top_k]
