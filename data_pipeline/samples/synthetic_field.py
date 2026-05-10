"""Generate a synthetic Sentinel-2-like 4-band scene for demo / CI.

We don't want to ship a real Sentinel-2 tile (a single scene is hundreds
of MB), but we do want the pipeline to be runnable with a single command.
This script paints a deterministic 256×256 4-band numpy array with:

  - a healthy tomato-canopy background (high NDVI ≈ 0.66)
  - one clear row-aligned stress band in zone B3 (NDVI ≈ 0.40) — the
    same zone the existing synthetic `field_grid.json` uses as the
    canonical anomaly, so the pipeline's output should match closely.
  - a milder patchy zone in C2 (NDVI ≈ 0.55)
  - a tiny amount of per-pixel noise so the spatial-pattern detector
    sees a realistic-looking signal instead of perfect rectangles.

Output: a single `.npy` file at `data_pipeline/samples/synthetic_scene.npy`
with shape (256, 256, 4) float32 in [0, 1] — channels [R, G, B, NIR].

The file is gitignored (we don't want to commit numpy blobs); re-run this
generator any time you need it. Deterministic seed → identical output.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

# Scene-wide parameters. 256x256 is plenty for a 4x4 grid and keeps the
# generated file tiny (~1 MB float32).
SIZE = 256
SEED = 20251110  # any constant gives a deterministic scene

# Healthy canopy reflectance (Sentinel-2 surface reflectance, 0..1). These
# are realistic ballpark numbers — tomato canopy at peak in late summer.
HEALTHY = {
    "red": 0.085,
    "green": 0.12,
    "blue": 0.07,
    "nir": 0.42,  # → NDVI ≈ (0.42 - 0.085) / (0.42 + 0.085) ≈ 0.66
}

# Stressed canopy — chlorophyll drops, soil reflectance bleeds through.
# NIR drops more than red, NDVI ≈ (0.22 - 0.18) / (0.22 + 0.18) ≈ 0.10
# but blended with the healthy background so the chip-mean lands ≈ 0.4.
STRESSED = {
    "red": 0.18,
    "green": 0.17,
    "blue": 0.13,
    "nir": 0.22,
}


def generate_scene(out_path: Path = Path(__file__).parent / "synthetic_scene.npy") -> Path:
    """Synthesise a scene and write it to disk. Returns the path written."""
    rng = np.random.default_rng(SEED)

    # Base layer: healthy canopy + low-amplitude noise so the per-pixel NDVI
    # is realistic rather than perfectly uniform.
    def _base(value: float) -> np.ndarray:
        return value + rng.normal(0.0, 0.012, size=(SIZE, SIZE)).astype(np.float32)

    red = _base(HEALTHY["red"])
    green = _base(HEALTHY["green"])
    blue = _base(HEALTHY["blue"])
    nir = _base(HEALTHY["nir"])

    # 4x4 grid → each cell is 64x64. Zone B3 = row 1, col 2 → rows 64..128,
    # cols 128..192.
    cell = SIZE // 4

    # --- B3: a row-aligned dry stripe (~third of the cell, horizontal band)
    by0, by1 = 1 * cell, 2 * cell
    bx0, bx1 = 2 * cell, 3 * cell
    stripe_y0 = by0 + cell // 3
    stripe_y1 = by0 + 2 * cell // 3
    _blend(red, stripe_y0, stripe_y1, bx0, bx1, STRESSED["red"], strength=0.85)
    _blend(green, stripe_y0, stripe_y1, bx0, bx1, STRESSED["green"], strength=0.85)
    _blend(blue, stripe_y0, stripe_y1, bx0, bx1, STRESSED["blue"], strength=0.85)
    _blend(nir, stripe_y0, stripe_y1, bx0, bx1, STRESSED["nir"], strength=0.85)
    # Mild stress across the rest of the cell so the cell-mean NDVI lands ≈ 0.42.
    _blend(red, by0, by1, bx0, bx1, STRESSED["red"], strength=0.35)
    _blend(green, by0, by1, bx0, bx1, STRESSED["green"], strength=0.35)
    _blend(blue, by0, by1, bx0, bx1, STRESSED["blue"], strength=0.35)
    _blend(nir, by0, by1, bx0, bx1, STRESSED["nir"], strength=0.35)

    # --- C2: patchy mild stress — scatter a handful of stressed patches
    cy0, cy1 = 2 * cell, 3 * cell
    cx0, cx1 = 1 * cell, 2 * cell
    for _ in range(8):
        py = rng.integers(cy0, cy1 - 8)
        px = rng.integers(cx0, cx1 - 8)
        ph = rng.integers(6, 12)
        pw = rng.integers(6, 12)
        _blend(red, py, py + ph, px, px + pw, STRESSED["red"], strength=0.6)
        _blend(green, py, py + ph, px, px + pw, STRESSED["green"], strength=0.6)
        _blend(blue, py, py + ph, px, px + pw, STRESSED["blue"], strength=0.6)
        _blend(nir, py, py + ph, px, px + pw, STRESSED["nir"], strength=0.6)

    arr = np.stack([red, green, blue, nir], axis=-1)
    arr = np.clip(arr, 0.0, 1.0).astype(np.float32)
    np.save(out_path, arr)
    return out_path


def _blend(
    band: np.ndarray,
    y0: int,
    y1: int,
    x0: int,
    x1: int,
    target_value: float,
    strength: float,
) -> None:
    """In-place blend `band[y0:y1, x0:x1]` toward `target_value`.

    `strength` in [0, 1]: 0 keeps the pixels untouched, 1 fully replaces them.
    A small amount of edge softness would be nicer but our spatial-pattern
    detector cares about means more than gradients, so a hard rectangle is
    fine for the synthetic.
    """
    block = band[y0:y1, x0:x1]
    band[y0:y1, x0:x1] = block * (1.0 - strength) + target_value * strength


if __name__ == "__main__":  # pragma: no cover
    out = generate_scene()
    print(f"wrote {out} ({out.stat().st_size / 1024:.1f} KB)")
