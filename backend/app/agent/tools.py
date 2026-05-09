"""Tool definitions for the Claude agent.

Each tool exports two things:
    1. An Anthropic tool schema (input_schema JSON).
    2. An async Python `execute(...)` that returns a JSON-serializable dict.

The tools are kept thin; the actual logic lives in `domain/`, `sim/`, `vision/`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.domain.anomaly_engine import (
    annotate_grid,
    classify_zone,
    load_field_grid,
)
from app.domain.work_order import build_work_order
from app.schemas import (
    AerialAnalysis,
    DroneAction,
    GroundAnalysis,
    InspectionPlan,
    RobotAction,
    Zone,
)
from app.sim.drone_adapter import get_drone_adapter
from app.sim.frame_grabber import get_drone_frame_cache, get_robot_frame_cache
from app.sim.robot_adapter import get_robot_adapter
from app.sim.safety import DispatchBudget
from app.vision import get_vlm_client

logger = logging.getLogger("terrascout.agent.tools")


# ---------------------------------------------------------------------------
# Tool schemas (Anthropic Messages API tool-use format)
# ---------------------------------------------------------------------------


TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "fetch_anomaly",
        "description": "Read the satellite-derived anomaly metadata for a given field zone, plus its rule-based classification.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string", "description": "Zone identifier, e.g. 'B3'."}},
            "required": ["zone_id"],
        },
    },
    {
        "name": "draft_inspection_plan",
        "description": "Convert the anomaly + classification into an InspectionPlan. Returns the plan JSON. Does NOT execute anything.",
        "input_schema": {
            "type": "object",
            "properties": {
                "zone_id": {"type": "string"},
                "likely_issue": {"type": "string"},
                "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "reasoning": {"type": "string"},
            },
            "required": ["zone_id", "likely_issue", "urgency", "confidence", "reasoning"],
        },
    },
    {
        "name": "request_human_approval",
        "description": "Block the run until a human approves or rejects the plan via /api/approve. Returns the operator decision.",
        "input_schema": {
            "type": "object",
            "properties": {
                "run_id": {"type": "string"},
                "summary": {"type": "string", "description": "Human-readable summary the operator will see."},
            },
            "required": ["run_id", "summary"],
        },
    },
    {
        "name": "dispatch_drone_to_zone",
        "description": "Fly the drone toward a zone's coordinates and hover for a closer look. Returns accepted/rejected actions and final state.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string"}, "target_alt_agl_m": {"type": "number", "default": 22.0}},
            "required": ["zone_id"],
        },
    },
    {
        "name": "vlm_analyze_aerial",
        "description": "Pull the latest drone FPV frame and ask the VLM whether the satellite-flagged anomaly is visible.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string"}},
            "required": ["zone_id"],
        },
    },
    {
        "name": "dispatch_ground_robot",
        "description": "Drive the LeKiwi robot to inspect the zone close-up. Returns accepted/rejected actions and final state.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string"}},
            "required": ["zone_id"],
        },
    },
    {
        "name": "vlm_analyze_ground",
        "description": "Pull the latest robot wrist-cam frame and ask the VLM what visible evidence is present.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string"}},
            "required": ["zone_id"],
        },
    },
    {
        "name": "create_work_order",
        "description": "Produce the final farmer-facing work order from gathered evidence. Always call this last.",
        "input_schema": {
            "type": "object",
            "properties": {
                "zone_id": {"type": "string"},
                "issue": {"type": "string"},
                "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                "extra_evidence": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["zone_id", "issue", "priority"],
        },
    },
]


# ---------------------------------------------------------------------------
# RunContext keeps cross-tool state (VLM analyses, dispatch budget, etc.)
# ---------------------------------------------------------------------------


class RunContext:
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self.budget = DispatchBudget()
        self.aerial: AerialAnalysis | None = None
        self.ground: GroundAnalysis | None = None
        self.plan: InspectionPlan | None = None
        self.zone: Zone | None = None
        self.tool_log: list[dict[str, Any]] = []
        self.safety_rejections: list[dict[str, Any]] = []
        # Approval gate: agent waits on this future until /api/approve resolves it.
        self.approval_future: asyncio.Future[dict[str, Any]] | None = None

    def append_tool(self, tool: str, args: dict, result: Any) -> None:
        self.tool_log.append({"tool": tool, "args": args, "result": result})


# Shared registry of currently-pending approval gates, keyed by run_id, so the
# /api/approve endpoint can resolve the right one.
_pending_approvals: dict[str, asyncio.Future[dict[str, Any]]] = {}


def submit_approval(run_id: str, decision: dict[str, Any]) -> bool:
    """Called by /api/approve. Returns True if a run was waiting for this."""
    future = _pending_approvals.pop(run_id, None)
    if future is None or future.done():
        return False
    future.set_result(decision)
    return True


def pending_approval_run_ids() -> list[str]:
    """Run-ids currently blocked inside `request_human_approval`. Used by the
    e2e_demo --auto-approve watcher and by status endpoints / UI."""
    return [rid for rid, fut in _pending_approvals.items() if not fut.done()]


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


def _zone_or_404(zone_id: str) -> Zone:
    grid = annotate_grid(load_field_grid())
    by_id = {z.zone_id: z for z in grid.zones}
    if zone_id not in by_id:
        raise ValueError(f"unknown zone {zone_id}")
    return by_id[zone_id]


async def _execute(tool: str, args: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    if tool == "fetch_anomaly":
        zone = _zone_or_404(args["zone_id"])
        ctx.zone = zone
        cls = classify_zone(zone)
        return {
            "zone": zone.model_dump(mode="json"),
            "classification": {
                "label": cls.label.value,
                "confidence": round(cls.confidence, 3),
                "reasoning": cls.reasoning,
            },
        }

    if tool == "draft_inspection_plan":
        plan = InspectionPlan(
            zone_id=args["zone_id"],
            likely_issue=args["likely_issue"],
            urgency=args["urgency"],
            confidence=float(args["confidence"]),
            reasoning=args["reasoning"],
            requires_human_approval=True,
        )
        ctx.plan = plan
        return plan.model_dump(mode="json")

    if tool == "request_human_approval":
        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        ctx.approval_future = future
        _pending_approvals[ctx.run_id] = future
        try:
            decision = await asyncio.wait_for(future, timeout=120.0)
            return decision
        except asyncio.TimeoutError:
            _pending_approvals.pop(ctx.run_id, None)
            return {"approved": False, "reason": "approval timeout (120s)"}

    if tool == "dispatch_drone_to_zone":
        zone = _zone_or_404(args["zone_id"])
        target_alt = float(args.get("target_alt_agl_m", 22.0))
        drone = get_drone_adapter()
        plan = await drone.plan_to_lat_lon(zone.lat, zone.lon, target_alt_agl=target_alt)
        result = await drone.dispatch(plan, ctx.budget)
        ctx.safety_rejections.extend(result.rejected)
        return {
            "accepted": [a.model_dump() for a in result.accepted],
            "rejected": result.rejected,
            "final_state": result.final_state.model_dump(mode="json") if result.final_state else None,
        }

    if tool == "vlm_analyze_aerial":
        zone = _zone_or_404(args["zone_id"])
        cache = get_drone_frame_cache()
        frame = cache.latest_b64 or ""
        vlm = get_vlm_client()
        analysis = await vlm.analyze_aerial(frame, zone)
        ctx.aerial = analysis
        return analysis.model_dump(mode="json")

    if tool == "dispatch_ground_robot":
        zone = _zone_or_404(args["zone_id"])
        robot = get_robot_adapter()
        plan = await robot.plan_inspect_zone(zone.zone_id)
        result = await robot.dispatch(plan, ctx.budget)
        ctx.safety_rejections.extend(result.rejected)
        return {
            "accepted": [a.model_dump() for a in result.accepted],
            "rejected": result.rejected,
            "final_state": result.final_state.model_dump(mode="json") if result.final_state else None,
        }

    if tool == "vlm_analyze_ground":
        zone = _zone_or_404(args["zone_id"])
        cache = get_robot_frame_cache()
        frame = cache.latest_b64 or ""
        vlm = get_vlm_client()
        analysis = await vlm.analyze_ground(frame, zone)
        ctx.ground = analysis
        return analysis.model_dump(mode="json")

    if tool == "create_work_order":
        zone = _zone_or_404(args["zone_id"])
        plan = ctx.plan or InspectionPlan(
            zone_id=zone.zone_id,
            likely_issue=args["issue"],
            urgency=args["priority"],
            confidence=0.7,
            reasoning="(plan not drafted; created at work-order time)",
            requires_human_approval=True,
        )
        wo = build_work_order(zone, plan, ctx.aerial, ctx.ground)
        # Append any extra evidence the agent passed in.
        for line in args.get("extra_evidence", []) or []:
            if isinstance(line, str) and line.strip():
                wo.evidence.append(line.strip())
        return {"work_order": wo.model_dump(mode="json")}

    raise ValueError(f"unknown tool: {tool}")


async def execute_tool(tool: str, args: dict[str, Any], ctx: RunContext) -> str:
    """Public entrypoint. Always returns a JSON string (what Anthropic expects in tool_result)."""
    try:
        result = await _execute(tool, args or {}, ctx)
    except Exception as exc:
        logger.exception("tool %s failed: %s", tool, exc)
        result = {"error": str(exc)}
    ctx.append_tool(tool, args or {}, result)
    return json.dumps(result, default=str)


__all__ = [
    "TOOL_SCHEMAS",
    "RunContext",
    "execute_tool",
    "submit_approval",
    "pending_approval_run_ids",
]


# Helper used by tests
def _agent_action_to_dispatch(actions: list[dict[str, Any]], kind: str) -> list:
    if kind == "drone":
        return [DroneAction(**a) for a in actions]
    return [RobotAction(**a) for a in actions]
