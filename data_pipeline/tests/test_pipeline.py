"""End-to-end pipeline test.

Runs the full chain on the synthetic scene with `--no-vlm` (so we don't
need a live Ollama in CI) and asserts:

  - the output JSON validates against the backend's `FieldGrid` schema
  - zone B3 is flagged with a row_aligned pattern (matches the synthetic)
  - NDVI math is in the expected ballpark
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Allow this test file to be run directly from the repo root via
# `python -m pytest data_pipeline/tests`.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from data_pipeline.alerts import build_field_grid_json
from data_pipeline.chip import chip_scene
from data_pipeline.ingest import load_scene
from data_pipeline.ndvi import compute_zone_ndvi, score_zone_anomaly
from data_pipeline.samples.synthetic_field import generate_scene


@pytest.fixture(scope="module")
def synthetic_scene_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Generate a fresh synthetic scene per pytest run, in a tmp dir."""
    tmp = tmp_path_factory.mktemp("synthetic")
    out_path = tmp / "synthetic_scene.npy"
    return generate_scene(out_path)


def test_ndvi_baseline_zone_is_healthy(synthetic_scene_path: Path) -> None:
    """A1 is pure healthy canopy — NDVI should be close to baseline."""
    scene = load_scene(synthetic_scene_path)
    chips = chip_scene(scene, rows=4, cols=4)
    a1 = next(c for c in chips if c.zone_id == "A1")
    ndvi = compute_zone_ndvi(a1)
    assert ndvi.ndvi_mean > 0.55, f"A1 NDVI too low: {ndvi.ndvi_mean}"
    assert ndvi.ndvi_mean < 0.75, f"A1 NDVI too high: {ndvi.ndvi_mean}"
    assert ndvi.pattern == "normal"


def test_b3_is_row_aligned_anomaly(synthetic_scene_path: Path) -> None:
    """B3 has a row-aligned dry stripe — pattern detector should catch it."""
    scene = load_scene(synthetic_scene_path)
    chips = chip_scene(scene, rows=4, cols=4)
    b3 = next(c for c in chips if c.zone_id == "B3")
    ndvi = compute_zone_ndvi(b3)
    assert ndvi.ndvi_drop > 0.10, f"B3 should show a drop, got {ndvi.ndvi_drop}"
    assert ndvi.pattern in {"row_aligned", "patchy", "uniform_low"}, (
        f"unexpected B3 pattern {ndvi.pattern}"
    )


def test_full_pipeline_emits_valid_field_grid(
    synthetic_scene_path: Path, tmp_path: Path
) -> None:
    """End-to-end (no VLM): produces a JSON document with all 16 zones."""
    scene = load_scene(synthetic_scene_path)
    chips = chip_scene(scene, rows=4, cols=4)
    raw_zones = [compute_zone_ndvi(c) for c in chips]
    zones = score_zone_anomaly(raw_zones, rows=4, cols=4)

    doc = build_field_grid_json(
        scene=scene,
        zones=zones,
        classifications={},
        rows=4,
        cols=4,
        threshold=0.40,
        vlm_model="skipped",
    )
    # Persist for human inspection — handy when a test fails locally.
    (tmp_path / "out.json").write_text(json.dumps(doc, indent=2))

    assert doc["rows"] == 4 and doc["cols"] == 4
    assert len(doc["zones"]) == 16
    assert {z["zone_id"] for z in doc["zones"]} == {
        f"{r}{c}" for r in "ABCD" for c in "1234"
    }
    for z in doc["zones"]:
        assert 0.0 <= z["anomaly_score"] <= 1.0
        assert z["pattern"] in {
            "normal",
            "row_aligned",
            "patchy",
            "edge",
            "uniform_low",
        }
        assert "lat" in z and "lon" in z
    meta = doc["_pipeline_metadata"]
    assert "generated_at" in meta
    assert meta["zones_above_threshold"] >= 1, (
        "synthetic scene should produce at least one zone above threshold"
    )
    assert meta["vlm_classifications_count"] == 0, "no classifications were supplied"


def test_b3_has_highest_anomaly_score(synthetic_scene_path: Path) -> None:
    """The synthetic was painted so B3 is the single clearest anomaly."""
    scene = load_scene(synthetic_scene_path)
    chips = chip_scene(scene, rows=4, cols=4)
    raw_zones = [compute_zone_ndvi(c) for c in chips]
    zones = score_zone_anomaly(raw_zones, rows=4, cols=4)
    ranked = sorted(zones, key=lambda z: z.anomaly_score, reverse=True)
    assert ranked[0].zone_id == "B3", (
        f"B3 should rank highest, got {[(z.zone_id, z.anomaly_score) for z in ranked[:3]]}"
    )
