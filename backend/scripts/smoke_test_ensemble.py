"""Smoke test for the ensemble VLM client.

Runs Gemini Robotics-ER + local Ollama Gemma IN PARALLEL on a synthetic
farm image and prints the merged analysis. Each evidence point is tagged
with the model name so the sim overlay can color-code by source.

Run from the `backend/` directory:
    python3 -m scripts.smoke_test_ensemble
"""

from __future__ import annotations

import asyncio
import base64
import io
import sys
import time

from PIL import Image, ImageDraw

from app.schemas import AnomalyPattern, Zone
from app.vision.ensemble_vlm import EnsembleVlmClient


def _synthetic_aerial() -> str:
    img = Image.new("RGB", (640, 360), color=(46, 122, 58))
    d = ImageDraw.Draw(img)
    d.rectangle([(290, 0), (315, 360)], fill=(120, 78, 38))
    for r, c in [(80, (210, 180, 70)), (45, (220, 200, 90)), (20, (235, 220, 110))]:
        d.ellipse([(360 - r, 180 - r), (360 + r, 180 + r)], fill=c)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


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
    client = EnsembleVlmClient()
    print("[ensemble-smoke] members:", [m.name for m in client._members])

    zone = _zone_b3()
    frame = _synthetic_aerial()

    print("\n[ensemble-smoke] aerial (parallel fanout) …")
    t0 = time.perf_counter()
    aerial = await client.analyze_aerial(frame, zone)
    dt = time.perf_counter() - t0
    print(f"  total latency: {dt:.2f}s (bounded by slowest member)")
    print(f"  merged visible={aerial.visible} confidence={aerial.confidence:.2f}")
    print(f"  {len(aerial.evidence_points)} merged evidence points:")
    for p in aerial.evidence_points:
        print(f"    {p.point}  {p.label}")
    print("  evidence:")
    for e in aerial.evidence:
        print("   -", e)

    ok = len(aerial.evidence_points) >= 1 and len(client._members) >= 1
    print(f"\n[ensemble-smoke] {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
