"""Stage 3 — NDVI math + rule-based anomaly classification.

For every zone chip:
    1. Compute pixel-level NDVI = (NIR - RED) / (NIR + RED), clipped to
       [-1, 1] with epsilon to avoid division by zero on shadow pixels.
    2. Aggregate to a per-zone mean.
    3. Compute `ndvi_drop` = `ndvi_baseline` - `ndvi_mean` (positive ⇒
       the zone has lost vegetative vigour).
    4. Detect a coarse spatial pattern (row_aligned / patchy / edge /
       uniform_low / normal) from the per-zone NDVI image.
    5. Compose a normalised `anomaly_score` in [0, 1] from the drop
       magnitude, the spatial coherence, and the gap to neighbour zones.

This mirrors (but does not import — we keep the pipeline a separate
deployable) the rule-based classifier in
`backend/app/domain/anomaly_engine.py` so the output JSON is the right
shape for `Zone` consumers.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from data_pipeline.chip import ZoneChip

# Numerical-stability epsilon for NDVI. Shadows / clouds can push (NIR+RED)
# to near-zero; the epsilon keeps the ratio finite without affecting
# vegetated pixels (which always have NIR+RED well above this).
NDVI_EPS = 1e-6

# Default healthy-canopy reference. Real deployments overwrite this with a
# seasonal historical mean per field (we expose it as an argument). For
# the demo, 0.65 matches the synthetic UCD-tomato baseline already in
# `backend/app/data/field_grid.json`.
DEFAULT_NDVI_BASELINE = 0.65

# Anomaly-score thresholds, calibrated against the existing synthetic
# field. Drop >= 0.20 with row-aligned pattern → score ~ 0.85 (matches B3
# in field_grid.json). Drop < 0.05 → score ≈ 0.05.
DROP_FOR_FULL_SCORE = 0.25
NEIGHBOUR_GAP_WEIGHT = 0.30
PATTERN_BONUSES = {
    "row_aligned": 0.20,
    "patchy": 0.05,
    "edge": 0.10,
    "uniform_low": -0.05,
    "normal": 0.0,
}


@dataclass(frozen=True)
class ZoneNDVI:
    """Per-zone NDVI summary with optional anomaly scoring.

    Filled in by `compute_zone_ndvi` first, then enriched with
    `neighbor_avg_ndvi` / `anomaly_score` by `score_zone_anomaly`.
    """

    zone_id: str
    ndvi_mean: float
    ndvi_baseline: float
    ndvi_drop: float
    pattern: str
    neighbor_avg_ndvi: float
    anomaly_score: float
    lat: float
    lon: float


def compute_zone_ndvi(
    chip: ZoneChip,
    *,
    ndvi_baseline: float = DEFAULT_NDVI_BASELINE,
) -> ZoneNDVI:
    """Pixel-level NDVI + spatial pattern detection for a single zone.

    Returns a `ZoneNDVI` with `neighbor_avg_ndvi=0.0` and `anomaly_score=0.0`
    placeholders — those need the whole grid and are filled in by
    `score_zone_anomaly` once every chip has been processed.
    """
    ndvi_pixels = _ndvi_pixels(chip.nir, chip.red)
    ndvi_mean = float(np.mean(ndvi_pixels))
    pattern = _detect_pattern(ndvi_pixels, ndvi_baseline)
    return ZoneNDVI(
        zone_id=chip.zone_id,
        ndvi_mean=round(ndvi_mean, 3),
        ndvi_baseline=round(float(ndvi_baseline), 3),
        ndvi_drop=round(float(ndvi_baseline - ndvi_mean), 3),
        pattern=pattern,
        neighbor_avg_ndvi=0.0,
        anomaly_score=0.0,
        lat=chip.lat,
        lon=chip.lon,
    )


def score_zone_anomaly(
    zones: list[ZoneNDVI],
    *,
    rows: int,
    cols: int,
) -> list[ZoneNDVI]:
    """Second-pass scoring: fill in `neighbor_avg_ndvi` and `anomaly_score`.

    The neighbour signal matters: a zone with NDVI=0.45 surrounded by 0.65
    neighbours is much more interesting (likely localised stress) than one
    with NDVI=0.45 in a field where every neighbour is also 0.45 (likely a
    seasonal / soil-wide effect).
    """
    by_id = {z.zone_id: z for z in zones}
    out: list[ZoneNDVI] = []
    for z in zones:
        row = ord(z.zone_id[0]) - ord("A")
        col = int(z.zone_id[1:]) - 1
        neighbours = _neighbour_zones(row, col, rows, cols, by_id)
        neighbour_mean = (
            float(np.mean([n.ndvi_mean for n in neighbours]))
            if neighbours
            else z.ndvi_mean
        )
        score = _anomaly_score(z, neighbour_mean)
        out.append(
            ZoneNDVI(
                zone_id=z.zone_id,
                ndvi_mean=z.ndvi_mean,
                ndvi_baseline=z.ndvi_baseline,
                ndvi_drop=z.ndvi_drop,
                pattern=z.pattern,
                neighbor_avg_ndvi=round(neighbour_mean, 3),
                anomaly_score=round(score, 3),
                lat=z.lat,
                lon=z.lon,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _ndvi_pixels(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """Stable NDVI on a (H, W) numpy slab. Output clipped to [-1, 1]."""
    num = nir.astype(np.float32) - red.astype(np.float32)
    den = nir.astype(np.float32) + red.astype(np.float32) + NDVI_EPS
    ndvi = num / den
    return np.clip(ndvi, -1.0, 1.0)


def _detect_pattern(ndvi_pixels: np.ndarray, baseline: float) -> str:
    """Classify the spatial pattern of low-NDVI pixels in this zone.

    The labels mirror `backend/app/schemas.py::AnomalyPattern` so the
    downstream JSON is shape-compatible. We use very lightweight heuristics:

    - row_aligned   row-mean variance is high while col-mean variance is low
                    (a horizontal band of stressed pixels)
    - edge          mean NDVI on the outer 1/6 frame is materially lower than
                    in the centre (edge / irrigation-tail effect)
    - uniform_low   the whole chip is below baseline by > 0.10 with low
                    spatial variance (field-wide nutrient or seasonal)
    - patchy        scattered low-NDVI clusters with high spatial variance
    - normal        no signal that crosses the threshold
    """
    threshold = baseline - 0.10
    low_mask = ndvi_pixels < threshold

    if low_mask.mean() < 0.05:
        return "normal"

    # uniform_low — whole chip is depressed and looks flat.
    if ndvi_pixels.mean() < threshold and ndvi_pixels.std() < 0.06:
        return "uniform_low"

    # Edge detection: outer ring vs inner core.
    h, w = ndvi_pixels.shape
    if h >= 6 and w >= 6:
        ring_w = max(1, min(h, w) // 6)
        outer = np.concatenate(
            [
                ndvi_pixels[:ring_w, :].ravel(),
                ndvi_pixels[-ring_w:, :].ravel(),
                ndvi_pixels[:, :ring_w].ravel(),
                ndvi_pixels[:, -ring_w:].ravel(),
            ]
        )
        inner = ndvi_pixels[ring_w:-ring_w, ring_w:-ring_w]
        if inner.size > 0 and (inner.mean() - outer.mean()) > 0.08:
            return "edge"

    # Row vs col coherence — a stressed irrigation row is a horizontal band.
    row_means = ndvi_pixels.mean(axis=1)
    col_means = ndvi_pixels.mean(axis=0)
    if row_means.std() > 1.5 * col_means.std() and row_means.min() < threshold:
        return "row_aligned"

    return "patchy"


def _neighbour_zones(
    row: int,
    col: int,
    rows: int,
    cols: int,
    by_id: dict[str, ZoneNDVI],
) -> list[ZoneNDVI]:
    """Return the 4-connected neighbours of (row, col) that exist on the grid."""
    out: list[ZoneNDVI] = []
    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nr, nc = row + dr, col + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            zid = f"{chr(ord('A') + nr)}{nc + 1}"
            if zid in by_id:
                out.append(by_id[zid])
    return out


def _anomaly_score(zone: ZoneNDVI, neighbour_mean: float) -> float:
    """Blend drop magnitude + neighbour gap + spatial pattern into [0, 1]."""
    drop_term = min(1.0, max(0.0, zone.ndvi_drop) / DROP_FOR_FULL_SCORE)
    gap_term = max(0.0, neighbour_mean - zone.ndvi_mean) / 0.20
    gap_term = min(1.0, gap_term)
    pattern_bonus = PATTERN_BONUSES.get(zone.pattern, 0.0)

    score = (1.0 - NEIGHBOUR_GAP_WEIGHT) * drop_term + NEIGHBOUR_GAP_WEIGHT * gap_term
    score = score + pattern_bonus
    return float(np.clip(score, 0.0, 1.0))
