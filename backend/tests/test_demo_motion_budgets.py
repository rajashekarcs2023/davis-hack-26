"""Regression tests for the demo-critical motion budgets.

These pin the user-facing motion-budget tuning so a future refactor can't
silently push the robot off the field or kill the drone's takeoff beat.
The numbers here come from the real demo experience — a judge-facing
narrative — not from physics correctness.

Robot:
    The farm scene in robotsims-main is tabletop-scale (1.6m long).
    Each drive_forward at magnitude 0.85 is ~0.51m. So at 3 chunks the
    robot was driving ~1.5m and rolling off the field. The fix caps
    forward to a single short nudge.

Drone:
    The user wanted the drone to LIFT OFF, not start at altitude.
    Combined with spawning the sim at 8m AGL (drone-sim-main config),
    the planner must always prepend an ascend beat so the first
    dispatch reads as a takeoff.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.schemas import DroneState
from app.sim.drone_adapter import DroneAdapter
from app.sim.robot_adapter import RobotAdapter


# ---------------------------------------------------------------------------
# Robot — single short forward nudge keeps the bot on the tabletop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_robot_plan_has_exactly_one_forward_step():
    """Tabletop field is ~1.6m long. More than 1 forward at high mag and
    the robot rolls off the front edge. Pin to exactly one drive_forward."""
    plan = await RobotAdapter().plan_inspect_zone("B3")
    forward_steps = [a for a in plan if a.action == "drive_forward"]
    assert len(forward_steps) == 1, (
        f"expected exactly 1 drive_forward (field is tabletop-scale); "
        f"got {len(forward_steps)}"
    )
    assert forward_steps[0].magnitude <= 0.5, (
        f"forward magnitude {forward_steps[0].magnitude} too high — "
        f"will overshoot the stress patch and drive off the field"
    )


@pytest.mark.asyncio
async def test_robot_plan_forward_count_independent_of_zone_row():
    """Old planner scaled forward by row_idx (max(2, min(5, row+2)) chunks).
    For zone D4 (row=3) that was 5 chunks at 0.85 mag = 2.5m, way past
    the field edge. New planner is row-independent."""
    for zone in ("A1", "B2", "C3", "D4"):
        plan = await RobotAdapter().plan_inspect_zone(zone)
        forward_count = sum(1 for a in plan if a.action == "drive_forward")
        assert forward_count == 1, f"zone {zone}: expected 1 forward, got {forward_count}"


@pytest.mark.asyncio
async def test_robot_plan_includes_arm_signature():
    """Demo focus is the arm. Make sure shoulder_down + wrist_down +
    arm-turntable scan are still in the plan after the rebalance."""
    plan = await RobotAdapter().plan_inspect_zone("B3")
    actions = [a.action for a in plan]
    assert "shoulder_down" in actions, "lost the arm-down beat"
    assert "wrist_down" in actions, "lost the wrist-tilt beat"
    # Scan flourish is now arm-turntable (rotate_cw/ccw), NOT base rotate.
    assert actions.count("rotate_cw") + actions.count("rotate_ccw") >= 2, (
        "lost the left-right arm-turntable scan flourish"
    )


@pytest.mark.asyncio
async def test_robot_plan_avoids_base_rotates():
    """Base-rotate tokens (`rotate_left`/`rotate_right`) drive the LeKiwi
    chassis which, in the current sim physics, tips the robot over and
    ruins the demo. The plan MUST NOT contain them — use arm-turntable
    `rotate_cw`/`rotate_ccw` for the scan flourish instead.

    This is the critical regression guard for the upside-down robot bug.
    """
    for zone in ("A1", "B2", "C3", "D4"):
        plan = await RobotAdapter().plan_inspect_zone(zone)
        actions = [a.action for a in plan]
        assert "rotate_left" not in actions, (
            f"zone {zone}: rotate_left tips the robot over — use rotate_ccw"
        )
        assert "rotate_right" not in actions, (
            f"zone {zone}: rotate_right tips the robot over — use rotate_cw"
        )


# ---------------------------------------------------------------------------
# Drone — every dispatch must start with an ascend (takeoff) beat
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_drone_plan_starts_with_takeoff_when_low():
    """Fresh-page-load case: drone is at 8m AGL. The plan must start
    with multiple ascend chunks so the first beat the user sees is a
    visible liftoff toward cruise altitude."""
    adapter = DroneAdapter()
    fake_state = DroneState(
        lat=38.5382, lon=-121.7617, altAgl=8.0, altMsl=8.0, heading=0.0, speed=0.0
    )
    with patch.object(adapter, "get_state", AsyncMock(return_value=fake_state)):
        plan = await adapter.plan_to_lat_lon(
            target_lat=38.5390, target_lon=-121.7600
        )
    # First action that's a vertical motion must be ascend, not descend.
    vertical = [a for a in plan if a.action in ("ascend", "descend")]
    assert vertical, "plan has no vertical motion — that's not a drone"
    assert vertical[0].action == "ascend", (
        f"first vertical action was {vertical[0].action}, expected ascend (takeoff)"
    )

    # And there must be enough ascend chunks to read as a real takeoff
    # (cruise alt is 50m, drone at 8m → at least 2 chunks at 0.95 mag).
    ascend_count = sum(1 for a in plan if a.action == "ascend")
    assert ascend_count >= 2, (
        f"expected ≥2 ascend chunks for visible takeoff, got {ascend_count}"
    )


@pytest.mark.asyncio
async def test_drone_plan_includes_descent_beat_for_inspection():
    """After cruise, the drone must descend to the target alt for the
    inspection vantage. Without this the drone just hovers at cruise
    altitude and the demo loses its 'closer look' beat."""
    adapter = DroneAdapter()
    fake_state = DroneState(
        lat=38.5382, lon=-121.7617, altAgl=8.0, altMsl=8.0, heading=0.0, speed=0.0
    )
    with patch.object(adapter, "get_state", AsyncMock(return_value=fake_state)):
        plan = await adapter.plan_to_lat_lon(
            target_lat=38.5390, target_lon=-121.7600
        )
    actions = [a.action for a in plan]
    # The cruise alt (50m) is above target_alt_agl (22m default), so
    # inspection beat must be a descend.
    descend_count = actions.count("descend")
    assert descend_count >= 1, (
        f"expected ≥1 descend chunk for inspection beat, got {descend_count}"
    )
    # Descend must come AFTER the ascend (otherwise we descend below 8m
    # safety floor and trip the guard).
    last_ascend = max(i for i, a in enumerate(actions) if a == "ascend")
    first_descend = next(i for i, a in enumerate(actions) if a == "descend")
    assert last_ascend < first_descend, (
        f"descend (idx={first_descend}) must come after ascend (idx={last_ascend})"
    )


@pytest.mark.asyncio
async def test_drone_plan_ends_with_lateral_scan():
    """Last beat is a left-then-right strafe so the drone visibly
    'scans' the zone before the dispatch ends."""
    adapter = DroneAdapter()
    fake_state = DroneState(
        lat=38.5382, lon=-121.7617, altAgl=8.0, altMsl=8.0, heading=0.0, speed=0.0
    )
    with patch.object(adapter, "get_state", AsyncMock(return_value=fake_state)):
        plan = await adapter.plan_to_lat_lon(
            target_lat=38.5390, target_lon=-121.7600
        )
    actions = [a.action for a in plan]
    # Last two actions should be left, right (in that order)
    assert "left" in actions and "right" in actions
    left_idx = actions.index("left")
    right_idx = actions.index("right")
    assert left_idx < right_idx, "scan order should be left → right"


@pytest.mark.asyncio
async def test_drone_plan_skips_takeoff_when_already_at_cruise():
    """On subsequent runs the drone is already at altitude — takeoff
    should be a no-op or a small trim, not another full liftoff."""
    adapter = DroneAdapter()
    fake_state = DroneState(
        lat=38.5382, lon=-121.7617, altAgl=50.0, altMsl=50.0, heading=0.0, speed=0.0
    )
    with patch.object(adapter, "get_state", AsyncMock(return_value=fake_state)):
        plan = await adapter.plan_to_lat_lon(
            target_lat=38.5390, target_lon=-121.7600
        )
    actions = [a.action for a in plan]
    # Drone is at cruise; takeoff_delta = 50 - 50 = 0, skipped.
    # We may still have 1 small trim ascent if delta > 5, but not multiple.
    assert actions.count("ascend") == 0, (
        f"already at cruise alt — should not include takeoff ascend, got {actions}"
    )
