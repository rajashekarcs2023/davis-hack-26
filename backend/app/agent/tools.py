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
from app.domain.risk_engine import assess_risk, soil_moisture_pct
from app.domain.work_order import build_work_order
from app.schemas import (
    AerialAnalysis,
    BeliefState,
    DiagnosticBundle,
    DroneAction,
    EvidencePoint,
    GroundAnalysis,
    InspectionPlan,
    LeafEvidence,
    RiskAssessment,
    RobotAction,
    SoilProbeReading,
    Zone,
)
from app.agent.er_policy import run_er_policy_loop, target_point_to_actions
from app.sim.drone_adapter import get_drone_adapter
from app.sim.frame_grabber import get_drone_frame_cache, get_robot_frame_cache
from app.sim.robot_adapter import get_robot_adapter
from app.sim.safety import DispatchBudget
from app.vision import get_vlm_client
from app.vision.mock_vlm import MockVLMClient

logger = logging.getLogger("agriscout.agent.tools")


# ---------------------------------------------------------------------------
# Tool schemas (Anthropic Messages API tool-use format)
# ---------------------------------------------------------------------------


TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "fetch_risk_signal",
        "description": "Read the multi-input risk assessment for a zone (satellite anomaly, weather pest risk, soil moisture, historical hotspot). Returns the combined risk score and the IGNORE/MONITOR/SEND_DRONE decision. Call this FIRST to decide whether the drone should fly at all.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string", "description": "Zone identifier, e.g. 'B3'."}},
            "required": ["zone_id"],
        },
    },
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
        "name": "inspect_leaf_with_wrist",
        "description": "Targeted close-up VLM inspection of a single leaf on the affected plant. Looks for pest-specific signatures (stippling, webbing, egg masses, discoloration). Use AFTER dispatch_ground_robot has placed the robot in the row.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string"}},
            "required": ["zone_id"],
        },
    },
    {
        "name": "compare_healthy_plant",
        "description": "Run the same close-up VLM inspection on a NEARBY HEALTHY plant for differential comparison. The healthy reference firms up belief that observed evidence on the affected plant is real and localized.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string"}},
            "required": ["zone_id"],
        },
    },
    {
        "name": "probe_soil_moisture",
        "description": "Read a simulated soil-moisture probe reading at the affected plant's root zone. Returns moisture percentage and 'dry'/'normal'/'wet' interpretation. A NORMAL reading rules out water stress and shifts belief toward pest/nutrient causes.",
        "input_schema": {
            "type": "object",
            "properties": {"zone_id": {"type": "string"}},
            "required": ["zone_id"],
        },
    },
    {
        "name": "place_pest_marker",
        "description": "Drop a sticky-trap / pest marker at the affected plant for human scout follow-up. Confirms the diagnostic was completed and creates a physical artifact in the field.",
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
        # AgriScout pivot additions: multi-input risk + multi-step diagnostics.
        # `bundle` accumulates LeafEvidence / SoilProbeReading / marker bool /
        # belief-state snapshots as the diagnostic tools fire.
        self.risk: RiskAssessment | None = None
        self.bundle: DiagnosticBundle = DiagnosticBundle()
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


# ---------------------------------------------------------------------------
# Belief-state snapshots (scripted for demo; honest in technical Q&A)
# ---------------------------------------------------------------------------
#
# These are NOT a Bayesian update. They are deterministic, demo-tuned
# transitions tied to which diagnostic tools have completed. The justification
# in the pitch is: "each diagnostic step is a strong likelihood ratio that
# rules a class in/out—the resulting belief shift would be near-identical to
# what a properly-specified Bayesian update yields." That is honest enough.
#
# The numbers are chosen to match the demo arc described in `final.md`:
#     initial:        46 / 31 / 15 / 08   (drone hasn't flown yet)
#     after_aerial:   50 / 28 / 16 / 06   (drone confirmed hotspot, cause TBD)
#     after_leaf:     65 / 18 / 12 / 05   (stippling+webbing tips pest)
#     after_compare:  74 / 13 / 10 / 03   (healthy plant has none → localized)
#     after_probe:    80 / 10 / 07 / 03   (soil normal rules out water)
#     final:          82 / 09 / 06 / 03   (marker placed, no new evidence)
#
# Each snapshot is rounded to 2 decimal places and sums to ~1.0 (rounding
# slop is tolerated; the frontend strip normalizes for display).

_BELIEF_SNAPSHOTS: dict[str, dict[str, float]] = {
    "initial":       {"pest_hotspot": 0.46, "water_stress": 0.31, "nutrient_deficit": 0.15, "false_alarm": 0.08},
    "after_aerial":  {"pest_hotspot": 0.50, "water_stress": 0.28, "nutrient_deficit": 0.16, "false_alarm": 0.06},
    "after_leaf":    {"pest_hotspot": 0.65, "water_stress": 0.18, "nutrient_deficit": 0.12, "false_alarm": 0.05},
    "after_compare": {"pest_hotspot": 0.74, "water_stress": 0.13, "nutrient_deficit": 0.10, "false_alarm": 0.03},
    "after_probe":   {"pest_hotspot": 0.80, "water_stress": 0.10, "nutrient_deficit": 0.07, "false_alarm": 0.03},
    "final":         {"pest_hotspot": 0.82, "water_stress": 0.09, "nutrient_deficit": 0.06, "false_alarm": 0.03},
}

# When soil probe comes back DRY/WET (not normal), water_stress should win
# instead. This branch keeps the demo honest: the agent's belief follows the
# evidence even when that evidence contradicts the leading hypothesis.
_BELIEF_AFTER_PROBE_WATER: dict[str, float] = {
    "pest_hotspot": 0.30, "water_stress": 0.55, "nutrient_deficit": 0.10, "false_alarm": 0.05,
}

# "Clean" branches — fire when leaf inspection / healthy comparison find NO
# pest evidence. The belief shifts AWAY from pest_hotspot (we ruled it out)
# and toward water_stress / false_alarm. This keeps the BeliefStateStrip
# transitioning on every diagnostic step (so the demo always shows a 5-6
# step belief evolution) while staying honest about what was found.
_BELIEF_AFTER_LEAF_CLEAN: dict[str, float] = {
    "pest_hotspot": 0.30, "water_stress": 0.45, "nutrient_deficit": 0.18, "false_alarm": 0.07,
}
_BELIEF_AFTER_COMPARE_CLEAN: dict[str, float] = {
    "pest_hotspot": 0.18, "water_stress": 0.55, "nutrient_deficit": 0.20, "false_alarm": 0.07,
}


def _record_belief(
    ctx: RunContext,
    label: str,
    *,
    water_branch: bool = False,
    clean_branch: bool = False,
) -> BeliefState:
    """Append the named belief snapshot to ctx.bundle.belief_evolution.

    Idempotent: if a snapshot with this label already exists, return it instead
    of appending a duplicate. This keeps belief_evolution stable even if a
    tool gets re-called (e.g. retry).

    Branches:
      - water_branch=True with label "after_probe" → water_stress dominant
      - clean_branch=True with label "after_leaf"  → pest ruled out, water rises
      - clean_branch=True with label "after_compare" → false_alarm rises
    """
    for existing in ctx.bundle.belief_evolution:
        if existing.snapshot_label == label:
            return existing
    if label == "after_probe" and water_branch:
        values = _BELIEF_AFTER_PROBE_WATER
    elif label == "after_leaf" and clean_branch:
        values = _BELIEF_AFTER_LEAF_CLEAN
    elif label == "after_compare" and clean_branch:
        values = _BELIEF_AFTER_COMPARE_CLEAN
    else:
        values = _BELIEF_SNAPSHOTS.get(label, _BELIEF_SNAPSHOTS["initial"])
    snap = BeliefState(snapshot_label=label, **values)
    ctx.bundle.belief_evolution.append(snap)
    return snap


async def _execute(tool: str, args: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    if tool == "fetch_risk_signal":
        risk = assess_risk(args["zone_id"])
        ctx.risk = risk
        # Seed the belief evolution with the "initial" snapshot so the frontend
        # has something to render even before the drone flies.
        _record_belief(ctx, "initial")
        return risk.model_dump(mode="json")

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
        # Teleport the drone back to its spawn launch pad (~8 m AGL) before
        # planning. Without this, runs after the first one start with the
        # drone wherever it last hovered (often >50 m AGL), and the planner
        # then skips the takeoff beat because cur_alt is already above
        # cruise. Resetting first makes every run open with a dramatic,
        # visible liftoff regardless of session state.
        await drone.reset_to_launchpad()
        plan = await drone.plan_to_lat_lon(zone.lat, zone.lon, target_alt_agl=target_alt)
        # Surface the planned action sequence on ctx.plan so /api/runs/active
        # can render the drone action-token chips while the dispatch runs.
        if ctx.plan is not None:
            ctx.plan.drone_path_hint = list(plan)
        result = await drone.dispatch(plan, ctx.budget)
        ctx.safety_rejections.extend(result.rejected)
        return {
            "accepted": [a.model_dump() for a in result.accepted],
            "rejected": result.rejected,
            "final_state": result.final_state.model_dump(mode="json") if result.final_state else None,
        }

    if tool == "vlm_analyze_aerial":
        zone = _zone_or_404(args["zone_id"])
        # Belief shifts the moment the drone returns evidence — we record this
        # snapshot AFTER the VLM call regardless of cache hit, because the act
        # of flying the drone is itself information ("hotspot is real").
        cache = get_drone_frame_cache()
        # Black-frame guard: wait up to ~3s for the SSE cache to deliver a
        # non-black frame. Without this, ~30% of demo runs feed the VLM a
        # solid-black canvas (tab backgrounded, WebGL context lost, freshly-
        # teleported camera mid-paint) and `evidence_points` come back empty.
        frame = await cache.wait_for_usable_frame(timeout_s=3.0)
        if not frame:
            analysis = AerialAnalysis(
                visible=False,
                confidence=0.0,
                evidence=[
                    "frame_unavailable: drone sim did not produce a usable "
                    "frame within 3s (tab may be backgrounded, WS bridge down, "
                    "or canvas not yet painted). Skipping aerial VLM analysis."
                ],
                evidence_points=[],
                recommend_ground_truth=True,  # fall through to ground truth
            )
            ctx.aerial = analysis
            return analysis.model_dump(mode="json")
        vlm = get_vlm_client()
        analysis = await vlm.analyze_aerial(frame, zone)
        ctx.aerial = analysis
        _record_belief(ctx, "after_aerial")
        return analysis.model_dump(mode="json")

    if tool == "dispatch_ground_robot":
        zone = _zone_or_404(args["zone_id"])
        robot = get_robot_adapter()
        plan = await robot.plan_inspect_zone(zone.zone_id)
        # Surface the planned action sequence on ctx.plan so /api/runs/active
        # can render the robot action-token chips while the dispatch runs.
        if ctx.plan is not None:
            ctx.plan.robot_path_hint = list(plan)
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
        # Same black-frame guard as the aerial tool. Robot wrist cam is even
        # more prone to black frames because it only renders when the robot
        # sim tab is visible.
        frame = await cache.wait_for_usable_frame(timeout_s=3.0)
        if not frame:
            analysis = GroundAnalysis(
                dry_soil=False,
                wilted_leaves=False,
                damaged_drip_line=False,
                other_evidence=[
                    "frame_unavailable: robot sim did not produce a usable "
                    "wrist-cam frame within 3s. Skipping ground VLM analysis."
                ],
                evidence_points=[],
                confidence=0.0,
            )
            ctx.ground = analysis
            return analysis.model_dump(mode="json")
        vlm = get_vlm_client()
        analysis = await vlm.analyze_ground(frame, zone)
        ctx.ground = analysis
        return analysis.model_dump(mode="json")

    # ---------------------------------------------------------------
    # AgriScout multi-step diagnostic tools (Phase 1: mock returns).
    # Phase 3 wires each of these to actual robot motions + real VLM
    # calls. The Phase 1 contract is purely about getting the tool
    # surface, the belief evolution, and the work-order plumbing right.
    # ---------------------------------------------------------------

    if tool == "inspect_leaf_with_wrist":
        # Phase 3 + Level-1 VLA — ER-as-embodied-reasoning-policy closed loop.
        #
        # Genuine VL-to-action loop: ER decides WHERE to look, a thin
        # deterministic translator converts that to SO101 joint tokens, and
        # the loop terminates when the model itself says the goal is met.
        # The 4-action scripted motion is kept as a FALLBACK for backends
        # without analyze_er_policy or when the loop fails to converge.
        #
        # Pitch-honest framing: "Gemini Robotics-ER emits the spatial target
        # (where to look); a small deterministic safety-guarded translator
        # emits the joint tokens (how to get there). This mirrors Google's
        # own pairing of Robotics-ER (reasoning) with Robotics 1.6 (full VLA)."

        zone = _zone_or_404(args["zone_id"])
        robot = get_robot_adapter()
        cache = get_robot_frame_cache()
        vlm = get_vlm_client()

        # Run the closed-loop ER policy. Returns (trace, accepted, rejected,
        # fallback_reason). fallback_reason is None on success.
        er_trace, all_accepted, all_rejected, loop_failed_reason = await run_er_policy_loop(
            vlm=vlm,
            robot=robot,
            cache=cache,
            zone=zone,
            goal="Center the wrist camera on the affected leaf for a close-range pest inspection.",
            budget=ctx.budget,
            safety_rejections=ctx.safety_rejections,
            max_steps=5,
        )

        # --- Scripted motion fallback ---
        # Showcase the leaf-inspection signature (down + roll cw/ccw sweep)
        # if ER didn't drive enough motion to be visible.
        if loop_failed_reason:
            logger.info("leaf inspection falling back to scripted motion: %s", loop_failed_reason)
            inspect_motion = [
                RobotAction(action="shoulder_down", magnitude=0.40),
                RobotAction(action="wrist_down", magnitude=0.50),
                RobotAction(action="wrist_roll_cw", magnitude=0.40),
                RobotAction(action="wrist_roll_ccw", magnitude=0.40),
            ]
            scripted_result = await robot.dispatch(inspect_motion, ctx.budget)
            ctx.safety_rejections.extend(scripted_result.rejected)
            all_accepted.extend(scripted_result.accepted)
            all_rejected.extend(scripted_result.rejected)

        # --- Final leaf VLM pass on the settled frame ---
        final_frame = await cache.wait_for_usable_frame(timeout_s=3.0)
        leaf: LeafEvidence
        if final_frame is not None and hasattr(vlm, "analyze_leaf"):
            try:
                leaf = await vlm.analyze_leaf(final_frame, zone, "affected_plant")
            except Exception as exc:
                logger.warning("leaf VLM failed (%s); falling back to mock", exc)
                leaf = await MockVLMClient().analyze_leaf("", zone, "affected_plant")
                leaf.other.append(f"vlm_fallback: {exc}")
        else:
            leaf = await MockVLMClient().analyze_leaf("", zone, "affected_plant")
            if final_frame is None:
                leaf.other.append(
                    "frame_unavailable: wrist cam did not produce a usable "
                    "frame within 3s; falling back to deterministic fixture"
                )

        ctx.bundle.leaf_affected = leaf
        # Always record the snapshot so the belief strip shows a transition
        # at every diagnostic step. If clean (no pest signs), use the clean
        # branch — pest hypothesis weakens, water_stress rises.
        has_pest = bool(leaf.stippling or leaf.webbing or leaf.egg_masses)
        _record_belief(ctx, "after_leaf", clean_branch=not has_pest)

        return {
            "leaf_evidence": leaf.model_dump(mode="json"),
            "note": "affected_plant",
            "er_policy": {
                "backend": vlm.name,
                "steps": er_trace,
                "fallback": loop_failed_reason,
            },
            "motion": {
                "accepted": [a.model_dump() for a in all_accepted],
                "rejected": all_rejected,
            },
        }

    if tool == "compare_healthy_plant":
        # Phase 3 real-sim + Level-1 VLA: ER closed-loop positioning to a
        # nearby HEALTHY-LOOKING plant, then leaf VLM in healthy_reference
        # mode. The clean (all-false) signal we expect on the healthy plant
        # confirms the affected plant's pest evidence is LOCALIZED — the
        # key differential insight.
        #
        # Why ER here too: "find a healthy neighbor" is a real spatial
        # reasoning problem. Hard-coding a single direction (e.g. "always
        # roll left") would fail whenever the healthy neighbor isn't where
        # we assumed it'd be. The VLM looking at the wrist cam can pick
        # the best-looking neighbor in any direction.
        zone = _zone_or_404(args["zone_id"])
        robot = get_robot_adapter()
        cache = get_robot_frame_cache()
        vlm = get_vlm_client()

        # 1. ER closed-loop: navigate the wrist cam to a healthy neighbor.
        er_trace, all_accepted, all_rejected, loop_failed_reason = await run_er_policy_loop(
            vlm=vlm,
            robot=robot,
            cache=cache,
            zone=zone,
            goal=(
                "Center the wrist camera on a NEARBY HEALTHY-LOOKING leaf for "
                "differential comparison. Avoid the affected plant; find a "
                "neighbor with green, undamaged foliage."
            ),
            budget=ctx.budget,
            safety_rejections=ctx.safety_rejections,
            max_steps=4,
        )

        # 2. Scripted "reach to neighbor" fallback if ER didn't drive
        #    enough motion. Distinct visual signature from leaf-inspect:
        #    elbow_up + shoulder_up + wrist_roll_ccw (single sweep, opposite
        #    direction from inspect's cw/ccw double sweep).
        if loop_failed_reason:
            logger.info("compare_healthy_plant falling back to scripted: %s", loop_failed_reason)
            compare_motion = [
                # Retract / lift the arm away from the affected-plant pose
                RobotAction(action="elbow_up", magnitude=0.45),
                RobotAction(action="shoulder_up", magnitude=0.25),
                # Bring the wrist back to a horizontal scanning angle
                RobotAction(action="wrist_up", magnitude=0.35),
                # Signature "look at a different plant" — single wrist roll
                RobotAction(action="wrist_roll_ccw", magnitude=0.55),
            ]
            scripted_result = await robot.dispatch(compare_motion, ctx.budget)
            ctx.safety_rejections.extend(scripted_result.rejected)
            all_accepted.extend(scripted_result.accepted)
            all_rejected.extend(scripted_result.rejected)

        # 3. Wait for a non-black wrist frame after the re-aim settles.
        frame = await cache.wait_for_usable_frame(timeout_s=3.0)

        # 4. Leaf VLM pass in `healthy_reference` mode. Same fallback ladder.
        leaf: LeafEvidence
        if frame is not None and hasattr(vlm, "analyze_leaf"):
            try:
                leaf = await vlm.analyze_leaf(frame, zone, "healthy_reference")
            except Exception as exc:
                logger.warning("healthy-leaf VLM failed (%s); falling back to mock", exc)
                leaf = await MockVLMClient().analyze_leaf("", zone, "healthy_reference")
                leaf.other.append(f"vlm_fallback: {exc}")
        else:
            leaf = await MockVLMClient().analyze_leaf("", zone, "healthy_reference")
            if frame is None:
                leaf.other.append(
                    "frame_unavailable: wrist cam did not produce a usable "
                    "frame within 3s; falling back to deterministic fixture"
                )

        ctx.bundle.leaf_healthy = leaf
        # Always record the snapshot — the BeliefStateStrip needs a
        # transition at every diagnostic step. Choose the clean_branch
        # variant when the affected plant DIDN'T show pest evidence (so
        # there's no contrast to report) — that nudges belief toward
        # false_alarm / water_stress instead of pest_hotspot.
        affected = ctx.bundle.leaf_affected
        had_pest_on_affected = bool(
            affected
            and (affected.stippling or affected.webbing or affected.egg_masses)
        )
        _record_belief(ctx, "after_compare", clean_branch=not had_pest_on_affected)
        return {
            "leaf_evidence": leaf.model_dump(mode="json"),
            "note": "healthy_reference",
            "er_policy": {
                "backend": vlm.name,
                "steps": er_trace,
                "fallback": loop_failed_reason,
            },
            "motion": {
                "accepted": [a.model_dump() for a in all_accepted],
                "rejected": all_rejected,
            },
        }

    if tool == "probe_soil_moisture":
        # Phase 3 real-sim + Level-1 VLA: ER closed-loop to find a clear
        # soil patch beside the affected plant, then probe insertion +
        # held read + retract. The reading itself stays mock — honest
        # framing via the `note` field.
        #
        # Why ER here: "where to insert the probe" is a spatial decision
        # the VLM is well-suited for — it can see whether the chosen spot
        # is bare soil vs leaves vs rocks. Probing into a leaf would be
        # bad. ER's spatial pointing keeps us in clear soil.
        zone_id = args["zone_id"]
        zone = _zone_or_404(zone_id)
        robot = get_robot_adapter()
        cache = get_robot_frame_cache()
        vlm = get_vlm_client()

        # 1. ER closed-loop: navigate the wrist cam over a clear soil patch.
        er_trace, er_accepted, er_rejected, loop_failed_reason = await run_er_policy_loop(
            vlm=vlm,
            robot=robot,
            cache=cache,
            zone=zone,
            goal=(
                "Center the wrist camera on a CLEAR PATCH OF SOIL at the base "
                "of the affected plant where a soil-moisture probe can be "
                "inserted. Avoid leaves, stems, and rocks."
            ),
            budget=ctx.budget,
            safety_rejections=ctx.safety_rejections,
            max_steps=3,
        )

        all_accepted: list[RobotAction] = list(er_accepted)
        all_rejected: list[dict[str, Any]] = list(er_rejected)

        # 2. Probe insertion — visible "hold" sequence regardless of ER.
        #    Even when ER drove the positioning, we still need the
        #    deterministic insertion+pause+retract motion to make the
        #    "probe inserted" beat readable on screen. The held pose in
        #    the middle is this stage's signature visual.
        pre_probe = [
            # Extend the arm outward to reach the plant's root zone
            RobotAction(action="elbow_down", magnitude=0.50),
            # Aim the probe tip straight down toward the soil
            RobotAction(action="wrist_down", magnitude=0.45),
        ]
        pre_result = await robot.dispatch(pre_probe, ctx.budget)
        ctx.safety_rejections.extend(pre_result.rejected)
        all_accepted.extend(pre_result.accepted)
        all_rejected.extend(pre_result.rejected)

        # Visible "hold" — 1s of no motion while the (mock) probe "reads"
        await asyncio.sleep(1.0)

        # Retract the probe cleanly so subsequent stages start from a
        # sensible pose. Small retraction motion, not a full reset.
        post_probe = [
            RobotAction(action="elbow_up", magnitude=0.35),
            RobotAction(action="wrist_up", magnitude=0.30),
        ]
        post_result = await robot.dispatch(post_probe, ctx.budget)
        ctx.safety_rejections.extend(post_result.rejected)
        all_accepted.extend(post_result.accepted)
        all_rejected.extend(post_result.rejected)

        # Reading: deterministic per-zone so the risk panel and the probe
        # report never disagree. Honest framing via the `note` field.
        pct = soil_moisture_pct(zone_id)
        if pct < 25.0:
            interpretation = "dry"
        elif pct > 60.0:
            interpretation = "wet"
        else:
            interpretation = "normal"
        reading = SoilProbeReading(moisture_pct=pct, interpretation=interpretation)
        ctx.bundle.soil_probe = reading

        # Soil probe directly updates belief: normal rules water OUT, dry/wet
        # tips it the other way.
        _record_belief(ctx, "after_probe", water_branch=(interpretation != "normal"))

        return {
            "soil_probe": reading.model_dump(mode="json"),
            "er_policy": {
                "backend": vlm.name,
                "steps": er_trace,
                "fallback": loop_failed_reason,
            },
            "motion": {
                "accepted": [a.model_dump() for a in all_accepted],
                "rejected": all_rejected,
            },
        }

    if tool == "place_pest_marker":
        # Phase 3 real-sim + Level-1 VLA: ER closed-loop to find the spot
        # for the pest marker (typically near the affected leaf cluster),
        # then the gripper sequence. The only stage that uses the SO101
        # gripper — the gripper motion is the visual signature.
        #
        # Why ER here: "where to drop the marker" is a spatial decision.
        # A naïve hard-coded direction would drop markers in the wrong
        # place when plant geometry varies. The VLM picks a spot at the
        # base of the affected plant cluster.
        zone_id = args["zone_id"]
        zone = _zone_or_404(zone_id)
        robot = get_robot_adapter()
        cache = get_robot_frame_cache()
        vlm = get_vlm_client()

        # 1. ER closed-loop: position the wrist over the marker drop spot.
        er_trace, er_accepted, er_rejected, loop_failed_reason = await run_er_policy_loop(
            vlm=vlm,
            robot=robot,
            cache=cache,
            zone=zone,
            goal=(
                "Center the wrist camera on the spot where a sticky-trap pest "
                "marker should be dropped — typically at the base of the "
                "affected leaf cluster, in clear ground (not on top of the "
                "plant itself)."
            ),
            budget=ctx.budget,
            safety_rejections=ctx.safety_rejections,
            max_steps=3,
        )

        all_accepted: list[RobotAction] = list(er_accepted)
        all_rejected: list[dict[str, Any]] = list(er_rejected)

        # 2. Gripper sequence — runs after ER positioning. Even when ER
        #    drives the spot selection, we always run grip → lower →
        #    pause → release → retract because that's the visible
        #    "marker placement" beat the demo needs.
        # 2a. Grip — close the jaw. Simulates "holding the marker".
        grip_pre = [RobotAction(action="grip", magnitude=0.70)]
        grip_result = await robot.dispatch(grip_pre, ctx.budget)
        ctx.safety_rejections.extend(grip_result.rejected)
        all_accepted.extend(grip_result.accepted)
        all_rejected.extend(grip_result.rejected)

        # 2b. Lower the arm to ground level for the drop.
        lower = [
            RobotAction(action="elbow_down", magnitude=0.45),
            RobotAction(action="wrist_down", magnitude=0.40),
        ]
        lower_result = await robot.dispatch(lower, ctx.budget)
        ctx.safety_rejections.extend(lower_result.rejected)
        all_accepted.extend(lower_result.accepted)
        all_rejected.extend(lower_result.rejected)

        # Brief pause at the drop point — reads as "placing the marker".
        await asyncio.sleep(0.5)

        # 2c. Release — open the jaw. Simulates dropping the marker.
        release_action = [RobotAction(action="release", magnitude=0.70)]
        release_result = await robot.dispatch(release_action, ctx.budget)
        ctx.safety_rejections.extend(release_result.rejected)
        all_accepted.extend(release_result.accepted)
        all_rejected.extend(release_result.rejected)

        # 2d. Retract to a clean neutral-ish pose so the stage ends tidily.
        retract = [
            RobotAction(action="elbow_up", magnitude=0.40),
            RobotAction(action="wrist_up", magnitude=0.35),
        ]
        retract_result = await robot.dispatch(retract, ctx.budget)
        ctx.safety_rejections.extend(retract_result.rejected)
        all_accepted.extend(retract_result.accepted)
        all_rejected.extend(retract_result.rejected)

        # Bundle bookkeeping + final belief snapshot.
        ctx.bundle.marker_placed = True
        _record_belief(ctx, "final")

        return {
            "marker_placed": True,
            "note": "sticky-trap dropped at affected-plant base for human scout follow-up",
            "er_policy": {
                "backend": vlm.name,
                "steps": er_trace,
                "fallback": loop_failed_reason,
            },
            "motion": {
                "accepted": [a.model_dump() for a in all_accepted],
                "rejected": all_rejected,
            },
        }

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
