"""Stage 2 — split a scene into a rows×cols grid of zone chips.

We split the full scene into evenly-spaced rectangles and label each one
A1..D4 (row letter + column number, matching the backend's `field_grid.json`
convention). Each chip carries its row/col indices, its band slices, and the
geographic centre derived from the scene's centre + grid offsets.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from data_pipeline.ingest import SatelliteScene

# Backend convention: rows are letters A..D (top→bottom), cols are 1..4
# (left→right). 4×4 default matches `backend/app/data/field_grid.json`.
DEFAULT_ROWS = 4
DEFAULT_COLS = 4

# How many metres a Sentinel-2 10m pixel covers. Used so we can derive a
# rough lat/lon offset for each zone centre when geo-referencing is sparse.
S2_PIXEL_METRES = 10.0

# 1 degree of latitude ≈ this many metres (good to <0.5% anywhere on Earth).
METRES_PER_DEG_LAT = 111_320.0


@dataclass(frozen=True)
class ZoneChip:
    """One rectangular tile of the scene.

    Attributes:
        zone_id: e.g. "B3" — row letter + 1-indexed column.
        row, col: 0-indexed grid position.
        red/green/blue/nir: the band slices for this chip.
        lat, lon: geographic centre of the chip (derived from the scene
            centre + a pixel-spacing approximation).
    """

    zone_id: str
    row: int
    col: int
    red: np.ndarray
    green: np.ndarray
    blue: np.ndarray
    nir: np.ndarray
    lat: float
    lon: float

    def rgb_chip(self) -> np.ndarray:
        """Per-zone uint8 RGB array, used as the VLM input."""
        rgb = np.stack([self.red, self.green, self.blue], axis=-1)
        rgb = np.clip(rgb, 0.0, 1.0)
        for c in range(3):
            lo, hi = np.percentile(rgb[..., c], [2, 98])
            if hi > lo:
                rgb[..., c] = np.clip((rgb[..., c] - lo) / (hi - lo), 0.0, 1.0)
        return (rgb * 255.0).astype(np.uint8)


def chip_scene(
    scene: SatelliteScene,
    *,
    rows: int = DEFAULT_ROWS,
    cols: int = DEFAULT_COLS,
) -> list[ZoneChip]:
    """Split a `SatelliteScene` into `rows*cols` `ZoneChip` tiles.

    Args:
        scene: a loaded scene from `data_pipeline.ingest.load_scene`.
        rows, cols: grid shape — default 4×4 to match the backend.

    Returns:
        A list of chips in row-major order (A1, A2, ..., D4 for the default
        grid).
    """
    if rows < 1 or cols < 1:
        raise ValueError(f"rows and cols must be >= 1 (got {rows}, {cols})")
    if rows > 26:
        raise ValueError("rows > 26 isn't supported by the A..Z label scheme")

    h, w = scene.shape
    chip_h = h // rows
    chip_w = w // cols
    if chip_h == 0 or chip_w == 0:
        raise ValueError(
            f"scene too small ({h}x{w}) to split into a {rows}x{cols} grid"
        )

    cells: list[ZoneChip] = []
    for r in range(rows):
        for c in range(cols):
            y0 = r * chip_h
            y1 = (r + 1) * chip_h if r < rows - 1 else h
            x0 = c * chip_w
            x1 = (c + 1) * chip_w if c < cols - 1 else w
            lat, lon = _zone_centre(scene, r, c, rows, cols, chip_h, chip_w)
            cells.append(
                ZoneChip(
                    zone_id=f"{chr(ord('A') + r)}{c + 1}",
                    row=r,
                    col=c,
                    red=scene.red[y0:y1, x0:x1],
                    green=scene.green[y0:y1, x0:x1],
                    blue=scene.blue[y0:y1, x0:x1],
                    nir=scene.nir[y0:y1, x0:x1],
                    lat=lat,
                    lon=lon,
                )
            )
    return cells


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _zone_centre(
    scene: SatelliteScene,
    row: int,
    col: int,
    rows: int,
    cols: int,
    chip_h: int,
    chip_w: int,
) -> tuple[float, float]:
    """Approximate the geographic centre of a zone.

    We don't try to do full CRS-aware reprojection — for the agronomy
    use-case we just need a stable lat/lon per zone so the backend can
    plot it on a map. If the scene came in without geo-referencing we
    fall back to the synthetic UCD-tomato centre that the existing
    `field_grid.json` uses.
    """
    center_lat = scene.center_lat if scene.center_lat is not None else 38.5382
    center_lon = scene.center_lon if scene.center_lon is not None else -121.7617

    # Offset in metres from the scene centre to this zone's centre.
    row_offset_m = (row - (rows - 1) / 2) * chip_h * S2_PIXEL_METRES
    col_offset_m = (col - (cols - 1) / 2) * chip_w * S2_PIXEL_METRES

    # Convert metres → degrees. Latitude is uniform; longitude shrinks by
    # cos(lat) toward the poles.
    dlat = -row_offset_m / METRES_PER_DEG_LAT  # row 0 is north, so subtract
    metres_per_deg_lon = METRES_PER_DEG_LAT * float(np.cos(np.deg2rad(center_lat)))
    dlon = col_offset_m / metres_per_deg_lon

    return center_lat + dlat, center_lon + dlon
