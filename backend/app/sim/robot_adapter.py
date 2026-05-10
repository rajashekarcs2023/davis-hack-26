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

logger = logging.getLogger("agriscout.sim.robot")


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
        that we model the robot's odometry.

        Tuned for *visible, punchy* ARM motion in front of judges. The
        ground field in the robot sim is tabletop-scaled (~1.6m long,
        ~0.7m wide), so big base traversals push the robot past the
        stress patch and out of camera view. The fix: a SHORT forward
        nudge to position the wrist cam over the patch, then the demo
        spends most of its time on the arm beats — shoulder dip, wrist
        tilt, arm-turntable scan — which is what the user actually sees.

        Motion budget per dispatch:
          • drive forward         — 1 short 0.45-mag nudge (~0.27m).
                                    Was 0.85 mag × 3-5 chunks = 1.5-2.5m,
                                    which drove the robot off the field.
          • arm-down              — deep shoulder + wrist dip so the
                                    wrist cam clearly tilts toward soil
          • scan flourish         — arm turntable rotate cw/ccw with
                                    the arm down. Reads as "looking at
                                    the crop" without flipping the base.

        IMPORTANT — base-rotate tokens (`rotate_left`/`rotate_right`) are
        deliberately AVOIDED. They drive the LeKiwi base which, in the
        current sim physics, tips the robot over and ruins the demo.
        For the scan flourish we use `rotate_cw`/`rotate_ccw` which act
        on the SO101 arm turntable — same "scanning" visual, but the
        base stays planted. We also drop the column-based orientation
        rotate entirely: the robot already spawns roughly facing the
        field, so we don't need a heading beat.
        """
        # Zone format: "<row letter><col number>", e.g. "B3"
        # (Kept for parity with the docstring, not currently used now
        # that we've dropped the column-based orientation rotate.)
        _ = zone_id  # acknowledged, no per-zone heading change

        plan: list[RobotAction] = []
        # Step 1: drive forward — ONE short nudge at 0.45 mag (~0.27m).
        # Just enough to bring the wrist cam over the stress patch (which
        # sits at z=-0.4 in the farm scene, with the robot starting near
        # z=0.5). After this step the robot is positioned for the arm
        # work and won't roll off the front of the field.
        plan.append(RobotAction(action="drive_forward", magnitude=0.45))

        # Step 2: arm-down for closer ground inspection — deeper drop so
        # the wrist cam clearly tilts toward the patch on camera. This is
        # the visual focus of the dispatch_ground_robot beat.
        plan.append(RobotAction(action="shoulder_down", magnitude=0.8))
        plan.append(RobotAction(action="wrist_down", magnitude=0.7))

        # Step 3: scan flourish — arm-turntable rotate (NOT base rotate)
        # so the wrist cam pans across the patch without tipping the
        # robot. `rotate_cw` and `rotate_ccw` act on the SO101 base joint
        # of the arm itself; the LeKiwi chassis stays planted.
        plan.append(RobotAction(action="rotate_ccw", magnitude=0.7))
        plan.append(RobotAction(action="rotate_cw", magnitude=0.7))

        return plan

    async def reset_pose(self) -> None:
        await self.post_action_raw("reset", 0.5)


_adapter: RobotAdapter | None = None


def get_robot_adapter() -> RobotAdapter:
    global _adapter
    if _adapter is None:
        _adapter = RobotAdapter()
    return _adapter
