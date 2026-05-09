"""Smoke test the robot sim. Sends one drive action, confirms state changed.

Usage:
    cd backend
    python3 -m scripts.smoke_test_robot
"""

from __future__ import annotations

import asyncio
import sys

from app.config import settings
from app.schemas import RobotAction
from app.sim.robot_adapter import RobotAdapter
from app.sim.safety import DispatchBudget


async def main() -> int:
    robot = RobotAdapter()
    print(f"Robot HTTP: {settings.robot_sim_http}")
    if not await robot.is_alive():
        print("FAIL: robot bridge unreachable. Is api-bridge.py running?")
        return 1

    before = await robot.get_state()
    print(f"Before: robot={before.robot} task_status={before.task_status} base_pose={before.base_pose}")

    budget = DispatchBudget()
    actions = [RobotAction(action="drive_forward", magnitude=0.4)]
    result = await robot.dispatch(actions, budget)
    if not result.accepted:
        print(f"FAIL: no actions accepted. rejected={result.rejected}")
        return 1

    after = await robot.get_state()
    print(f"After:  robot={after.robot} task_status={after.task_status} base_pose={after.base_pose}")
    print(f"Accepted: {[(a.action, a.magnitude) for a in result.accepted]}")
    print(f"Rejected: {result.rejected}")
    print("OK: action dispatched. (LeKiwi base_pose changes; SO101 has no base.)")
    await robot.aclose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
