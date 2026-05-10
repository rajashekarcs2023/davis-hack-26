# Pipeline sample inputs

## Synthetic scene (zero-setup)

```bash
python -m data_pipeline.samples.synthetic_field
# → writes data_pipeline/samples/synthetic_scene.npy
```

Generates a deterministic 256×256 4-band numpy array with:

- A healthy tomato-canopy background (NDVI ≈ 0.66, matching the backend's
  `field_grid.json` baseline).
- A clear **row-aligned stress band in zone B3** (NDVI ≈ 0.40).
- A milder **patchy anomaly in zone C2** (NDVI ≈ 0.55).

The synthetic file is gitignored — regenerate it on demand. The seed is
hardcoded so the output is bit-identical across machines.

Use it to dry-run the full pipeline without needing real Sentinel-2 access:

```bash
python -m data_pipeline.pipeline \
    --input data_pipeline/samples/synthetic_scene.npy \
    --output data_pipeline/outputs/latest.json
```

## Real Sentinel-2 L2A (free, ~1 GB per scene)

1. Register at the Copernicus Open Access Hub:
   [https://dataspace.copernicus.eu](https://dataspace.copernicus.eu)
2. Search for a Sentinel-2 L2A product over your field (e.g. UC Davis
   tomato research plots: lat 38.5382, lon -121.7617).
3. Download the `.SAFE` product (or just the four 10 m bands — B02, B03,
   B04, B08 — from a tools like `sentinelhub-py`).
4. Install rasterio:
   ```bash
   pip install rasterio
   ```
5. Run the pipeline against the unpacked `.SAFE` directory:
   ```bash
   python -m data_pipeline.pipeline \
       --input /path/to/S2A_MSIL2A_20240715T185911_T10TFK.SAFE \
       --output data_pipeline/outputs/ucd_north_tomato.json
   ```

The ingester finds the four bands by suffix (`B02`, `B03`, `B04`, `B08`)
anywhere under the input directory, so you don't have to know the exact
internal SAFE layout.

## Other supported formats

- **4-band PNG / JPG / TIFF** with channels in `[R, G, B, NIR]` order. The
  ingester normalises uint8 / uint16 inputs to [0, 1] automatically.
- **(H, W, 4) numpy `.npy`** float32 in [0, 1] — the format
  `synthetic_field.py` writes.
