"""Smoke test for the Ollama Gemma 3 4B VLM client.

Builds a synthetic agricultural image (green canopy with a yellow stress
patch and a brown row segment) and asks the local Ollama Gemma 3 model to
analyze it. Prints the parsed `AerialAnalysis` and `GroundAnalysis` so we
can sanity-check that the open-source backup actually returns valid pointing
JSON on demo day.

Run from the `backend/` directory:
    python3 -m scripts.smoke_test_ollama
"""

from __future__ import annotations

import asyncio
import base64
import io
import sys
import time

from PIL import Image, ImageDraw

from app.schemas import AnomalyPattern, Zone
from app.vision.ollama_gemma import OllamaGemmaClient


def _make_synthetic_aerial_jpeg() -> str:
    """Top-down farmland mock: green ground + brown row + yellow stress patch."""
    img = Image.new("RGB", (640, 360), color=(46, 122, 58))  # healthy green
    draw = ImageDraw.Draw(img)
    # Brown irrigation-line strip (vertical row)
    draw.rectangle([(290, 0), (315, 360)], fill=(120, 78, 38))
    # Yellow stress patch in the middle-right
    for r, color in [(80, (210, 180, 70)), (45, (220, 200, 90)), (20, (235, 220, 110))]:
        draw.ellipse([(360 - r, 180 - r), (360 + r, 180 + r)], fill=color)
    # Rows of alternating green stripes for visual texture
    for y in range(0, 360, 36):
        draw.rectangle([(0, y), (640, y + 6)], fill=(38, 100, 48))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _make_synthetic_ground_jpeg() -> str:
    """Wrist-cam mock: dry yellow soil + a wilted yellow leaf in foreground."""
    img = Image.new("RGB", (640, 360), color=(167, 130, 70))  # dry tan soil
    draw = ImageDraw.Draw(img)
    # Cracked-soil texture
    for x in range(0, 640, 28):
        draw.line([(x, 0), (x + 12, 360)], fill=(85, 60, 30), width=2)
    # Wilted leaf (yellow) lower-left
    draw.polygon(
        [(80, 280), (180, 220), (240, 290), (190, 340), (110, 330)],
        fill=(220, 200, 90),
        outline=(140, 110, 50),
    )
    # A bit of blue drip line at the top
    draw.rectangle([(0, 30), (640, 50)], fill=(60, 120, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _zone_b3() -> Zone:
    return Zone(
        zone_id="B3",
        lat=38.5394,
        lon=-121.7616,
        ndvi=0.42,
        ndvi_baseline=0.64,
        ndvi_drop=0.22,
        pattern=AnomalyPattern.ROW_ALIGNED,
        neighbor_avg_ndvi=0.61,
        anomaly_score=0.84,
    )


async def main() -> int:
    client = OllamaGemmaClient()
    zone = _zone_b3()

    aerial_b64 = _make_synthetic_aerial_jpeg()
    ground_b64 = _make_synthetic_ground_jpeg()

    print(f"[ollama-smoke] model={client.model_id} url={client.base_url}")

    print("\n[ollama-smoke] aerial …")
    t0 = time.perf_counter()
    aerial = await client.analyze_aerial(aerial_b64, zone)
    dt = time.perf_counter() - t0
    print(f"  took {dt:.2f}s")
    print(f"  visible={aerial.visible} confidence={aerial.confidence:.2f}")
    print(f"  evidence={aerial.evidence}")
    print(f"  evidence_points={[(p.point, p.label) for p in aerial.evidence_points]}")

    print("\n[ollama-smoke] ground …")
    t0 = time.perf_counter()
    ground = await client.analyze_ground(ground_b64, zone)
    dt = time.perf_counter() - t0
    print(f"  took {dt:.2f}s")
    print(f"  dry_soil={ground.dry_soil} wilted={ground.wilted_leaves} drip={ground.damaged_drip_line}")
    print(f"  other_evidence={ground.other_evidence}")
    print(f"  evidence_points={[(p.point, p.label) for p in ground.evidence_points]}")

    ok = bool(aerial.evidence_points) or bool(ground.evidence_points)
    print(f"\n[ollama-smoke] {'PASS' if ok else 'FAIL (no evidence points returned)'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
