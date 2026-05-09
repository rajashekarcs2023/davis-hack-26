"""Latest-frame caches for both sims.

The DAC bridges expose `/frames` as Server-Sent Events. Rather than
re-subscribing for every VLM call, we keep one long-lived subscription per sim
and stash the latest base64 JPEG. VLM calls just grab the cached frame.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings

logger = logging.getLogger("terrascout.sim.frames")


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
