"""Async HTTP client for the DAC robot sim bridge (LeKiwi + SO101).

The bridge exposes:
    POST /action      { "action": str, "magnitude": float }
    GET  /state       -> { robot, joints{}, base_pose|null, task_status, objects[], timestamp }
    GET  /frames      SSE: lines like "data:<base64-jpeg>"

We default to LeKiwi for inspections (it has the mobile base). SO101 is reserved
for arm-only manipulation experiments.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

import httpx

from app.config import settings
from app.schemas import RobotAction, RobotState
from app.sim.safety import DispatchBudget, review_action

logger = logging.getLogger("terrascout.sim.robot")


@dataclass
class RobotDispatchResult:
    accepted: list[RobotAction]
    rejected: list[dict]
    final_state: RobotState | None


class RobotAdapter:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.robot_sim_http).rstrip("/")
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

    async def get_state(self) -> RobotState:
        try:
            r = await self._client.get("/state")
            r.raise_for_status()
            return RobotState(**r.json())
        except Exception as exc:
            logger.warning("robot /state failed: %s", exc)
            return RobotState()

    async def post_action_raw(self, action: str, magnitude: float) -> bool:
        try:
            r = await self._client.post("/action", json={"action": action, "magnitude": magnitude})
            return r.status_code == 200 and r.json().get("ok", False)
        except Exception as exc:
            logger.warning("robot /action failed: %s", exc)
            return False

    # --- safe dispatch ---

    async def dispatch(
        self,
        actions: list[RobotAction],
        budget: DispatchBudget,
    ) -> RobotDispatchResult:
        accepted: list[RobotAction] = []
        rejected: list[dict] = []

        for proposed in actions:
            verdict = review_action(
                "robot",
                proposed.action,
                proposed.magnitude,
                budget=budget,
            )
            if not verdict.ok:
                rejected.append(verdict.to_log())
                continue

            ok = await self.post_action_raw(verdict.action, verdict.magnitude)
            if not ok:
                rejected.append({**verdict.to_log(), "ok": False, "reason": "sim refused or unreachable"})
                continue

            accepted.append(RobotAction(action=verdict.action, magnitude=verdict.magnitude))
            await asyncio.sleep(min(2.2, max(0.3, verdict.magnitude * 2.0 + 0.2)))

        return RobotDispatchResult(accepted=accepted, rejected=rejected, final_state=await self.get_state())

    # --- path planner ---

    async def plan_inspect_zone(self, zone_id: str) -> list[RobotAction]:
        """Translate a zone-id into a deterministic LeKiwi inspection sequence.

        Mapping is intentionally simple — zone column drives heading, zone row
        drives distance. The point is that the demo motion is reproducible, not
        that we model the robot's odometry. Replace with a real motion planner
        if the sim ever gets one.
        """
        # Zone format: "<row letter><col number>", e.g. "B3"
        col = max(1, int(zone_id[1:])) if len(zone_id) >= 2 and zone_id[1:].isdigit() else 1
        row_idx = ord(zone_id[0].upper()) - ord("A") if len(zone_id) > 0 else 1
        row_idx = max(0, row_idx)

        plan: list[RobotAction] = []
        # Step 1: orient toward the row by rotating col-1 ticks (deterministic, bounded).
        for _ in range(min(2, col - 1)):
            plan.append(RobotAction(action="rotate_left", magnitude=0.25))

        # Step 2: drive forward (more for further-down rows).
        forward_steps = max(1, min(4, row_idx + 1))
        for _ in range(forward_steps):
            plan.append(RobotAction(action="drive_forward", magnitude=0.45))

        # Step 3: arm-down for closer ground inspection.
        plan.append(RobotAction(action="shoulder_down", magnitude=0.35))
        plan.append(RobotAction(action="wrist_down", magnitude=0.3))

        return plan

    async def reset_pose(self) -> None:
        await self.post_action_raw("reset", 0.5)


_adapter: RobotAdapter | None = None


def get_robot_adapter() -> RobotAdapter:
    global _adapter
    if _adapter is None:
        _adapter = RobotAdapter()
    return _adapter
