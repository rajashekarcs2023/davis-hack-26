# AgriScout Satellite-to-Alert Data Pipeline

Five-stage ETL that converts a **Sentinel-2** satellite scene into
**per-zone NDVI anomaly alerts**, with each anomaly enriched by a
**Gemma 4 multimodal VLM** (`gemma4:e4b`) running locally via Ollama.

The output is a JSON document in the **exact `FieldGrid` schema** the
AgriScout backend already consumes — so wiring it into the live agent
later is a one-line change in `backend.app.domain.anomaly_engine.load_field_grid`.

```
   ┌─────────────────────┐
   │ Sentinel-2 L2A scene│  (4 bands: B02 / B03 / B04 / B08)
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ 1. ingest.py        │  rasterio (or PIL fallback) → uniform R/G/B/NIR
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ 2. chip.py          │  4×4 zone grid, A1..D4 labels, lat/lon per cell
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ 3. ndvi.py          │  pixel NDVI → zone mean → drop vs baseline →
   │                     │  spatial pattern (row_aligned / patchy / edge /
   │                     │  uniform_low) → anomaly_score in [0, 1]
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ 4. classify_gemma.py│  Anomaly chips → Gemma 4 e4b via Ollama
   │                     │  Returns: likely_cause / confidence /
   │                     │  visual_evidence / alert_priority
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ 5. alerts.py        │  FieldGrid JSON in backend Zone[] schema +
   │                     │  per-zone vlm_classification enrichment
   └─────────────────────┘
```

## Quickstart — synthetic demo (no external data required)

```bash
# 1. install pipeline deps (numpy / Pillow / httpx — same versions the
#    backend already uses, so a single venv satisfies both)
pip install -r data_pipeline/requirements.txt

# 2. generate the synthetic Sentinel-2-like scene (deterministic, ~1 MB)
python -m data_pipeline.samples.synthetic_field

# 3. run the pipeline end-to-end with --no-vlm (no Ollama needed)
python -m data_pipeline.pipeline \
    --input data_pipeline/samples/synthetic_scene.npy \
    --output data_pipeline/outputs/latest.json \
    --no-vlm

# 4. inspect the output — should flag B3 as the highest-score anomaly
jq '.zones[] | select(.anomaly_score >= 0.4)' data_pipeline/outputs/latest.json
```

## Quickstart — with Gemma 4 VLM classification

```bash
# 1. pull the Gemma 4 model (~9.6 GB) into your local Ollama
ollama pull gemma4:e4b

# 2. start Ollama if it isn't already running
ollama serve &

# 3. run the pipeline WITHOUT --no-vlm
python -m data_pipeline.pipeline \
    --input data_pipeline/samples/synthetic_scene.npy \
    --output data_pipeline/outputs/latest.json
```

Each zone whose `anomaly_score >= 0.40` gets a `vlm_classification`
block with a pest / water / nutrient hypothesis, a confidence score,
a one-sentence visual evidence summary, and an alert priority.

## Real Sentinel-2 input

See `data_pipeline/samples/README.md` for how to download a free
Sentinel-2 L2A scene from the Copernicus Open Access Hub. Once you have
an unpacked `.SAFE` directory and `pip install rasterio`, point
`--input` at the directory and the ingester finds the four bands
automatically.

## Output schema

The output JSON is a drop-in replacement for `backend/app/data/field_grid.json`
plus optional per-zone VLM enrichment:

```jsonc
{
  "field_id":   "ucd_north_tomato",
  "name":       "UCD North Tomato Field (live satellite ingest)",
  "center_lat": 38.5382,
  "center_lon": -121.7617,
  "rows":       4,
  "cols":       4,
  "zones": [
    {
      "zone_id":           "B3",
      "lat":               38.5394,
      "lon":               -121.7616,
      "ndvi":              0.42,
      "ndvi_baseline":     0.65,
      "ndvi_drop":         0.23,
      "pattern":           "row_aligned",
      "neighbor_avg_ndvi": 0.61,
      "anomaly_score":     0.86,
      "vlm_classification": {
        "likely_cause":             "water_stress_suspected",
        "confidence":               0.78,
        "visual_evidence":          "row-aligned dry stripe consistent with a failed irrigation line",
        "alert_priority":           "high",
        "recommend_drone_followup": true,
        "source_model":             "gemma4:e4b"
      }
    },
    // ... 15 more zones
  ],
  "_pipeline_metadata": {
    "source":                    "sentinel-2 L2A @ S2A_MSIL2A_20240715T185911_T10TFK.SAFE",
    "generated_at":              "2025-11-10T18:47:21.412Z",
    "vlm_model":                 "gemma4:e4b",
    "threshold":                 0.4,
    "zones_above_threshold":     2,
    "vlm_classifications_count": 2
  }
}
```

## CLI reference

```text
python -m data_pipeline.pipeline --help

  --input               Sentinel-2 SAFE dir / 4-band PNG/JPG / .npy file [required]
  --output              Path to write the FieldGrid JSON               [required]
  --rows / --cols       Grid shape                                      [default 4×4]
  --baseline            Healthy-canopy NDVI baseline                    [default 0.65]
  --threshold           Anomaly score above which Gemma is consulted    [default 0.40]
  --ollama-url          Ollama base URL                                 [default http://localhost:11434]
  --ollama-model        Ollama model id                                 [default gemma4:e4b]
  --no-vlm              Skip the VLM step (anomaly scoring only)
  --center-lat / --center-lon
                        Override scene centre (when input lacks geo-ref)
  -v / --verbose        Debug-level logging
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Pipeline ran cleanly, output file written |
| 1 | Input file / directory not found |
| 2 | Unsupported input format |
| 3 | Runtime error during processing |

## Tests

```bash
python -m pytest data_pipeline/tests -v
```

Tests run end-to-end with `--no-vlm`, so they don't require a live
Ollama. They generate the synthetic scene fresh per run and assert:

- A1 (pure healthy background) → NDVI in [0.55, 0.75], pattern `normal`.
- B3 (painted row-aligned dry stripe) → NDVI drop ≥ 0.10, pattern in
  {row_aligned, patchy, uniform_low}.
- Output JSON has 16 zones with the right shape.
- B3 has the highest `anomaly_score` of any zone.

## Wiring into the backend (later)

The output JSON is *exactly* the wire format `backend/app/schemas.py::Zone`
expects. To make the live agent run on real satellite alerts, swap the
loader:

```python
# backend/app/domain/anomaly_engine.py
def load_field_grid() -> FieldGrid:
    return FieldGrid.model_validate_json(
        Path("data_pipeline/outputs/latest.json").read_text()
    )
```

The `vlm_classification` block on each zone is *additive* — the
backend's existing classifier still runs over the NDVI + pattern
columns, and the agent can optionally read the VLM hypothesis as a
prior (the framing is already there: `AnomalyLabel` includes
`PEST_HOTSPOT_SUSPECTED`, `WATER_STRESS_SUSPECTED`,
`NUTRIENT_DEFICIT_SUSPECTED` — same labels the Gemma classifier emits).

For continuous updates, run the pipeline on a cron (one Sentinel-2 pass
every 5 days over most of the world) and the agent picks up the latest
JSON on its next poll.

## Why these specific design choices

| Choice | Why |
|---|---|
| Sentinel-2 over PlanetScope / Landsat | Free, global, 10 m resolution at the red + NIR bands we need for NDVI. |
| 4-band scenes only | Red + NIR is sufficient for NDVI; Blue + Green for VLM RGB chip. No SWIR / red-edge complexity for the v0. |
| `(NIR - RED) / (NIR + RED)` with epsilon | Industry-standard NDVI formula. Epsilon stops shadow / cloud pixels from blowing up. |
| Rule-based pattern detector | Cheap, deterministic, explains itself. The VLM does the harder cause-classification job; we don't need an ML model for "is this a horizontal stripe?". |
| Gemma 4 e4b for cause classification | Matches the backend's on-prem VLM, so the pipeline's classifications and the agent's diagnostics share a model. Rural ag co-ops without cloud get full functionality. |
| Anomaly threshold gating the VLM call | A 16-zone field has on average 1–3 anomalies. Running a 9.6 GB model on every chip wastes 80 % of the budget. |
| FieldGrid-shaped output | Drop-in replaces the synthetic `field_grid.json` the backend already consumes — zero schema migration when we go live. |
