"""POST /api/execute/demo — hardcoded end-to-end run, no LLM required.

This is the "click button, drone moves, robot moves" milestone from the
build plan. It always inspects zone B3, uses the deterministic path planners,
and produces a templated work order. Useful as:

  - a smoke test for the full sim integration
  - a demo-day fallback if Claude/Gemini are misbehaving
  - frontend's reference response while the agent is still WIP

The real agent-driven endpoint will live alongside this once the agent is wired up.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException

from app.domain.anomaly_engine import annotate_grid, classify_zone, load_field_grid
from app.domain.work_order import build_work_order
from app.schemas import (
    InspectionPlan,
    RunOutcome,
    RunStatus,
    RunSummary,
)
from app.sim.drone_adapter import get_drone_adapter
from app.sim.robot_adapter import get_robot_adapter
from app.sim.safety import DispatchBudget

logger = logging.getLogger("terrascout.api.execute")

router = APIRouter()


@router.post("/api/demo/execute", response_model=RunSummary)
async def execute_demo(zone_id: str = "B3") -> RunSummary:
    """Hardcoded full-loop run for the demo button. No LLM call."""
    grid = annotate_grid(load_field_grid())
    by_id = {z.zone_id: z for z in grid.zones}
    if zone_id not in by_id:
        raise HTTPException(status_code=404, detail=f"zone {zone_id} not found")
    zone = by_id[zone_id]

    classification = classify_zone(zone)

    plan = InspectionPlan(
        zone_id=zone.zone_id,
        likely_issue=classification.label.value.replace("_", " "),
        urgency="high" if zone.anomaly_score >= 0.6 else "medium",
        confidence=classification.confidence,
        reasoning=classification.reasoning,
        requires_human_approval=False,  # demo endpoint skips approval
    )

    run_id = f"demo-{uuid.uuid4().hex[:8]}"
    summary = RunSummary(
        run_id=run_id,
        field_id=grid.field_id,
        zone_id=zone.zone_id,
        status=RunStatus.EXECUTING,
        plan=plan,
    )

    drone = get_drone_adapter()
    robot = get_robot_adapter()
    budget = DispatchBudget()

    # 1. Drone fly-to.
    try:
        drone_plan = await drone.plan_to_lat_lon(zone.lat, zone.lon, target_alt_agl=22.0)
        drone_result = await drone.dispatch(drone_plan, budget)
        summary.tool_calls.append(
            {"tool": "dispatch_drone", "accepted": [a.model_dump() for a in drone_result.accepted]}
        )
        summary.safety_rejections.extend(drone_result.rejected)
    except Exception as exc:
        logger.exception("drone dispatch failed: %s", exc)
        summary.status = RunStatus.FAILED
        summary.outcome = RunOutcome.SIM_FAILURE
        return summary

    # 2. Ground robot inspect.
    try:
        robot_plan = await robot.plan_inspect_zone(zone.zone_id)
        robot_result = await robot.dispatch(robot_plan, budget)
        summary.tool_calls.append(
            {"tool": "dispatch_robot", "accepted": [a.model_dump() for a in robot_result.accepted]}
        )
        summary.safety_rejections.extend(robot_result.rejected)
    except Exception as exc:
        logger.exception("robot dispatch failed: %s", exc)
        summary.status = RunStatus.FAILED
        summary.outcome = RunOutcome.SIM_FAILURE
        return summary

    # 3. Build work order from satellite + (no VLM evidence in the hardcoded path).
    work_order = build_work_order(zone, plan, aerial=None, ground=None)
    summary.work_order = work_order
    summary.status = RunStatus.COMPLETED
    summary.outcome = RunOutcome.WORK_ORDER_CREATED
    return summary
