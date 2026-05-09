"""Tests for the rule-based anomaly classifier and zone scoring."""

from __future__ import annotations

from app.domain.anomaly_engine import (
    annotate_grid,
    classify_zone,
    compute_anomaly_score,
    load_field_grid,
    rank_anomalies,
)
from app.schemas import AnomalyLabel, AnomalyPattern, Zone


def _zone(**kw) -> Zone:
    base = dict(
        zone_id="X1",
        lat=38.5,
        lon=-121.7,
        ndvi=0.6,
        ndvi_baseline=0.65,
        ndvi_drop=0.05,
        pattern=AnomalyPattern.NORMAL,
        neighbor_avg_ndvi=0.6,
        anomaly_score=0.1,
    )
    base.update(kw)
    return Zone(**base)


def test_load_field_grid_has_b3_anomaly():
    grid = annotate_grid(load_field_grid())
    by_id = {z.zone_id: z for z in grid.zones}
    assert "B3" in by_id
    assert by_id["B3"].pattern == AnomalyPattern.ROW_ALIGNED
    assert by_id["B3"].anomaly_score >= 0.5


def test_rank_anomalies_top_is_b3():
    grid = annotate_grid(load_field_grid())
    top = rank_anomalies(grid, top_k=3)
    assert top[0].zone_id == "B3"


def test_compute_anomaly_score_zero_for_healthy_uniform_field():
    z = _zone(ndvi=0.65, ndvi_drop=0.0, neighbor_avg_ndvi=0.65)
    nbrs = [_zone(zone_id=f"N{i}", ndvi=0.65) for i in range(4)]
    assert compute_anomaly_score(z, nbrs) < 0.1


def test_compute_anomaly_score_high_for_row_aligned_drop():
    z = _zone(
        ndvi=0.42,
        ndvi_drop=0.22,
        pattern=AnomalyPattern.ROW_ALIGNED,
        neighbor_avg_ndvi=0.61,
    )
    nbrs = [_zone(zone_id=f"N{i}", ndvi=0.61) for i in range(4)]
    assert compute_anomaly_score(z, nbrs) > 0.5


def test_classify_zone_normal_for_low_score():
    z = _zone(anomaly_score=0.05)
    cls = classify_zone(z)
    assert cls.label == AnomalyLabel.NORMAL


def test_classify_zone_irrigation_for_row_aligned_high():
    z = _zone(
        anomaly_score=0.84,
        pattern=AnomalyPattern.ROW_ALIGNED,
    )
    cls = classify_zone(z)
    assert cls.label == AnomalyLabel.NEEDS_IRRIGATION_INSPECTION


def test_classify_zone_false_alarm_for_uniform_low():
    z = _zone(anomaly_score=0.3, pattern=AnomalyPattern.UNIFORM_LOW)
    cls = classify_zone(z)
    assert cls.label == AnomalyLabel.FALSE_ALARM_CLOUD_NOISE
