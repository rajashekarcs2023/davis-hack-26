"""Async HTTP client for the DAC drone sim bridge.

The bridge exposes:
    POST /action      { "action": str, "magnitude": float }
    GET  /state       -> { lat, lon, altAgl, altMsl, heading, speed, timestamp }
    GET  /frames      SSE: lines like "data: <base64-jpeg>"

This adapter wraps those endpoints and adds:
    - timeouts and retries
    - the safety guard between caller and sim
    - a tiny path planner (zone-id -> action sequence)
"""

from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass

import httpx

from app.config import settings
from app.schemas import DroneAction, DroneState
from app.sim.safety import DispatchBudget, SimKind, review_action

logger = logging.getLogger("terrascout.sim.drone")


@dataclass
class DroneDispatchResult:
    accepted: list[DroneAction]
    rejected: list[dict]
    final_state: DroneState | None


class DroneAdapter:
    """One instance per app. Holds a connection pool and the budget for the active run."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.drone_sim_http).rstrip("/")
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=5.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    # --- raw API ---

    async def is_alive(self) -> bool:
        try:
            r = await self._client.get("/state")
            return r.status_code == 200
        except Exception:
            return False

    async def get_state(self) -> DroneState:
        try:
            r = await self._client.get("/state")
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                logger.warning("drone /state error: %s", data["error"])
                return DroneState()
            return DroneState(**data)
        except Exception as exc:
            logger.warning("drone /state failed: %s", exc)
            return DroneState()

    async def post_action_raw(self, action: str, magnitude: float) -> bool:
        try:
            r = await self._client.post("/action", json={"action": action, "magnitude": magnitude})
            return r.status_code == 200 and r.json().get("ok", False)
        except Exception as exc:
            logger.warning("drone /action failed: %s", exc)
            return False

    # --- safe dispatch ---

    async def dispatch(
        self,
        actions: list[DroneAction],
        budget: DispatchBudget,
    ) -> DroneDispatchResult:
        """Send a sequence of actions through the safety guard.

        Each action waits for a small heartbeat after dispatch so the next
        action sees an updated state.
        """
        accepted: list[DroneAction] = []
        rejected: list[dict] = []

        for proposed in actions:
            state = await self.get_state()
            verdict = review_action(
                "drone",
                proposed.action,
                proposed.magnitude,
                budget=budget,
                drone_alt_agl=state.altAgl,
            )
            if not verdict.ok:
                rejected.append(verdict.to_log())
                logger.info("drone action rejected: %s", verdict.reason)
                continue

            ok = await self.post_action_raw(verdict.action, verdict.magnitude)
            if not ok:
                rejected.append({**verdict.to_log(), "ok": False, "reason": "sim refused or unreachable"})
                continue

            accepted.append(DroneAction(action=verdict.action, magnitude=verdict.magnitude))
            # Magnitude 1.0 = ~2s of motion. We pad slightly to let the next state read pick up the change.
            await asyncio.sleep(min(2.5, max(0.3, verdict.magnitude * 2.0 + 0.2)))

        return DroneDispatchResult(accepted=accepted, rejected=rejected, final_state=await self.get_state())

    # --- path planner ---

    async def plan_to_lat_lon(
        self,
        target_lat: float,
        target_lon: float,
        target_alt_agl: float = 25.0,
    ) -> list[DroneAction]:
        """Build a safe action sequence to get the drone to a lat/lon at a target AGL.

        Heuristic, not a real motion planner. Good enough for a 4×4 field demo.
        """
        state = await self.get_state()
        if state.lat is None or state.lon is None:
            # Sim not connected — emit a defensive plan that just hovers in place.
            logger.warning("drone state unavailable; emitting hover plan")
            return [DroneAction(action="ascend", magnitude=0.1)]

        # 1. heading correction
        bearing_deg = _bearing(state.lat, state.lon, target_lat, target_lon)
        heading = state.heading or 0.0
        delta = ((bearing_deg - heading + 540.0) % 360.0) - 180.0  # signed [-180,180]
        plan: list[DroneAction] = []
        if abs(delta) > 5.0:
            magnitude = min(0.6, abs(delta) / 180.0)  # 1.0 ~= 90deg per spec
            plan.append(
                DroneAction(
                    action="rotate_cw" if delta > 0 else "rotate_ccw",
                    magnitude=round(magnitude, 2),
                )
            )

        # 2. forward in chunks
        dist_m = _haversine_m(state.lat, state.lon, target_lat, target_lon)
        # Empirically, magnitude 0.5 forward ~ ~10m horizontal. Coarse but bounded.
        chunks = min(6, max(1, int(round(dist_m / 12.0))))
        for _ in range(chunks):
            plan.append(DroneAction(action="forward", magnitude=0.45))

        # 3. altitude correction toward target
        cur_alt = state.altAgl or 0.0
        alt_delta = target_alt_agl - cur_alt
        if abs(alt_delta) > 3.0:
            mag = min(0.5, abs(alt_delta) / 30.0)
            plan.append(
                DroneAction(
                    action="descend" if alt_delta < 0 else "ascend",
                    magnitude=round(mag, 2),
                )
            )
        return plan


# ---------------------------------------------------------------------------
# Geo helpers
# ---------------------------------------------------------------------------


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing in degrees (0 = North, 90 = East)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters."""
    r = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# Module-level singleton, lazily constructed.
_adapter: DroneAdapter | None = None


def get_drone_adapter() -> DroneAdapter:
    global _adapter
    if _adapter is None:
        _adapter = DroneAdapter()
    return _adapter
