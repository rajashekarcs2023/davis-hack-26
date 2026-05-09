"""Gemini Robotics-ER 1.6 + Gemini Pro Vision implementations.

Both models live behind the same module because they share the auth + image
preprocessing path. We try the Robotics-ER preview model first; if Google
returns a 404/permission error we automatically fall back to gemini-2.5-pro.

Aligned with `docs/gemini-robotics.md`:
    - SDK: `from google import genai; from google.genai import types`
    - Async surface: `client.aio.models.generate_content(...)`
    - Recommended config: temperature=1.0, thinking_config(thinking_budget=0)
      for low-latency spatial detection. Heavier reasoning increases the
      thinking_budget but hurts latency — we keep aerial fast, allow ground
      a small budget.
    - Native output is JSON arrays of {"point": [y, x], "label": ...} pairs
      with coordinates normalized to 0..1000. We surface those as
      `evidence_points` so the frontend can overlay them on the live frame.

Refs:
- https://ai.google.dev/gemini-api/docs/robotics-overview
- https://deepmind.google/blog/gemini-robotics-er-1-6/
"""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

from app.config import settings
from app.domain.packs.irrigation import (
    AERIAL_VLM_PROMPT_TEMPLATE,
    GROUND_VLM_PROMPT_TEMPLATE,
)
from app.schemas import AerialAnalysis, EvidencePoint, GroundAnalysis, Zone

logger = logging.getLogger("terrascout.vision.gemini")

ROBOTICS_ER_MODEL = "gemini-robotics-er-1.6-preview"
PRO_VISION_MODEL = "gemini-2.5-pro"

# Aerial detection is fast/spatial → minimal thinking. Ground analysis needs
# more reasoning (multi-class evidence) → small budget. See
# docs/gemini-robotics.md "Using the thinking budget" for the tradeoff.
AERIAL_THINKING_BUDGET = 0
GROUND_THINKING_BUDGET = 256


class _GeminiBase:
    name: str = "gemini"
    model_id: str = PRO_VISION_MODEL

    def __init__(self) -> None:
        if not settings.has_google:
            raise RuntimeError("GOOGLE_API_KEY is not set; cannot use Gemini client")
        try:
            from google import genai  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError("google-genai package not installed: pip install google-genai") from exc
        self._client = genai.Client(api_key=settings.google_api_key)

    async def _ask_json(
        self,
        prompt: str,
        frame_b64: str,
        *,
        thinking_budget: int = 0,
    ) -> dict[str, Any] | list[Any]:
        """Single image + JSON-only prompt; returns parsed JSON (dict or list)."""
        try:
            from google.genai import types  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError("google-genai missing types submodule") from exc

        if not frame_b64:
            logger.info("Empty frame; skipping Gemini call")
            return {}

        image_bytes = base64.b64decode(frame_b64)
        try:
            response = await self._client.aio.models.generate_content(
                model=self.model_id,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    temperature=1.0,
                    response_mime_type="application/json",
                    thinking_config=types.ThinkingConfig(thinking_budget=thinking_budget),
                ),
            )
        except Exception as exc:
            logger.warning("Gemini call failed (%s); raising", exc)
            raise

        text = (getattr(response, "text", None) or "").strip()
        if not text:
            return {}
        # Some response paths still include code-fences; strip just in case.
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.MULTILINE).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Gemini returned non-JSON: %s", text[:200])
            return {}

    async def analyze_aerial(self, frame_b64: str, zone: Zone) -> AerialAnalysis:
        prompt = AERIAL_VLM_PROMPT_TEMPLATE.format(
            zone_id=zone.zone_id,
            pattern=zone.pattern.value,
            ndvi_drop=zone.ndvi_drop,
        )
        raw = await self._ask_json(prompt, frame_b64, thinking_budget=AERIAL_THINKING_BUDGET)
        data = raw if isinstance(raw, dict) else {}
        return AerialAnalysis(
            visible=bool(data.get("visible", False)),
            confidence=float(data.get("confidence", 0.0) or 0.0),
            evidence=[str(e) for e in (data.get("evidence") or [])],
            evidence_points=_coerce_points(data.get("evidence_points") or []),
            recommend_ground_truth=bool(data.get("recommend_ground_truth", False)),
        )

    async def analyze_ground(self, frame_b64: str, zone: Zone) -> GroundAnalysis:
        prompt = GROUND_VLM_PROMPT_TEMPLATE.format(zone_id=zone.zone_id)
        raw = await self._ask_json(prompt, frame_b64, thinking_budget=GROUND_THINKING_BUDGET)
        data = raw if isinstance(raw, dict) else {}
        return GroundAnalysis(
            dry_soil=bool(data.get("dry_soil", False)),
            wilted_leaves=bool(data.get("wilted_leaves", False)),
            damaged_drip_line=bool(data.get("damaged_drip_line", False)),
            other_evidence=[str(e) for e in (data.get("other_evidence") or [])],
            evidence_points=_coerce_points(data.get("evidence_points") or []),
            confidence=float(data.get("confidence", 0.0) or 0.0),
        )


def _coerce_points(items: list[Any]) -> list[EvidencePoint]:
    """Tolerate slight schema drift from the model."""
    out: list[EvidencePoint] = []
    for it in items[:10]:
        if not isinstance(it, dict):
            continue
        pt = it.get("point") or it.get("pt")
        label = it.get("label") or it.get("name") or "evidence"
        if isinstance(pt, list) and len(pt) == 2:
            try:
                y, x = int(pt[0]), int(pt[1])
            except (TypeError, ValueError):
                continue
            y = max(0, min(1000, y))
            x = max(0, min(1000, x))
            out.append(EvidencePoint(point=[y, x], label=str(label)))
    return out


class GeminiRoboticsERClient(_GeminiBase):
    """Primary VLM. Preview model with strong embodied / spatial reasoning."""

    name = "gemini-robotics-er-1.6"
    model_id = ROBOTICS_ER_MODEL


class GeminiProVisionClient(_GeminiBase):
    """Fallback VLM if Robotics-ER access is gated."""

    name = "gemini-2.5-pro"
    model_id = PRO_VISION_MODEL
