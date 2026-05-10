"""End-to-end pipeline runner.

Chains all five stages and writes a `FieldGrid`-compatible JSON document
to disk.

Usage:
    # Synthetic demo (no external deps beyond Pillow + numpy + httpx):
    python -m data_pipeline.samples.synthetic_field
    python -m data_pipeline.pipeline \\
        --input data_pipeline/samples/synthetic_scene.npy \\
        --output data_pipeline/outputs/latest.json

    # Real Sentinel-2 (requires rasterio):
    pip install rasterio
    python -m data_pipeline.pipeline \\
        --input /path/to/S2A_MSIL2A_<date>_T<tile>.SAFE \\
        --output data_pipeline/outputs/latest.json \\
        --rows 4 --cols 4

    # Skip the VLM call (anomaly scoring only):
    python -m data_pipeline.pipeline --input ... --output ... --no-vlm

Exit codes:
    0 — pipeline ran cleanly and the output file was written
    1 — input file / dir not found
    2 — unsupported input format
    3 — pipeline error during processing
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from data_pipeline.alerts import (
    DEFAULT_SCENE_ACQUISITION_DATE,
    DEFAULT_SCENE_MGRS_TILE,
    DEFAULT_SCENE_MISSION,
    DEFAULT_SCENE_PRODUCT_ID,
    DEFAULT_SCENE_RELATIVE_ORBIT,
    build_field_grid_json,
)
from data_pipeline.chip import DEFAULT_COLS, DEFAULT_ROWS, chip_scene
from data_pipeline.classify_gemma import (
    DEFAULT_ANOMALY_THRESHOLD,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OLLAMA_URL,
    GemmaClassification,
    classify_anomaly_zone,
)
from data_pipeline.ingest import load_scene
from data_pipeline.ndvi import (
    DEFAULT_NDVI_BASELINE,
    compute_zone_ndvi,
    score_zone_anomaly,
)

logger = logging.getLogger("agriscout.pipeline")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m data_pipeline.pipeline",
        description=(
            "Convert a satellite scene into per-zone NDVI anomaly alerts using "
            "a Gemma 4 multimodal VLM via Ollama."
        ),
    )
    parser.add_argument(
        "--input",
        required=True,
        help=(
            "Path to a Sentinel-2 directory, a 4-band PNG/JPG (R,G,B,NIR), or "
            "an (H, W, 4) numpy .npy file."
        ),
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to write the final FieldGrid JSON.",
    )
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--cols", type=int, default=DEFAULT_COLS)
    parser.add_argument(
        "--baseline",
        type=float,
        default=DEFAULT_NDVI_BASELINE,
        help=f"Healthy-canopy NDVI baseline (default {DEFAULT_NDVI_BASELINE}).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_ANOMALY_THRESHOLD,
        help=(
            f"Anomaly score above which Gemma is consulted "
            f"(default {DEFAULT_ANOMALY_THRESHOLD})."
        ),
    )
    parser.add_argument(
        "--ollama-url",
        default=DEFAULT_OLLAMA_URL,
        help=f"Ollama base URL (default {DEFAULT_OLLAMA_URL}).",
    )
    parser.add_argument(
        "--ollama-model",
        default=DEFAULT_OLLAMA_MODEL,
        help=f"Ollama model id (default {DEFAULT_OLLAMA_MODEL}).",
    )
    parser.add_argument(
        "--no-vlm",
        action="store_true",
        help="Skip the Gemma VLM step (anomaly scoring only).",
    )
    parser.add_argument(
        "--center-lat",
        type=float,
        default=None,
        help="Override scene centre latitude (used only when input lacks geo).",
    )
    parser.add_argument(
        "--center-lon",
        type=float,
        default=None,
        help="Override scene centre longitude (used only when input lacks geo).",
    )
    parser.add_argument(
        "--dashboard",
        default=None,
        help=(
            "Optional path to also write a self-contained HTML dashboard "
            "(Tailwind CDN, vanilla JS). Drop the resulting .html into any "
            "browser to view zone map + alerts."
        ),
    )
    parser.add_argument(
        "--scene-mission",
        default=DEFAULT_SCENE_MISSION,
        help=f"Satellite mission tag for the dashboard (default {DEFAULT_SCENE_MISSION!r}).",
    )
    parser.add_argument(
        "--scene-tile",
        default=DEFAULT_SCENE_MGRS_TILE,
        help=f"MGRS tile id for the dashboard (default {DEFAULT_SCENE_MGRS_TILE!r}).",
    )
    parser.add_argument(
        "--scene-date",
        default=DEFAULT_SCENE_ACQUISITION_DATE,
        help=f"Acquisition date (YYYY-MM-DD) for the dashboard (default {DEFAULT_SCENE_ACQUISITION_DATE!r}).",
    )
    parser.add_argument(
        "--scene-product-id",
        default=DEFAULT_SCENE_PRODUCT_ID,
        help=f"Full Sentinel-2 product id for the dashboard (default {DEFAULT_SCENE_PRODUCT_ID!r}).",
    )
    parser.add_argument(
        "--scene-orbit",
        default=DEFAULT_SCENE_RELATIVE_ORBIT,
        help=f"Relative orbit tag (default {DEFAULT_SCENE_RELATIVE_ORBIT!r}).",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser.parse_args(argv)


async def _run(args: argparse.Namespace) -> dict:
    # ----- Stage 1: ingest ------------------------------------------------
    logger.info("ingest: loading %s", args.input)
    scene = load_scene(
        args.input, center_lat=args.center_lat, center_lon=args.center_lon
    )
    logger.info(
        "ingest: loaded %s, shape=%s, crs=%s, centre=(%s, %s)",
        scene.source,
        scene.shape,
        scene.crs,
        scene.center_lat,
        scene.center_lon,
    )

    # ----- Stage 2: chip --------------------------------------------------
    chips = chip_scene(scene, rows=args.rows, cols=args.cols)
    logger.info("chip: produced %d zones (%dx%d grid)", len(chips), args.rows, args.cols)

    # ----- Stage 3: NDVI + anomaly scoring --------------------------------
    raw_zones = [compute_zone_ndvi(c, ndvi_baseline=args.baseline) for c in chips]
    zones = score_zone_anomaly(raw_zones, rows=args.rows, cols=args.cols)
    anomaly_zones = [z for z in zones if z.anomaly_score >= args.threshold]
    logger.info(
        "ndvi: %d/%d zones above anomaly threshold %.2f",
        len(anomaly_zones),
        len(zones),
        args.threshold,
    )

    # ----- Stage 4: Gemma 4 classification --------------------------------
    classifications: dict[str, GemmaClassification] = {}
    if not args.no_vlm and anomaly_zones:
        logger.info("classify: %d zones → %s @ %s",
                    len(anomaly_zones), args.ollama_model, args.ollama_url)
        chip_by_id = {c.zone_id: c for c in chips}
        # Run zones sequentially — most Ollama deployments are single-GPU and
        # parallel calls just queue up server-side anyway. Sequential is also
        # easier to debug from logs.
        for z in anomaly_zones:
            chip = chip_by_id[z.zone_id]
            cls = await classify_anomaly_zone(
                zone_id=z.zone_id,
                ndvi_mean=z.ndvi_mean,
                ndvi_baseline=z.ndvi_baseline,
                ndvi_drop=z.ndvi_drop,
                pattern=z.pattern,
                neighbor_avg_ndvi=z.neighbor_avg_ndvi,
                rgb_chip=chip.rgb_chip(),
                ollama_url=args.ollama_url,
                model=args.ollama_model,
            )
            classifications[z.zone_id] = cls
            logger.info(
                "classify: %s → %s (conf=%.2f, %s) — %s",
                z.zone_id,
                cls.likely_cause,
                cls.confidence,
                cls.alert_priority,
                cls.visual_evidence[:80],
            )
    elif args.no_vlm:
        logger.info("classify: skipped (--no-vlm)")
    else:
        logger.info("classify: no zones above threshold; skipping VLM")

    # ----- Stage 5: emit FieldGrid JSON -----------------------------------
    scene_metadata = {
        "mission": args.scene_mission,
        "mgrs_tile": args.scene_tile,
        "acquisition_date": args.scene_date,
        "product_id": args.scene_product_id,
        "relative_orbit": args.scene_orbit,
        "processing_baseline": "N0500",
        "provider": "Copernicus Data Space Ecosystem",
        "provider_url": "https://dataspace.copernicus.eu",
    }
    doc = build_field_grid_json(
        scene=scene,
        zones=zones,
        classifications=classifications,
        rows=args.rows,
        cols=args.cols,
        threshold=args.threshold,
        vlm_model=args.ollama_model if not args.no_vlm else "skipped",
        scene_metadata=scene_metadata,
    )
    return doc


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    input_path = Path(args.input)
    if not input_path.exists():
        logger.error("input not found: %s", input_path)
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        doc = asyncio.run(_run(args))
    except ValueError as exc:
        logger.error("unsupported input: %s", exc)
        return 2
    except Exception:
        logger.exception("pipeline error")
        return 3

    output_path.write_text(json.dumps(doc, indent=2))
    meta = doc["_pipeline_metadata"]
    logger.info(
        "wrote %s (%d zones, %d above threshold, %d VLM-classified)",
        output_path,
        len(doc["zones"]),
        meta["zones_above_threshold"],
        meta["vlm_classifications_count"],
    )

    if args.dashboard:
        # Lazy import so the pipeline doesn't pay the cost when --dashboard
        # isn't requested.
        from data_pipeline.dashboard.render import render_to_file

        dashboard_path = Path(args.dashboard)
        try:
            html_path = render_to_file(output_path, dashboard_path)
        except Exception:
            logger.exception("dashboard render failed (pipeline JSON still written)")
            return 3
        logger.info("wrote dashboard %s", html_path)

    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
