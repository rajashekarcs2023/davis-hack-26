"""Vision-language client interface + factory.

Three implementations: Gemini Robotics-ER (preview), Gemini Pro Vision,
Claude Vision, and a Mock that returns deterministic fixtures keyed by zone.
The Mock exists *primarily* as demo-day insurance: a network or quota issue
during the 3-minute demo cannot kill the run.
"""

from __future__ import annotations

import logging
from typing import Protocol

from app.config import settings
from app.schemas import AerialAnalysis, GroundAnalysis, Zone

logger = logging.getLogger("terrascout.vision")


class VLMClient(Protocol):
    """Both methods take an already-base64-encoded JPEG (no data:url prefix)."""

    name: str

    async def analyze_aerial(
        self,
        frame_b64: str,
        zone: Zone,
    ) -> AerialAnalysis: ...

    async def analyze_ground(
        self,
        frame_b64: str,
        zone: Zone,
    ) -> GroundAnalysis: ...


_client: VLMClient | None = None


def get_vlm_client() -> VLMClient:
    """Pick a client based on settings.vlm_client. Falls back to Mock on import errors."""
    global _client
    if _client is not None:
        return _client

    choice = settings.vlm_client.lower().strip()

    if choice == "gemini_er":
        try:
            from app.vision.gemini_er import GeminiRoboticsERClient

            _client = GeminiRoboticsERClient()
            logger.info("VLM client: Gemini Robotics-ER 1.6")
            return _client
        except Exception as exc:
            logger.warning("Gemini Robotics-ER unavailable (%s); falling back to mock", exc)

    if choice in {"gemini_pro", "gemini"}:
        try:
            from app.vision.gemini_er import GeminiProVisionClient

            _client = GeminiProVisionClient()
            logger.info("VLM client: Gemini Pro Vision")
            return _client
        except Exception as exc:
            logger.warning("Gemini Pro unavailable (%s); falling back to mock", exc)

    if choice == "claude_vision":
        try:
            from app.vision.claude_vision import ClaudeVisionClient  # type: ignore[import-not-found]

            _client = ClaudeVisionClient()
            logger.info("VLM client: Claude Vision")
            return _client
        except Exception as exc:
            logger.warning("Claude Vision unavailable (%s); falling back to mock", exc)

    # Default + ultimate fallback.
    from app.vision.mock_vlm import MockVLMClient

    _client = MockVLMClient()
    logger.info("VLM client: Mock (deterministic fixtures)")
    return _client
