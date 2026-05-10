"""Stage 1 — ingest a satellite scene into a uniform RGB + NIR numpy array.

Supports two input shapes:

1. **Sentinel-2 L2A** (the canonical free / industry-standard source).
   The user downloads a scene from Copernicus Open Hub and points us at
   a directory containing the per-band GeoTIFFs. We load B04 (red) and
   B08 (NIR) at native 10m resolution, plus B02 (blue) and B03 (green)
   so we can build a true-colour RGB chip for the VLM.

   Bands documented at: https://sentinels.copernicus.eu/web/sentinel/
       user-guides/sentinel-2-msi/resolutions/spatial

2. **Generic 4-band image** (PNG/JPG/NPY). Useful for unit tests and
   for demos where a full Sentinel-2 download is overkill. The image is
   expected to have channels in order [R, G, B, NIR]. NPY files may be
   `(H, W, 4)` float32 with values in [0, 1] for the cleanest input.

rasterio is *optional*. If it's installed we use it for proper GeoTIFF
parsing (preserves geo-referencing); if not we fall back to PIL, which
works for the generic 4-band case and for users who have already
exported their Sentinel-2 product to a regular PNG.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger("agriscout.pipeline.ingest")

# Sentinel-2 native band file suffixes inside a SAFE / L2A product. We look
# for these inside whatever directory the user gives us.
S2_RED_SUFFIX = "B04"
S2_GREEN_SUFFIX = "B03"
S2_BLUE_SUFFIX = "B02"
S2_NIR_SUFFIX = "B08"

# Sentinel-2 surface-reflectance scaling: L2A products store reflectance as
# uint16 scaled by 10000. We divide to recover the canonical [0, 1] range
# so the NDVI math downstream doesn't care which input format we loaded.
S2_REFLECTANCE_SCALE = 10000.0


@dataclass(frozen=True)
class SatelliteScene:
    """A loaded satellite scene, normalised to a uniform numpy layout.

    Attributes:
        red:    (H, W) float32 in [0, 1] — surface reflectance, B04 for S2.
        green:  (H, W) float32 in [0, 1] — surface reflectance, B03 for S2.
        blue:   (H, W) float32 in [0, 1] — surface reflectance, B02 for S2.
        nir:    (H, W) float32 in [0, 1] — surface reflectance, B08 for S2.
        source: short description for logging and the output JSON metadata.
        crs:    optional EPSG code (e.g. 'EPSG:32610') if rasterio loaded it.
        center_lat / center_lon: optional geographic centre for the scene;
                may be `None` for inputs that lack geo-referencing.
    """

    red: np.ndarray
    green: np.ndarray
    blue: np.ndarray
    nir: np.ndarray
    source: str
    crs: str | None = None
    center_lat: float | None = None
    center_lon: float | None = None

    @property
    def shape(self) -> tuple[int, int]:
        return self.red.shape  # type: ignore[return-value]

    def rgb_chip(self) -> np.ndarray:
        """Stack R/G/B into a uint8 (H, W, 3) chip suitable for PIL/Gemma."""
        rgb = np.stack([self.red, self.green, self.blue], axis=-1)
        rgb = np.clip(rgb, 0.0, 1.0)
        # Gentle contrast stretch so Sentinel-2 reflectance (which is usually
        # quite dark in raw) renders as a recognisable RGB chip for the VLM.
        # 2nd / 98th percentile per channel is the standard remote-sensing
        # display stretch.
        for c in range(3):
            lo, hi = np.percentile(rgb[..., c], [2, 98])
            if hi > lo:
                rgb[..., c] = np.clip((rgb[..., c] - lo) / (hi - lo), 0.0, 1.0)
        return (rgb * 255.0).astype(np.uint8)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def load_scene(
    input_path: str | Path,
    *,
    center_lat: float | None = None,
    center_lon: float | None = None,
) -> SatelliteScene:
    """Load any supported satellite input into a uniform :class:`SatelliteScene`.

    Args:
        input_path: One of:
            - Path to a directory containing Sentinel-2 GeoTIFFs (looks for
              files whose names contain B02, B03, B04, B08).
            - Path to a single 4-band PNG/JPG (R, G, B, NIR ordering).
            - Path to a `.npy` file containing an (H, W, 4) float32 array.
        center_lat / center_lon: optional override when the input lacks
            geo-referencing — used only for the output JSON metadata.

    Raises:
        FileNotFoundError if the path doesn't exist.
        ValueError if the input format can't be recognised.
    """
    path = Path(input_path)
    if not path.exists():
        raise FileNotFoundError(f"satellite input not found: {path}")

    if path.is_dir():
        return _load_sentinel2_dir(path, center_lat=center_lat, center_lon=center_lon)

    suffix = path.suffix.lower()
    if suffix == ".npy":
        return _load_numpy(path, center_lat=center_lat, center_lon=center_lon)
    if suffix in {".png", ".jpg", ".jpeg", ".tif", ".tiff"}:
        return _load_pil(path, center_lat=center_lat, center_lon=center_lon)
    raise ValueError(
        f"unsupported satellite input extension {suffix!r}; expected a Sentinel-2 "
        f"directory or one of .png/.jpg/.jpeg/.tif/.tiff/.npy"
    )


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


def _load_sentinel2_dir(
    directory: Path,
    *,
    center_lat: float | None,
    center_lon: float | None,
) -> SatelliteScene:
    """Load a Sentinel-2 L2A scene from a directory of per-band GeoTIFFs.

    We look for filenames containing the band tags (B02, B03, B04, B08).
    The canonical S2 layout is `T<tile>/R10m/T<tile>_<date>_<band>_10m.jp2`
    but we tolerate any structure — anything matching the band tag works.
    """
    try:
        import rasterio  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "loading a Sentinel-2 directory requires `rasterio`. Install with "
            "`pip install rasterio`, or export the bands as a single 4-band PNG "
            "and re-run the pipeline against that file."
        ) from exc

    def _find_band(tag: str) -> Path:
        matches = [
            p
            for p in directory.rglob("*")
            if p.is_file()
            and tag in p.stem
            and p.suffix.lower() in {".tif", ".tiff", ".jp2"}
        ]
        if not matches:
            raise FileNotFoundError(
                f"could not find Sentinel-2 band {tag} under {directory}"
            )
        return matches[0]

    red_path = _find_band(S2_RED_SUFFIX)
    green_path = _find_band(S2_GREEN_SUFFIX)
    blue_path = _find_band(S2_BLUE_SUFFIX)
    nir_path = _find_band(S2_NIR_SUFFIX)

    with rasterio.open(red_path) as src:
        red = src.read(1).astype(np.float32) / S2_REFLECTANCE_SCALE
        crs = str(src.crs) if src.crs else None
        # Centre of the raster bounds in the native CRS — we don't reproject
        # here, that's a future-work item if/when we go multi-tile. For the
        # output metadata we just record what we have.
        if center_lat is None or center_lon is None:
            try:
                from rasterio.warp import transform  # type: ignore[import-not-found]

                cx = (src.bounds.left + src.bounds.right) / 2
                cy = (src.bounds.top + src.bounds.bottom) / 2
                lon_arr, lat_arr = transform(src.crs, "EPSG:4326", [cx], [cy])
                center_lat = float(lat_arr[0])
                center_lon = float(lon_arr[0])
            except Exception as exc:  # pragma: no cover — best-effort
                logger.info("could not derive lat/lon centre (%s)", exc)
    with rasterio.open(green_path) as src:
        green = src.read(1).astype(np.float32) / S2_REFLECTANCE_SCALE
    with rasterio.open(blue_path) as src:
        blue = src.read(1).astype(np.float32) / S2_REFLECTANCE_SCALE
    with rasterio.open(nir_path) as src:
        nir = src.read(1).astype(np.float32) / S2_REFLECTANCE_SCALE

    # Align shapes — Sentinel-2 bands at 10m are all the same size, but if
    # the user mixed resolutions we crop to the common region.
    h = min(red.shape[0], green.shape[0], blue.shape[0], nir.shape[0])
    w = min(red.shape[1], green.shape[1], blue.shape[1], nir.shape[1])
    red, green, blue, nir = red[:h, :w], green[:h, :w], blue[:h, :w], nir[:h, :w]

    return SatelliteScene(
        red=red,
        green=green,
        blue=blue,
        nir=nir,
        source=f"sentinel-2 L2A @ {directory.name}",
        crs=crs,
        center_lat=center_lat,
        center_lon=center_lon,
    )


def _load_pil(
    path: Path,
    *,
    center_lat: float | None,
    center_lon: float | None,
) -> SatelliteScene:
    """Load a generic 4-band image via PIL — channels [R, G, B, NIR]."""
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover — PIL is a hard dep
        raise RuntimeError("Pillow is required to load PNG/JPG inputs") from exc

    with Image.open(path) as im:
        arr = np.asarray(im)

    if arr.ndim != 3 or arr.shape[2] != 4:
        raise ValueError(
            f"expected a 4-channel image at {path} (R, G, B, NIR); got shape {arr.shape}. "
            "If you have separate Sentinel-2 bands, pass the containing directory "
            "instead so the ingester can read each GeoTIFF."
        )

    if arr.dtype == np.uint8:
        arr = arr.astype(np.float32) / 255.0
    elif arr.dtype == np.uint16:
        arr = arr.astype(np.float32) / 65535.0
    else:
        arr = arr.astype(np.float32)
        if arr.max() > 1.5:  # quick heuristic: probably 0..255 stored as float
            arr = arr / arr.max()

    return SatelliteScene(
        red=arr[..., 0],
        green=arr[..., 1],
        blue=arr[..., 2],
        nir=arr[..., 3],
        source=f"4-band image @ {path.name}",
        crs=None,
        center_lat=center_lat,
        center_lon=center_lon,
    )


def _load_numpy(
    path: Path,
    *,
    center_lat: float | None,
    center_lon: float | None,
) -> SatelliteScene:
    """Load a (H, W, 4) numpy array — channels [R, G, B, NIR] in [0, 1]."""
    arr = np.load(path)
    if arr.ndim != 3 or arr.shape[2] != 4:
        raise ValueError(
            f"expected an (H, W, 4) numpy array at {path}; got shape {arr.shape}"
        )
    arr = arr.astype(np.float32)
    return SatelliteScene(
        red=arr[..., 0],
        green=arr[..., 1],
        blue=arr[..., 2],
        nir=arr[..., 3],
        source=f"npy @ {path.name}",
        crs=None,
        center_lat=center_lat,
        center_lon=center_lon,
    )
