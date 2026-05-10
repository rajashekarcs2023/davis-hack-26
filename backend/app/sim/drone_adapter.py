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

    async def reset_to_launchpad(self) -> bool:
        """Teleport the drone back to the spawn launch pad (~8 m AGL).

        Used at the start of dispatch_drone_to_zone so every run begins
        with the drone grounded, which guarantees a visible takeoff beat
        regardless of where the previous run left it. The reset is an
        instantaneous teleport (no physical motion), then we sleep
        briefly so the new state propagates back through the WS state
        push before the planner reads altAgl.

        Returns True if the reset was acknowledged, False otherwise. We
        DON'T raise on failure — the dispatch will still work, the
        takeoff beat just won't be as dramatic.
        """
        ok = await self.post_action_raw("reset", 0.0)
        if not ok:
            logger.info("drone reset_to_launchpad failed — continuing anyway")
            return False
        # Wait for the WS state push (every 100ms) to deliver the new
        # post-teleport altAgl. Two pushes is enough to be safe.
        await asyncio.sleep(0.3)
        return True

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
        target_alt_agl: float = 22.0,
    ) -> list[DroneAction]:
        """Build a safe action sequence to get the drone to a lat/lon at a target AGL.

        Heuristic, not a real motion planner. Good enough for a 4×4 field demo.

        Mission profile (always in this order):
          1. TAKEOFF      — ascend from current altitude to CRUISE_ALT_AGL
                            (~50 m). On a fresh page load the drone spawns
                            at 8 m AGL so this is a clear, punchy liftoff;
                            on subsequent runs (drone already up) it's a
                            no-op or short trim ascent.
          2. HEADING      — rotate to face the target zone if off-bearing.
          3. CRUISE       — forward chunks until ~over the zone.
          4. INSPECT      — descend from cruise alt to target_alt_agl
                            (default 22 m AGL) for the close vantage.
          5. SCAN         — left-then-right lateral strafe so the drone
                            reads as "scanning the zone" instead of just
                            hovering.

        All within the safety envelope: AGL stays in [8 m, 80 m] so the
        guard never trips. Magnitudes are tuned just under cap for big,
        readable motion (0.85-0.95).
        """
        state = await self.get_state()
        if state.lat is None or state.lon is None:
            # Sim not connected — emit a defensive plan that just hovers in place.
            logger.warning("drone state unavailable; emitting hover plan")
            return [DroneAction(action="ascend", magnitude=0.1)]

        # Cruise altitude where the forward traverse happens. Below the
        # 80 m safety ceiling, well above the 8 m floor.
        CRUISE_ALT_AGL = 50.0
        ALT_MAG = 0.95
        ALT_M_PER_CHUNK = 14.0  # `ascend|descend 1.0` ≈ 14 m vertical
        FORWARD_MAG = 0.85
        FORWARD_M_PER_CHUNK = 18.0

        plan: list[DroneAction] = []
        cur_alt = state.altAgl or 0.0

        # 1. TAKEOFF — climb from current altitude to cruise. On a fresh
        #    page load (cur_alt ≈ 8 m) this is 3 ascend chunks ≈ 42 m of
        #    visible vertical travel; on subsequent runs (cur_alt ≈ 22 m
        #    after the previous descend) it's 2 chunks. Either way the
        #    dispatch starts with a clear "rising up" beat that reads as
        #    a takeoff.
        takeoff_delta = CRUISE_ALT_AGL - cur_alt
        if takeoff_delta > 5.0:
            takeoff_chunks = max(1, int(round(takeoff_delta / ALT_M_PER_CHUNK)))
            for _ in range(takeoff_chunks):
                plan.append(DroneAction(action="ascend", magnitude=ALT_MAG))

        # 2. HEADING — rotate to face the target zone (only if meaningfully off-bearing).
        bearing_deg = _bearing(state.lat, state.lon, target_lat, target_lon)
        heading = state.heading or 0.0
        delta = ((bearing_deg - heading + 540.0) % 360.0) - 180.0  # signed [-180,180]
        if abs(delta) > 5.0:
            magnitude = min(0.65, abs(delta) / 180.0)  # 1.0 ~= 90deg per spec
            plan.append(
                DroneAction(
                    action="rotate_cw" if delta > 0 else "rotate_ccw",
                    magnitude=round(magnitude, 2),
                )
            )

        # 3. CRUISE — forward chunks until ~over the zone. Distance-scaled
        #    so the drone visibly traverses most of the route. With
        #    `forward 0.85` (1.7 s key-hold) it clears ~18 m per chunk;
        #    capped at 4 chunks (72 m) to leave budget for inspect + scan.
        dist_m = _haversine_m(state.lat, state.lon, target_lat, target_lon)
        forward_chunks = max(1, int(round(dist_m / FORWARD_M_PER_CHUNK)))
        forward_chunks = min(4, forward_chunks)
        for _ in range(forward_chunks):
            plan.append(DroneAction(action="forward", magnitude=FORWARD_MAG))

        # 4. INSPECT descent — drop from cruise to target_alt_agl for the
        #    close vantage. Big punchy chunks so the descent reads on
        #    camera as "coming down for a closer look".
        inspect_delta = target_alt_agl - CRUISE_ALT_AGL  # negative
        if abs(inspect_delta) > 3.0:
            inspect_chunks = max(1, int(round(abs(inspect_delta) / ALT_M_PER_CHUNK)))
            direction = "descend" if inspect_delta < 0 else "ascend"
            for _ in range(inspect_chunks):
                plan.append(DroneAction(action=direction, magnitude=0.9))

        # 5. SCAN flourish — punchy left-then-right strafe at 0.85
        #    magnitude (~16 m each direction) so the drone visibly
        #    "scans" the inspection zone. Both `left` and `right` are in
        #    the drone whitelist (see safety.py).
        if settings.safety_max_actions_per_dispatch - len(plan) >= 2:
            plan.append(DroneAction(action="left", magnitude=0.85))
            plan.append(DroneAction(action="right", magnitude=0.85))

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
