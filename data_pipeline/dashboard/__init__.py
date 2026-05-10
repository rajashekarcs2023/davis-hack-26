"""Static HTML dashboard for AgriScout pipeline outputs.

Renders the `FieldGrid`-shaped JSON emitted by the pipeline as a
self-contained HTML page (Tailwind CDN, vanilla JS, no build step).
Open the resulting file in any browser — no server, no install.

The dashboard shows:
    - The source Sentinel-2 scene metadata (mission, MGRS tile, date, orbit)
    - A 4x4 colour-coded zone grid (emerald → red by anomaly score)
    - An alerts panel for any zone above the VLM threshold
    - A zone-by-zone NDVI / pattern / score table
    - The pipeline metadata footer (model, threshold, generated_at)

Usage:
    python -m data_pipeline.dashboard.render \\
        --json data_pipeline/outputs/latest.json \\
        --out data_pipeline/outputs/latest.html

Or let `pipeline.py --dashboard PATH` invoke this for you in one shot.
"""
