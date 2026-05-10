"""Latest-frame caches for both sims.

The DAC bridges expose `/frames` as Server-Sent Events. Rather than
re-subscribing for every VLM call, we keep one long-lived subscription per sim
and stash the latest base64 JPEG. VLM calls just grab the cached frame.

We also expose a `wait_for_usable_frame()` helper that gates VLM calls on a
non-black frame. Without it, the VLM occasionally analyzes a cleared canvas
(tab backgrounded, WebGL context lost, frame stream not running yet) and
emits zero evidence points — which silently kills the demo.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging

import httpx

from app.config import settings

logger = logging.getLogger("terrascout.sim.frames")


def jpeg_is_usable(b64: str | None, *, min_luma: float = 5.0) -> bool:
    """Cheap "is this frame actually a rendered scene?" check.

    Decodes the base64 JPEG, downsamples to 8x8 grayscale, and returns True
    if the average luminance is above `min_luma`. Catches:
      - empty / None caches
      - frames captured before the WebGL canvas painted (solid black)
      - frames where the sim tab was backgrounded and Chrome cleared the buffer

    Falls back to a size-based heuristic if Pillow isn't available — a JPEG
    of a real rendered scene is almost always >2 KB; a header-only black
    JPEG is typically <2 KB. Better than nothing.
    """
    if not b64:
        return False
    try:
        raw = base64.b64decode(b64)
    except Exception:  # noqa: BLE001
        return False
    if len(raw) < 256:  # not a real JPEG
        return False

    try:
        from PIL import Image  # local import keeps Pillow optional

        img = Image.open(io.BytesIO(raw)).convert("L").resize((8, 8))
        # Avoid Pillow 14's deprecation of getdata() — tobytes is forever.
        pixels = img.tobytes()
        if not pixels:
            return False
        avg = sum(pixels) / len(pixels)
        return avg > min_luma
    except Exception as exc:  # noqa: BLE001
        # If Pillow itself errors (corrupt JPEG, etc.), fall back to size.
        logger.debug("jpeg_is_usable: Pillow path failed (%s); using size heuristic", exc)
        return len(raw) > 2048


class FrameCache:
    """Long-lived SSE subscriber that keeps `latest` updated."""

    def __init__(self, base_url: str, *, fps: int = 5, name: str = "frames") -> None:
        self.base_url = base_url.rstrip("/")
        self.fps = fps
        self.name = name
        self.latest_b64: str | None = None
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name=f"frame-cache-{self.name}")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    async def wait_for_usable_frame(
        self,
        *,
        timeout_s: float = 3.0,
        poll_s: float = 0.2,
        min_luma: float = 5.0,
    ) -> str | None:
        """Block until `latest_b64` is a non-black frame, or `timeout_s` elapses.

        Returns the usable b64 frame, or None on timeout. Designed to be called
        right before a VLM analysis tool fires — gives the SSE stream a few
        hundred milliseconds to deliver a fresh frame after the drone teleports
        or the robot finishes a dispatch, so the VLM doesn't get a black canvas.
        """
        deadline = asyncio.get_event_loop().time() + timeout_s
        attempts = 0
        while True:
            attempts += 1
            frame = self.latest_b64
            if jpeg_is_usable(frame, min_luma=min_luma):
                if attempts > 1:
                    logger.info(
                        "[%s] usable frame after %d retries (~%.1fs)",
                        self.name,
                        attempts - 1,
                        (attempts - 1) * poll_s,
                    )
                return frame
            if asyncio.get_event_loop().time() >= deadline:
                logger.warning(
                    "[%s] no usable frame after %.1fs (%d polls); "
                    "VLM will receive an empty frame and emit a stub analysis. "
                    "Likely causes: sim tab backgrounded, WS bridge down, "
                    "or canvas not rendering.",
                    self.name,
                    timeout_s,
                    attempts,
                )
                return None
            await asyncio.sleep(poll_s)

    async def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                async with httpx.AsyncClient(base_url=self.base_url, timeout=None) as client:
                    async with client.stream("GET", f"/frames?fps={self.fps}") as resp:
                        resp.raise_for_status()
                        backoff = 1.0
                        async for line in resp.aiter_lines():
                            if self._stop.is_set():
                                return
                            if not line:
                                continue
                            # Drone bridge: "data: <b64>"   Robot bridge: "data:<b64>"
                            if line.startswith("data:"):
                                payload = line[5:].lstrip()
                                if payload:
                                    self.latest_b64 = payload
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.info("[%s] frame stream lost (%s); retrying in %.1fs", self.name, exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(10.0, backoff * 1.6)


_drone_cache: FrameCache | None = None
_robot_cache: FrameCache | None = None


def get_drone_frame_cache() -> FrameCache:
    global _drone_cache
    if _drone_cache is None:
        _drone_cache = FrameCache(settings.drone_sim_http, fps=5, name="drone")
    return _drone_cache


def get_robot_frame_cache() -> FrameCache:
    global _robot_cache
    if _robot_cache is None:
        _robot_cache = FrameCache(settings.robot_sim_http, fps=5, name="robot")
    return _robot_cache
