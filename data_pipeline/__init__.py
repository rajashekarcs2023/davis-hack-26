"""AgriScout satellite-to-alert data pipeline.

Five-stage ETL that converts a Sentinel-2 (or compatible RGB+NIR) satellite
tile into per-zone alerts compatible with the backend's `Zone` schema:

    1. ingest   — load a Sentinel-2 L2A scene (B04 red + B08 NIR) OR an
                  RGB+NIR PNG/JPG. rasterio if available, PIL+numpy fallback.
    2. chip     — split the scene into a rows×cols zone grid (default 4×4
                  to match `backend/app/data/field_grid.json`).
    3. ndvi     — compute per-zone NDVI = (NIR-RED)/(NIR+RED), derive
                  ndvi_drop vs baseline, detect spatial pattern, score
                  the anomaly. Mirrors the rule-based classifier in
                  `backend/app/domain/anomaly_engine.py`.
    4. classify — for zones above the anomaly threshold, send the RGB
                  chip to Gemma 4 (gemma4:e4b) via Ollama and ask for a
                  pest / water / nutrient hypothesis with confidence.
    5. alerts   — emit a JSON document in the exact `FieldGrid` schema
                  the backend already consumes. Drop-in replacement for
                  the synthetic `field_grid.json`.

The output JSON is *exactly* the wire format `backend/app/schemas.py::Zone`
expects, so wiring this into the backend later is a one-line change: point
`backend.app.domain.anomaly_engine.load_field_grid` at the pipeline's
output file instead of the hardcoded synthetic one.
"""

from data_pipeline.alerts import build_field_grid_json
from data_pipeline.chip import chip_scene
from data_pipeline.classify_gemma import classify_anomaly_zone
from data_pipeline.ingest import SatelliteScene, load_scene
from data_pipeline.ndvi import compute_zone_ndvi, score_zone_anomaly

__all__ = [
    "SatelliteScene",
    "build_field_grid_json",
    "chip_scene",
    "classify_anomaly_zone",
    "compute_zone_ndvi",
    "load_scene",
    "score_zone_anomaly",
]
