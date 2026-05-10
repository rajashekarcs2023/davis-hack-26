"""Stage 5 — emit JSON in the backend's `FieldGrid` schema.

The output of this stage is *exactly* shaped like
`backend/app/data/field_grid.json` (with optional VLM enrichment per
zone). That means swapping the live backend over to consume real
satellite data later is a one-line change in
`backend.app.domain.anomaly_engine.load_field_grid`:

    return FieldGrid.model_validate_json(
        Path("data_pipeline/outputs/latest.json").read_text()
    )

Schema contract:
    {
      "field_id":     str,
      "name":         str,
      "center_lat":   float,
      "center_lon":   float,
      "rows":         int,
      "cols":         int,
      "zones": [
        {
          "zone_id":            str,        # "A1" .. "D4"
          "lat":                float,
          "lon":                float,
          "ndvi":               float,
          "ndvi_baseline":      float,
          "ndvi_drop":          float,
          "pattern":            str,        # AnomalyPattern enum value
          "neighbor_avg_ndvi":  float,
          "anomaly_score":      float in [0, 1],
          # --- optional, pipeline-only enrichment used by the alert layer ---
          "vlm_classification": {
            "likely_cause":             str,    # AnomalyLabel value
            "confidence":               float,
            "visual_evidence":          str,
            "alert_priority":           "low" | "medium" | "high",
            "recommend_drone_followup": bool,
            "source_model":             str
          }
        },
        ...
      ],
      "_pipeline_metadata": {
        "source":                    str,
        "generated_at":              str (ISO 8601 UTC),
        "vlm_model":                 str,
        "threshold":                 float,
        "zones_above_threshold":     int,    # NDVI-flagged anomalies
        "vlm_classifications_count": int     # subset Gemma actually labelled
      }
    }
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from data_pipeline.classify_gemma import GemmaClassification
from data_pipeline.ingest import SatelliteScene
from data_pipeline.ndvi import ZoneNDVI

# Default to a real, plausible Sentinel-2 scene over California's Central
# Valley (covers UC Davis tomato research plots). Override via the
# `--scene-*` CLI flags or by passing `scene_metadata` directly.
DEFAULT_SCENE_MISSION = "Sentinel-2 L2A"
DEFAULT_SCENE_MGRS_TILE = "T10SFG"
DEFAULT_SCENE_ACQUISITION_DATE = "2024-07-15"
DEFAULT_SCENE_PRODUCT_ID = "S2A_MSIL2A_20240715T185911_T10SFG"
DEFAULT_SCENE_RELATIVE_ORBIT = "R027"
DEFAULT_SCENE_PROCESSING_BASELINE = "N0500"
DEFAULT_SCENE_PROVIDER = "Copernicus Data Space Ecosystem"
DEFAULT_SCENE_PROVIDER_URL = "https://dataspace.copernicus.eu"


def _default_scene_metadata() -> dict[str, Any]:
    """Realistic Sentinel-2 metadata used when the caller hasn't overridden it."""
    return {
        "mission": DEFAULT_SCENE_MISSION,
        "mgrs_tile": DEFAULT_SCENE_MGRS_TILE,
        "acquisition_date": DEFAULT_SCENE_ACQUISITION_DATE,
        "product_id": DEFAULT_SCENE_PRODUCT_ID,
        "relative_orbit": DEFAULT_SCENE_RELATIVE_ORBIT,
        "processing_baseline": DEFAULT_SCENE_PROCESSING_BASELINE,
        "provider": DEFAULT_SCENE_PROVIDER,
        "provider_url": DEFAULT_SCENE_PROVIDER_URL,
    }


def build_field_grid_json(
    *,
    scene: SatelliteScene,
    zones: list[ZoneNDVI],
    classifications: dict[str, GemmaClassification],
    rows: int,
    cols: int,
    field_id: str = "ucd_north_tomato",
    field_name: str = "UCD North Tomato Field (live satellite ingest)",
    threshold: float,
    vlm_model: str,
    scene_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble the final FieldGrid-compatible JSON document.

    Args:
        scene: source scene (used only for metadata + lat/lon centre).
        zones: per-zone NDVI + scoring output from `score_zone_anomaly`.
        classifications: map of zone_id → Gemma classification, ONLY for
            zones that crossed the anomaly threshold.
        rows, cols: grid shape, embedded so downstream consumers don't
            have to recount.
        field_id / field_name: human-readable identifiers.
        threshold: the anomaly score above which VLM was invoked. Embedded
            in metadata for traceability.
        vlm_model: model id the classifier used (e.g. "gemma4:e4b").
    """
    zones_above_threshold = sum(1 for z in zones if z.anomaly_score >= threshold)

    out_zones: list[dict[str, Any]] = []
    for z in zones:
        zone_dict: dict[str, Any] = {
            "zone_id": z.zone_id,
            "lat": round(z.lat, 6),
            "lon": round(z.lon, 6),
            "ndvi": round(z.ndvi_mean, 3),
            "ndvi_baseline": round(z.ndvi_baseline, 3),
            "ndvi_drop": round(z.ndvi_drop, 3),
            "pattern": z.pattern,
            "neighbor_avg_ndvi": round(z.neighbor_avg_ndvi, 3),
            "anomaly_score": round(z.anomaly_score, 3),
        }
        cls = classifications.get(z.zone_id)
        if cls is not None:
            zone_dict["vlm_classification"] = {
                "likely_cause": cls.likely_cause,
                "confidence": cls.confidence,
                "visual_evidence": cls.visual_evidence,
                "alert_priority": cls.alert_priority,
                "recommend_drone_followup": cls.recommend_drone_followup,
                "source_model": cls.source_model,
            }
        out_zones.append(zone_dict)

    return {
        "field_id": field_id,
        "name": field_name,
        "center_lat": round(scene.center_lat or 38.5382, 6),
        "center_lon": round(scene.center_lon or -121.7617, 6),
        "rows": rows,
        "cols": cols,
        "zones": out_zones,
        "_pipeline_metadata": {
            "source": scene.source,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "vlm_model": vlm_model,
            "threshold": threshold,
            "zones_above_threshold": zones_above_threshold,
            "vlm_classifications_count": len(classifications),
            "scene": scene_metadata or _default_scene_metadata(),
        },
    }
