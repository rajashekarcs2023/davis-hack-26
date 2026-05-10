# Pipeline Dashboard

Single-page static HTML dashboard for AgriScout pipeline outputs. No
framework, no build step, no server — just open the file in any browser.

## What you get

```
┌────────────────────────────────────────────────────────────────┐
│  AgriScout · Satellite Inference Dashboard                      │
│  🛰  Sentinel-2 L2A · MGRS Tile T10SFG · Acquired 2024-07-15   │
│  Source: Copernicus Data Space Ecosystem                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   4×4 zone heatmap (color-coded     │  ⚠ Active alerts          │
│   by anomaly_score)                  │     B3 · HIGH             │
│   ┌──┬──┬──┬──┐                     │     💧 water_stress      │
│   │A1│A2│A3│A4│                     │     conf 0.78            │
│   ├──┼──┼──┼──┤                     │     "row-aligned dry      │
│   │B1│B2│B3│B4│                     │      stripe…"             │
│   ├──┼──┼──┼──┤                     │                           │
│   │C1│C2│C3│C4│                     │                           │
│   ├──┼──┼──┼──┤                     │                           │
│   │D1│D2│D3│D4│                     │                           │
│   └──┴──┴──┴──┘                     │                           │
│                                                                 │
├────────────────────────────────────────────────────────────────┤
│  Per-Zone NDVI Detail                                           │
│  Zone │ NDVI │ Drop │ Pattern    │ Score │ VLM hypothesis      │
│  B3   │ 0.39 │+0.26 │ row-aligned│ 1.00  │ 💧 Water stress     │
│  C2   │ 0.62 │+0.03 │ patchy     │ 0.21  │ —                   │
│  …    │      │      │            │       │                     │
└────────────────────────────────────────────────────────────────┘
```

## Quickstart

```bash
# 1. Run the pipeline (any of the documented inputs works)
python -m data_pipeline.pipeline \
    --input data_pipeline/samples/synthetic_scene.npy \
    --output data_pipeline/outputs/latest.json \
    --dashboard data_pipeline/outputs/latest.html \
    --no-vlm    # optional — skips Gemma calls

# 2. Open in browser
open data_pipeline/outputs/latest.html        # macOS
xdg-open data_pipeline/outputs/latest.html    # Linux
```

If you already have a JSON output and just want the dashboard:

```bash
python -m data_pipeline.dashboard.render \
    --json data_pipeline/outputs/latest.json \
    --out  data_pipeline/outputs/latest.html
```

## Tech stack

- **HTML** — single template at `template.html`
- **Tailwind CSS** — via CDN, no build
- **Vanilla JS** — ~150 lines that read the inlined JSON and render the
  four panels (header, field map, alerts, NDVI table)
- **Fonts** — Inter (UI) + JetBrains Mono (data) from Google Fonts

Total dashboard size: **~25 KB HTML** (excluding CDN scripts). Opens
offline once the CDN assets are cached. No backend required.

## How the data flows in

`render.py` reads the `FieldGrid`-shaped JSON the pipeline emits and
inlines it into a `<script type="application/json">` block inside the
template. The bottom of `template.html` contains a small vanilla-JS
renderer that:

1. Reads the inlined JSON
2. Populates the header (source, generated_at, vlm_model, threshold)
3. Builds the 4×4 grid, colour-coded by `anomaly_score`
4. Filters zones above `_pipeline_metadata.threshold` → alert cards
5. Renders the per-zone table sorted by score, descending

No external requests are made after page load — the dashboard is fully
self-contained.

## Customisation

To restyle: edit `template.html`. The colour buckets for
`anomaly_score` live in the `scoreClass()` JS function at the bottom
of the template:

```js
if (score < 0.20) return '... emerald ...';   // healthy
if (score < 0.40) return '... lime ...';      // mild
if (score < 0.60) return '... amber ...';     // watch
if (score < 0.80) return '... orange ...';    // alert
                  return '... red ...';        // critical
```

To change which fields appear: edit the `renderHeader`, `renderFieldGrid`,
`renderAlerts`, and `renderTable` functions. They each read from the
single `DATA` constant (parsed once at boot).
