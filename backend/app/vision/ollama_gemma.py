"""Ollama-hosted Gemma (multimodal) VLM client.

Talks to a local `ollama serve` instance over its HTTP API. The default model
is `gemma4:e4b` (effective 4B parameters, multimodal, ~9.6GB). Per Google's
Gemma 4 model card, E4B beats Gemma 3 27B on every vision benchmark while
running on a laptop. Falls back to `gemma3:4b` (3.3GB) if Gemma 4 isn't
available locally — both speak the same Ollama HTTP API.

This client exists as the open-source / offline backup to the cloud-hosted
Gemini Robotics-ER 1.6 client. Pitch line: "Our VLM stack runs cloud
(Gemini Robotics-ER 1.6) OR fully offline (Gemma 4 E4B via Ollama). We don't
depend on a single API."

Pointing accuracy: Gemma doesn't have native pointing the way Gemini
Robotics-ER does. We prompt-engineer the model to emit `[y, x]` 0..1000
coordinates by giving it a tight JSON schema. With Gemma 4 E4B's improved
spatial reasoning the points are directionally accurate; not pixel-perfect
but good enough for the demo overlay.

Best practices from the Gemma 4 model card (applied below):
    - temperature=1.0, top_p=0.95, top_k=64
    - Thinking mode DISABLED for spatial / visual tasks (no <|think|> token)
    - Place image content before text in the prompt (handled by Ollama)

Refs:
- https://ollama.com/library/gemma4
- https://github.com/ollama/ollama/blob/main/docs/api.md (POST /api/generate)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.config import settings
from app.domain.packs.irrigation import (
    AERIAL_VLM_PROMPT_TEMPLATE,
    ER_POLICY_PROMPT_TEMPLATE,
    GROUND_VLM_PROMPT_TEMPLATE,
    LEAF_VLM_PROMPT_TEMPLATE,
)
from app.schemas import (
    AerialAnalysis,
    ErPolicyStep,
    EvidencePoint,
    GroundAnalysis,
    LeafEvidence,
    Zone,
)

logger = logging.getLogger("terrascout.vision.ollama")

# Gemma 3 needs more explicit framing than Gemini for pointing — we wrap each
# domain prompt with these so the model knows it's emitting JSON for an
# automated pipeline, not free-form prose.
_AERIAL_GEMMA_SUFFIX = """

CRITICAL: respond with VALID JSON ONLY. No prose, no markdown fences, no commentary.
Coordinates are normalized integers in 0..1000 (origin = top-left of the image, y
increases downward). If the image is dark or empty, set visible=false, confidence=0.5,
and return an empty evidence_points list.
"""

_GROUND_GEMMA_SUFFIX = """

CRITICAL: respond with VALID JSON ONLY. No prose, no markdown fences, no commentary.
Coordinates are normalized integers in 0..1000 (origin = top-left of the image, y
increases downward). If the image is dark or empty, set all booleans to false,
confidence=0.5, and return an empty evidence_points list.
"""

_LEAF_GEMMA_SUFFIX = """

CRITICAL: respond with VALID JSON ONLY. No prose, no markdown fences, no commentary.
Coordinates are normalized integers in 0..1000 (origin = top-left of the image, y
increases downward). If the image is dark, out-of-focus, or does not show a leaf,
set all booleans to false, confidence=0.3, and return an empty evidence_points list.
"""


class OllamaGemmaClient:
    """VLM client backed by a local Ollama Gemma (3 or 4) multimodal model.

    Defaults to ``gemma4:e4b`` per ``settings.ollama_vlm_model``; can be
    pointed at ``gemma3:4b`` (or any other multimodal Ollama model) by
    setting that env var.
    """

    name = "ollama-gemma"

    def __init__(self) -> None:
        self.base_url = settings.ollama_url.rstrip("/")
        self.timeout = settings.ollama_timeout_s
        self.model_id = settings.ollama_vlm_model
        # Probe lazily on first call so import-time failures don't kill the
        # backend when Ollama is not running.

    async def _generate_json(self, prompt: str, frame_b64: str) -> dict[str, Any]:
        if not frame_b64:
            return {}

        body = {
            "model": self.model_id,
            "prompt": prompt,
            "images": [frame_b64],
            "stream": False,
            # Tell Ollama to constrain the response to valid JSON. Combined with
            # our prompt-level "JSON ONLY" instructions this gives ~95% reliable
            # JSON parsing across runs.
            "format": "json",
            # Gemma 4 model card's recommended sampling for all use cases.
            # Higher top_p + top_k than typical for a JSON task; temperature=1.0
            # is paired with the natural distribution shaping. We keep
            # num_predict tight so the model doesn't ramble after the JSON.
            "options": {
                "temperature": 1.0,
                "top_p": 0.95,
                "top_k": 64,
                "num_predict": 512,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(f"{self.base_url}/api/generate", json=body)
                resp.raise_for_status()
                payload = resp.json()
        except Exception as exc:
            logger.warning("Ollama call failed (%s); returning empty", exc)
            return {}

        text = (payload.get("response") or "").strip()
        if not text:
            return {}
        # Defense-in-depth: strip optional markdown fences even though we asked
        # for raw JSON.
        text = re.sub(
            r"^```(?:json)?\s*|\s*```$",
            "",
            text,
            flags=re.IGNORECASE | re.MULTILINE,
        ).strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Ollama returned non-JSON: %s", text[:200])
            return {}
        return data if isinstance(data, dict) else {}

    async def analyze_aerial(self, frame_b64: str, zone: Zone) -> AerialAnalysis:
        prompt = AERIAL_VLM_PROMPT_TEMPLATE.format(
            zone_id=zone.zone_id,
            pattern=zone.pattern.value,
            ndvi_drop=zone.ndvi_drop,
        ) + _AERIAL_GEMMA_SUFFIX
        data = await self._generate_json(prompt, frame_b64)
        return AerialAnalysis(
            visible=bool(data.get("visible", False)),
            confidence=_clamp01(data.get("confidence", 0.0)),
            evidence=[str(e) for e in (data.get("evidence") or [])][:6],
            evidence_points=_coerce_points(data.get("evidence_points") or []),
            recommend_ground_truth=bool(data.get("recommend_ground_truth", False)),
        )

    async def analyze_ground(self, frame_b64: str, zone: Zone) -> GroundAnalysis:
        prompt = GROUND_VLM_PROMPT_TEMPLATE.format(zone_id=zone.zone_id) + _GROUND_GEMMA_SUFFIX
        data = await self._generate_json(prompt, frame_b64)
        return GroundAnalysis(
            dry_soil=bool(data.get("dry_soil", False)),
            wilted_leaves=bool(data.get("wilted_leaves", False)),
            damaged_drip_line=bool(data.get("damaged_drip_line", False)),
            other_evidence=[str(e) for e in (data.get("other_evidence") or [])][:6],
            evidence_points=_coerce_points(data.get("evidence_points") or []),
            confidence=_clamp01(data.get("confidence", 0.0)),
        )

    async def analyze_leaf(
        self,
        frame_b64: str,
        zone: Zone,
        mode: str,
    ) -> LeafEvidence:
        """Close-up leaf VLM pass for `inspect_leaf_with_wrist` and
        `compare_healthy_plant`. `mode` is passed through to the prompt so the
        model knows whether it's looking at an affected plant (pest evidence
        expected) or a healthy reference (clean signal expected)."""
        prompt = LEAF_VLM_PROMPT_TEMPLATE.format(
            zone_id=zone.zone_id,
            mode=mode,
        ) + _LEAF_GEMMA_SUFFIX
        data = await self._generate_json(prompt, frame_b64)
        return LeafEvidence(
            stippling=bool(data.get("stippling", False)),
            webbing=bool(data.get("webbing", False)),
            egg_masses=bool(data.get("egg_masses", False)),
            discoloration=bool(data.get("discoloration", False)),
            other=[str(e) for e in (data.get("other") or [])][:6],
            confidence=_clamp01(data.get("confidence", 0.0)),
            evidence_points=_coerce_points(data.get("evidence_points") or []),
        )

    async def analyze_er_policy(
        self,
        frame_b64: str,
        zone: Zone,
        goal: str,
        current_pose: dict[str, float],
    ) -> ErPolicyStep:
        """Gemma 4 emulation of the Gemini Robotics-ER embodied-reasoning
        policy. Gemma is a VL model rather than a dedicated robotics model,
        but it can follow the ER_POLICY_PROMPT_TEMPLATE and emit a JSON
        target_point — less spatially accurate than the real ER but good
        enough to serve as a fully-local fallback in the ensemble.
        """
        pose_summary = ", ".join(
            f"{k}={v:.0f}" for k, v in sorted(current_pose.items())
        ) or "unknown"
        prompt = ER_POLICY_PROMPT_TEMPLATE.format(
            zone_id=zone.zone_id,
            pose_summary=pose_summary,
            goal=goal,
        )
        data = await self._generate_json(prompt, frame_b64)

        raw_pt = data.get("target_point") or [500, 500]
        tp: list[int] = [500, 500]
        if isinstance(raw_pt, (list, tuple)) and len(raw_pt) == 2:
            try:
                y = max(0, min(1000, int(raw_pt[0])))
                x = max(0, min(1000, int(raw_pt[1])))
                tp = [y, x]
            except (TypeError, ValueError):
                tp = [500, 500]

        status = str(data.get("status") or "navigating").lower()
        if status not in ("navigating", "arrived", "lost"):
            status = "navigating"

        reasoning = str(data.get("reasoning") or "")[:200]

        return ErPolicyStep(target_point=tp, status=status, reasoning=reasoning)


def _clamp01(value: Any) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _coerce_points(items: list[Any]) -> list[EvidencePoint]:
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
