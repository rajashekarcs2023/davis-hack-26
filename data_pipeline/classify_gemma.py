"""Stage 4 — Gemma 4 VLM classification of anomaly chips via Ollama.

For each zone whose `anomaly_score` exceeds a threshold, we ship its RGB
chip to a locally-hosted Gemma 4 (`gemma4:e4b`) model running under
Ollama and ask for a structured JSON hypothesis: pest / water / nutrient
stress, with confidence, visual evidence, and an alert priority.

Why Gemma 4 specifically?
    - It's the same on-prem VLM the AgriScout backend ensemble uses (see
      `backend/app/vision/ollama_gemma.py`). Re-using the model keeps the
      pipeline's classification distribution consistent with what the
      live agent will see at inspection time.
    - `gemma4:e4b` (effective 4B params, multimodal, ~9.6 GB) beats
      Gemma 3 27B on every Google vision benchmark while running on a
      single laptop — viable for offline / rural deployments.
    - We pin `format=json` on the Ollama call AND wrap each prompt in
      a "JSON ONLY" instruction so we get parseable output even on
      degenerate frames.

If Ollama is not reachable, the classifier degrades to a pure
rule-based hypothesis derived from the spatial pattern + NDVI drop —
the pipeline still produces alerts, they're just less specific.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx
import numpy as np
from PIL import Image

logger = logging.getLogger("agriscout.pipeline.gemma")

# Default endpoint matches the backend's `OLLAMA_URL`. The backend defaults
# to http://localhost:11434 if unset; we follow the same convention so a
# single Ollama instance serves both the pipeline and the live agent.
DEFAULT_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
DEFAULT_OLLAMA_MODEL = os.environ.get("OLLAMA_VLM_MODEL", "gemma4:e4b")
DEFAULT_TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT_S", "45"))

# Zones below this anomaly score skip the VLM call — they're "healthy
# enough" and not worth a paid VLM round-trip. The backend uses the same
# threshold conceptually in `anomaly_engine.classify_zone`.
DEFAULT_ANOMALY_THRESHOLD = 0.40

PROMPT_TEMPLATE = """You are an agronomy vision assistant analysing a Sentinel-2 satellite chip
for one zone of a tomato field. The zone has been flagged with NDVI drop
{ndvi_drop:.2f} (current NDVI {ndvi_mean:.2f} vs healthy baseline
{ndvi_baseline:.2f}). The spatial pattern of low-vegetation pixels is
"{pattern}". The neighbouring zones have a mean NDVI of {neighbor_avg:.2f}.

Look at the RGB chip below and decide the MOST LIKELY cause of the
vegetation drop. Choose ONE label from:

  - "pest_hotspot_suspected"   — patchy / clustered damage, mottled canopy,
                                 visible discoloration on plant tops.
  - "water_stress_suspected"   — uniformly browning canopy, dry-looking soil
                                 visible between rows, possibly irrigation
                                 line failures (row-aligned dry stripes).
  - "nutrient_deficit_suspected" — pale / yellowing canopy across the chip,
                                   often uniform_low pattern.
  - "false_alarm_cloud_noise"  — chip looks like cloud cover or shadow, no
                                 actual ground signal.
  - "needs_human_review"       — cause genuinely unclear from satellite
                                 imagery alone; recommend ground inspection.

CRITICAL: respond with VALID JSON ONLY. No prose. No markdown fences.

Schema:
{{
  "likely_cause": "<one label from the list>",
  "confidence": <float in [0, 1]>,
  "visual_evidence": "<one short sentence describing what you see>",
  "alert_priority": "low" | "medium" | "high",
  "recommend_drone_followup": true | false
}}
"""


@dataclass(frozen=True)
class GemmaClassification:
    """What the VLM returns for one anomaly zone."""

    likely_cause: str
    confidence: float
    visual_evidence: str
    alert_priority: str
    recommend_drone_followup: bool
    source_model: str  # which model produced this (gemma4:e4b, fallback, etc.)


async def classify_anomaly_zone(
    *,
    zone_id: str,
    ndvi_mean: float,
    ndvi_baseline: float,
    ndvi_drop: float,
    pattern: str,
    neighbor_avg_ndvi: float,
    rgb_chip: np.ndarray,
    ollama_url: str = DEFAULT_OLLAMA_URL,
    model: str = DEFAULT_OLLAMA_MODEL,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> GemmaClassification:
    """Ask Gemma 4 for a structured cause hypothesis for one anomaly zone.

    Falls back to a deterministic rule-based hypothesis if Ollama is
    unreachable or returns malformed JSON. The fallback is intentionally
    conservative — it never claims "pest" without spatial evidence — so
    a missing Ollama doesn't produce spurious high-priority alerts.
    """
    chip_b64 = _encode_chip(rgb_chip)
    prompt = PROMPT_TEMPLATE.format(
        zone_id=zone_id,
        ndvi_mean=ndvi_mean,
        ndvi_baseline=ndvi_baseline,
        ndvi_drop=ndvi_drop,
        pattern=pattern,
        neighbor_avg=neighbor_avg_ndvi,
    )

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.post(
                f"{ollama_url.rstrip('/')}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "images": [chip_b64],
                    "stream": False,
                    "format": "json",
                    # Gemma 4 model-card recommended sampling — same as the
                    # backend Ollama client so distributions match.
                    "options": {
                        "temperature": 1.0,
                        "top_p": 0.95,
                        "top_k": 64,
                        "num_predict": 256,
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
            raw_text = (payload.get("response") or "").strip()
            data = json.loads(raw_text) if raw_text else {}
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        logger.info(
            "Gemma classification unavailable for zone %s (%s); using fallback",
            zone_id,
            exc,
        )
        return _rule_based_fallback(
            zone_id=zone_id,
            ndvi_drop=ndvi_drop,
            pattern=pattern,
        )

    return _coerce_response(data, source_model=model, ndvi_drop=ndvi_drop, pattern=pattern)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_VALID_CAUSES = {
    "pest_hotspot_suspected",
    "water_stress_suspected",
    "nutrient_deficit_suspected",
    "false_alarm_cloud_noise",
    "needs_human_review",
}
_VALID_PRIORITIES = {"low", "medium", "high"}


def _encode_chip(rgb_chip: np.ndarray) -> str:
    """Encode an (H, W, 3) uint8 array as a base64 JPEG for the Ollama API."""
    image = Image.fromarray(rgb_chip, mode="RGB")
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _coerce_response(
    data: dict[str, Any],
    *,
    source_model: str,
    ndvi_drop: float,
    pattern: str,
) -> GemmaClassification:
    """Defensive coercion: clamp confidence, validate labels, fall back on garbage."""
    cause = str(data.get("likely_cause") or "").strip()
    if cause not in _VALID_CAUSES:
        return _rule_based_fallback(
            zone_id="<vlm>",
            ndvi_drop=ndvi_drop,
            pattern=pattern,
            source_model=f"{source_model}:malformed",
        )

    try:
        conf = float(data.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))

    priority = str(data.get("alert_priority") or "low").lower().strip()
    if priority not in _VALID_PRIORITIES:
        priority = "low"

    evidence = str(data.get("visual_evidence") or "")[:200]

    recommend = bool(data.get("recommend_drone_followup", priority != "low"))

    return GemmaClassification(
        likely_cause=cause,
        confidence=round(conf, 3),
        visual_evidence=evidence,
        alert_priority=priority,
        recommend_drone_followup=recommend,
        source_model=source_model,
    )


def _rule_based_fallback(
    *,
    zone_id: str,
    ndvi_drop: float,
    pattern: str,
    source_model: str = "rule_based_fallback",
) -> GemmaClassification:
    """Conservative fallback used when Ollama is unreachable or returns garbage."""
    if pattern == "row_aligned" and ndvi_drop >= 0.15:
        cause = "water_stress_suspected"
        evidence = "row-aligned NDVI dropout consistent with an irrigation line issue"
    elif pattern == "patchy" and ndvi_drop >= 0.10:
        cause = "pest_hotspot_suspected"
        evidence = "patchy NDVI drop with bright neighbouring canopy"
    elif pattern == "uniform_low":
        cause = "nutrient_deficit_suspected"
        evidence = "field-wide low NDVI suggests a nutrient or seasonal effect"
    elif pattern == "edge":
        cause = "water_stress_suspected"
        evidence = "edge dropout often correlates with irrigation tail / sprinkler reach"
    else:
        cause = "needs_human_review"
        evidence = "low-confidence satellite signal; ground inspection recommended"

    if ndvi_drop >= 0.20:
        priority = "high"
    elif ndvi_drop >= 0.10:
        priority = "medium"
    else:
        priority = "low"

    return GemmaClassification(
        likely_cause=cause,
        confidence=0.55,
        visual_evidence=evidence,
        alert_priority=priority,
        recommend_drone_followup=priority != "low",
        source_model=source_model,
    )
