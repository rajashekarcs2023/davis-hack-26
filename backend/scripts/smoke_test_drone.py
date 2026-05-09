"""Smoke test the drone sim. Sends one action, confirms state changed.

Usage:
    cd backend
    python3 -m scripts.smoke_test_drone
"""

from __future__ import annotations

import asyncio
import sys

from app.config import settings
from app.schemas import DroneAction
from app.sim.drone_adapter import DroneAdapter
from app.sim.safety import DispatchBudget


async def main() -> int:
    drone = DroneAdapter()
    print(f"Drone HTTP: {settings.drone_sim_http}")
    if not await drone.is_alive():
        print("FAIL: drone bridge unreachable. Is api-bridge.py running?")
        return 1

    before = await drone.get_state()
    print(f"Before: lat={before.lat} lon={before.lon} altAgl={before.altAgl} heading={before.heading}")

    budget = DispatchBudget()
    actions = [DroneAction(action="forward", magnitude=0.4)]
    result = await drone.dispatch(actions, budget)
    if not result.accepted:
        print(f"FAIL: no actions accepted. rejected={result.rejected}")
        return 1

    after = await drone.get_state()
    print(f"After:  lat={after.lat} lon={after.lon} altAgl={after.altAgl} heading={after.heading}")
    print(f"Accepted: {[(a.action, a.magnitude) for a in result.accepted]}")
    print(f"Rejected: {result.rejected}")

    if before.lat == after.lat and before.lon == after.lon:
        print("WARN: drone state did not change. Check that the browser sim is open.")
        return 1

    print("OK: drone moved.")
    await drone.aclose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
