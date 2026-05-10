"""Primary AgriScout orchestrator — Google ADK + Gemini 2.5 Pro.

This is the canonical brain that drives the field-triage loop:

    satellite anomaly  →  Gemini 2.5 Pro (ADK LlmAgent)  →  13 tools  →  work order

Why Google ADK?
    - The agent loop, tool dispatch, session state, and safety callbacks are
      handled by `LlmAgent` + `Runner` so we don't have to re-implement the
      "while tool_use → execute → append → re-prompt" plumbing ourselves.
    - `before_tool_callback` plugs the AgriScout DispatchBudget safety guard
      in *before* any sim-mutating tool fires (drone/robot adapters).
    - Gemini 2.5 Pro's tool-use is deterministic enough for the structured
      diagnostic routine (risk → drone → aerial VLM → approval → robot →
      4-step embodied-reasoning diagnostic → work order).
    - Gemma 4 31B-IT is available as a swap-in via `Gemini(model=...)` for
      on-prem / Vertex AI Gemma-Garden deployments where data-residency is
      a constraint (rural ag co-ops, EU farms). Toggle via `GEMINI_MODEL`.

How the run loop works:

    1. The frontend POSTs /api/execute with a zone_id.
    2. We materialise an InMemorySessionService session for the run.
    3. The Runner streams the initial user prompt (zone metadata + classification)
       into the root LlmAgent.
    4. The agent emits tool_use parts. Each tool is a plain Python function
       below; ADK auto-introspects its signature and docstring to build the
       function declaration sent to Gemini.
    5. `before_tool_callback` consults the safety guard *before* sim writes;
       if rejected, the callback returns a synthetic tool result and the
       agent observes the rejection in the next turn.
    6. We accumulate the live RunSummary on the session state so the
       /api/runs/active polling endpoint sees tool chips, belief snapshots,
       and safety rejections appear in real time.
    7. The agent exits when `create_work_order` returns or when
       `AGENT_MAX_TOOL_CALLS` is reached.

Fallback:
    If `google-adk` is not installed or `GOOGLE_API_KEY` is missing, callers
    should degrade to `app.agent.claude_agent` (the Anthropic-backed fallback
    we kept around while the ADK preview stabilises).
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

# google-adk is the primary runtime brain. Wrapped in a try/except so this
# module can be imported in CI environments that don't have google-adk yet
# — callers should catch ImportError and fall back to the Anthropic backend.
try:
    from google.adk.agents import LlmAgent
    from google.adk.models import Gemini
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.adk.tools.base_tool import BaseTool
    from google.adk.tools.tool_context import ToolContext
    from google.genai import types as genai_types

    ADK_AVAILABLE = True
except ImportError as _adk_import_exc:  # pragma: no cover — exhibit code path
    ADK_AVAILABLE = False
    _ADK_IMPORT_ERROR = _adk_import_exc

from app.agent.prompts import SYSTEM_PROMPT, render_initial_user
from app.agent.tools import (
    RunContext,
    execute_tool,
)
from app.config import settings
from app.domain.anomaly_engine import (
    annotate_grid,
    classify_zone,
    load_field_grid,
)
from app.runs import RunStore
from app.schemas import (
    RunOutcome,
    RunStatus,
    RunSummary,
    WorkOrder,
)

logger = logging.getLogger("agriscout.agent.adk")

APP_NAME = "agriscout_field_triage"
GEMINI_PRIMARY_MODEL = "gemini-2.5-pro"
# Gemma 4 31B-IT is offered as an on-prem alternative for data-residency
# sensitive deployments. Selected via env: GEMINI_MODEL=gemma-4-31b-it.
GEMMA4_ALTERNATIVE_MODEL = "gemma-4-31b-it"

# Session state keys — kept here so tool functions and callbacks agree.
STATE_RUN_CONTEXT = "_agriscout_run_context"
STATE_RUN_SUMMARY = "_agriscout_run_summary"
STATE_WORK_ORDER = "_agriscout_work_order"


def _new_run_id() -> str:
    return f"run-{uuid.uuid4().hex[:10]}"


# ---------------------------------------------------------------------------
# Tool functions — ADK auto-generates the function-declaration schema from
# each signature + docstring. Each function delegates to `execute_tool` so
# the actual sim/vision/domain logic stays in app.agent.tools (single source
# of truth for tool behaviour across both orchestrator backends).
# ---------------------------------------------------------------------------


async def fetch_risk_signal(zone_id: str, tool_context: "ToolContext") -> dict:
    """Read the multi-input risk assessment for a zone (satellite anomaly,
    weather pest risk, soil moisture, historical hotspot). Returns the combined
    risk score and the IGNORE / MONITOR / SEND_DRONE decision. Call this FIRST
    to decide whether the drone should fly at all.

    Args:
        zone_id: Zone identifier, e.g. 'B3'.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("fetch_risk_signal", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def fetch_anomaly(zone_id: str, tool_context: "ToolContext") -> dict:
    """Read the satellite-derived anomaly metadata for a given field zone,
    plus its rule-based classification.

    Args:
        zone_id: Zone identifier, e.g. 'B3'.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("fetch_anomaly", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def draft_inspection_plan(
    zone_id: str,
    likely_issue: str,
    urgency: str,
    confidence: float,
    reasoning: str,
    tool_context: "ToolContext",
) -> dict:
    """Convert the anomaly + classification into an InspectionPlan. Returns the
    plan JSON. Does NOT execute anything.

    Args:
        zone_id: Zone identifier.
        likely_issue: Hypothesised cause in plain English.
        urgency: One of 'low' | 'medium' | 'high'.
        confidence: Float in [0, 1].
        reasoning: One-sentence justification grounded in the zone metadata.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool(
        "draft_inspection_plan",
        {
            "zone_id": zone_id,
            "likely_issue": likely_issue,
            "urgency": urgency,
            "confidence": confidence,
            "reasoning": reasoning,
        },
        ctx,
    )
    _refresh_summary(tool_context)
    return json.loads(out)


async def request_human_approval(
    run_id: str, summary: str, tool_context: "ToolContext"
) -> dict:
    """Block the run until a human approves or rejects the plan via /api/approve.
    Returns the operator decision. Required before any *active* physical
    dispatch (the ground robot).

    Args:
        run_id: The current run identifier.
        summary: Human-readable summary the operator will see in the phone UI.
    """
    ctx = _ctx_from(tool_context)
    run_summary: RunSummary = tool_context.state.get(STATE_RUN_SUMMARY)
    if run_summary is not None:
        run_summary.status = RunStatus.AWAITING_APPROVAL
    out = await execute_tool(
        "request_human_approval", {"run_id": run_id, "summary": summary}, ctx
    )
    _refresh_summary(tool_context)
    return json.loads(out)


async def dispatch_drone_to_zone(
    zone_id: str, target_alt_agl_m: float, tool_context: "ToolContext"
) -> dict:
    """Fly the drone toward a zone's coordinates and hover for a closer look.
    Returns accepted/rejected actions and final state.

    Args:
        zone_id: Zone identifier.
        target_alt_agl_m: Target altitude above ground level, in metres.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool(
        "dispatch_drone_to_zone",
        {"zone_id": zone_id, "target_alt_agl_m": target_alt_agl_m},
        ctx,
    )
    _refresh_summary(tool_context)
    return json.loads(out)


async def vlm_analyze_aerial(zone_id: str, tool_context: "ToolContext") -> dict:
    """Pull the latest drone FPV frame and ask the Gemini Robotics-ER + Gemma 4
    cross-validated ensemble whether the satellite-flagged anomaly is visible.

    Args:
        zone_id: Zone identifier.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("vlm_analyze_aerial", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def dispatch_ground_robot(zone_id: str, tool_context: "ToolContext") -> dict:
    """Drive the LeKiwi + SO101 robot to inspect the zone close-up. Returns
    accepted/rejected actions and final state.

    Args:
        zone_id: Zone identifier.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("dispatch_ground_robot", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def vlm_analyze_ground(zone_id: str, tool_context: "ToolContext") -> dict:
    """Pull the latest robot wrist-cam frame and ask the VLM ensemble what
    visible evidence is present (canopy, ground cover, plant posture).

    Args:
        zone_id: Zone identifier.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("vlm_analyze_ground", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def inspect_leaf_with_wrist(
    zone_id: str, tool_context: "ToolContext"
) -> dict:
    """Targeted close-up VLM inspection of a single leaf on the affected plant.
    Looks for pest-specific signatures (stippling, webbing, egg masses,
    discoloration). Use AFTER dispatch_ground_robot has placed the robot in
    the row. Closed-loop via Gemini Robotics-ER 1.6 target_point [y, x].

    Args:
        zone_id: Zone identifier.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("inspect_leaf_with_wrist", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def compare_healthy_plant(
    zone_id: str, tool_context: "ToolContext"
) -> dict:
    """Run the same close-up VLM inspection on a NEARBY HEALTHY plant for
    differential comparison. The healthy reference firms up belief that
    observed evidence on the affected plant is real and localized.

    Args:
        zone_id: Zone identifier.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("compare_healthy_plant", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def probe_soil_moisture(zone_id: str, tool_context: "ToolContext") -> dict:
    """Read a simulated soil-moisture probe reading at the affected plant's
    root zone. Returns moisture percentage and 'dry' / 'normal' / 'wet'
    interpretation. A NORMAL reading rules out water stress and shifts belief
    toward pest / nutrient causes.

    Args:
        zone_id: Zone identifier.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("probe_soil_moisture", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def place_pest_marker(zone_id: str, tool_context: "ToolContext") -> dict:
    """Drop a sticky-trap / pest marker at the affected plant for human scout
    follow-up. Confirms the diagnostic was completed and creates a physical
    artifact in the field.

    Args:
        zone_id: Zone identifier.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool("place_pest_marker", {"zone_id": zone_id}, ctx)
    _refresh_summary(tool_context)
    return json.loads(out)


async def create_work_order(
    zone_id: str, issue: str, priority: str, tool_context: "ToolContext"
) -> dict:
    """Produce the final farmer-facing work order from gathered evidence.
    Always call this last.

    Args:
        zone_id: Zone identifier.
        issue: Final diagnosed cause in plain English.
        priority: One of 'low' | 'medium' | 'high'.
    """
    ctx = _ctx_from(tool_context)
    out = await execute_tool(
        "create_work_order",
        {"zone_id": zone_id, "issue": issue, "priority": priority},
        ctx,
    )
    payload = json.loads(out)
    if "work_order" in payload:
        tool_context.state[STATE_WORK_ORDER] = payload["work_order"]
    _refresh_summary(tool_context)
    return payload


# ---------------------------------------------------------------------------
# Safety callback — runs BEFORE every tool fires. The DispatchBudget guard
# inside `execute_tool` is the canonical check, but this callback gives Gemini
# an early signal when an obviously-out-of-policy call is about to happen
# (e.g. trying to dispatch the ground robot before approval).
# ---------------------------------------------------------------------------


def before_tool_callback(
    tool: "BaseTool", args: dict[str, Any], tool_context: "ToolContext"
) -> dict[str, Any] | None:
    """ADK before-tool hook. Returns None to allow the call to proceed,
    or a dict to short-circuit with a synthetic tool result.
    """
    run_summary: RunSummary | None = tool_context.state.get(STATE_RUN_SUMMARY)
    if run_summary is None:
        return None

    # Active physical dispatches require human approval to have completed.
    # The DispatchBudget will also catch this, but we surface it here so
    # Gemini observes the policy violation as a structured tool error.
    if tool.name == "dispatch_ground_robot":
        if run_summary.status not in (
            RunStatus.AWAITING_APPROVAL,
            RunStatus.EXECUTING,
        ):
            logger.warning(
                "adk: blocking dispatch_ground_robot — approval gate not cleared "
                "(status=%s)",
                run_summary.status,
            )
            return {
                "ok": False,
                "error": "approval_gate_not_cleared",
                "hint": (
                    "Call request_human_approval first and wait for the "
                    "operator decision before dispatching active physical "
                    "actuators."
                ),
            }
    return None


# ---------------------------------------------------------------------------
# Root agent definition. Materialised lazily so `import` is cheap and we don't
# spin up a Gemini client at module load time.
# ---------------------------------------------------------------------------


def build_root_agent(model_name: str | None = None) -> "LlmAgent":
    """Construct the AgriScout root LlmAgent.

    Args:
        model_name: Override the default Gemini model. Pass
            'gemma-4-31b-it' to route through the on-prem Gemma 4 endpoint
            for data-residency-sensitive deployments.
    """
    if not ADK_AVAILABLE:  # pragma: no cover — exhibit code path
        raise RuntimeError(
            "google-adk is not installed. Run `pip install google-adk` and set "
            "GOOGLE_API_KEY (or GEMINI_API_KEY) to enable the primary "
            "orchestration backend. Until then callers fall back to the "
            "Anthropic-backed loop in app.agent.claude_agent."
        ) from _ADK_IMPORT_ERROR

    model = model_name or GEMINI_PRIMARY_MODEL
    return LlmAgent(
        model=Gemini(model=model),
        name="agriscout_root_agent",
        description=(
            "AgriScout field-triage orchestrator. Detects NDVI anomalies via "
            "satellite, dispatches a drone for aerial confirmation, runs a "
            "4-step embodied-reasoning diagnostic with the LeKiwi + SO101 "
            "ground robot, and produces a farmer-approved work order with "
            "multi-cause (pest / water / nutrient) discrimination."
        ),
        instruction=SYSTEM_PROMPT,
        tools=[
            fetch_risk_signal,
            fetch_anomaly,
            draft_inspection_plan,
            request_human_approval,
            dispatch_drone_to_zone,
            vlm_analyze_aerial,
            dispatch_ground_robot,
            vlm_analyze_ground,
            inspect_leaf_with_wrist,
            compare_healthy_plant,
            probe_soil_moisture,
            place_pest_marker,
            create_work_order,
        ],
        before_tool_callback=before_tool_callback,
    )


# ---------------------------------------------------------------------------
# Entrypoint mirroring app.agent.claude_agent.run_agent so the FastAPI routes
# can swap backends without touching the call site.
# ---------------------------------------------------------------------------


async def run_agent(zone_id: str) -> RunSummary:
    """Run a full agentic inspection for a zone using Google ADK + Gemini 2.5
    Pro. Returns the final RunSummary.
    """
    if not ADK_AVAILABLE:  # pragma: no cover — exhibit code path
        raise RuntimeError(
            "ADK primary brain unavailable; caller should fall back to "
            "app.agent.claude_agent.run_agent"
        ) from _ADK_IMPORT_ERROR

    grid = annotate_grid(load_field_grid())
    by_id = {z.zone_id: z for z in grid.zones}
    if zone_id not in by_id:
        raise ValueError(f"unknown zone {zone_id}")

    run_id = _new_run_id()
    summary = RunSummary(
        run_id=run_id,
        field_id=grid.field_id,
        zone_id=zone_id,
        status=RunStatus.PLANNING,
    )
    ctx = RunContext(run_id=run_id)
    store = RunStore.get()
    await store.upsert(summary)

    # Alias live mutation buffers onto the summary BEFORE any tool fires so
    # /api/runs/active sees tool chips, safety rejections, and the diagnostic
    # bundle accumulate as the run progresses (not just at completion).
    summary.tool_calls = ctx.tool_log
    summary.safety_rejections = ctx.safety_rejections
    summary.diagnostic_bundle = ctx.bundle

    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name=APP_NAME,
        user_id="agriscout_operator",
        session_id=run_id,
    )
    # Seed session state with our RunContext + summary handle so tool
    # functions and the before_tool_callback can find them.
    session.state[STATE_RUN_CONTEXT] = ctx
    session.state[STATE_RUN_SUMMARY] = summary

    root_agent = build_root_agent(
        model_name=getattr(settings, "gemini_model", GEMINI_PRIMARY_MODEL)
    )
    runner = Runner(
        agent=root_agent,
        app_name=APP_NAME,
        session_service=session_service,
    )

    zone = by_id[zone_id]
    cls = classify_zone(zone)
    initial_user = render_initial_user(
        zone_json=json.dumps(zone.model_dump(mode="json"), indent=2),
        classification_json=json.dumps(
            {
                "label": cls.label.value,
                "confidence": round(cls.confidence, 3),
                "reasoning": cls.reasoning,
            },
            indent=2,
        ),
        zone_id=zone.zone_id,
    )
    new_message = genai_types.Content(
        role="user", parts=[genai_types.Part(text=initial_user)]
    )

    tool_count = 0
    async for event in runner.run_async(
        user_id="agriscout_operator",
        session_id=run_id,
        new_message=new_message,
    ):
        # Each event represents one turn of the ADK loop. We mostly let
        # the Runner drive — the actual state mutation happens inside our
        # tool functions via _refresh_summary().
        if getattr(event, "tool_calls", None):
            tool_count += len(event.tool_calls)
        if tool_count >= settings.agent_max_tool_calls:
            logger.warning(
                "adk: hit agent_max_tool_calls=%d, terminating run",
                settings.agent_max_tool_calls,
            )
            break

    # Final sync of derived single-object fields from the RunContext.
    summary.tool_calls = ctx.tool_log
    summary.safety_rejections = ctx.safety_rejections
    summary.plan = ctx.plan
    summary.aerial_analysis = ctx.aerial
    summary.ground_analysis = ctx.ground
    summary.risk_assessment = ctx.risk
    summary.diagnostic_bundle = ctx.bundle

    work_order = session.state.get(STATE_WORK_ORDER)
    if work_order is not None:
        summary.work_order = WorkOrder(**work_order)
        summary.status = RunStatus.COMPLETED
        summary.outcome = RunOutcome.WORK_ORDER_CREATED
    else:
        summary.status = RunStatus.COMPLETED
        summary.outcome = RunOutcome.NO_ACTION_NEEDED

    await store.upsert(summary)
    return summary


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _ctx_from(tool_context: "ToolContext") -> RunContext:
    """Pull the RunContext that was seeded onto session state at run start."""
    ctx = tool_context.state.get(STATE_RUN_CONTEXT)
    if ctx is None:
        # Defensive: should never happen if run_agent seeded state correctly.
        # We materialise a fresh context so the tool call still completes,
        # but live polling won't reflect anything.
        logger.error("adk: RunContext missing from session state; creating ad-hoc")
        ctx = RunContext(run_id=f"orphan-{uuid.uuid4().hex[:8]}")
        tool_context.state[STATE_RUN_CONTEXT] = ctx
    return ctx


def _refresh_summary(tool_context: "ToolContext") -> None:
    """Re-bind derived single-object fields onto the live RunSummary so the
    /api/runs/active polling endpoint sees plan / aerial / ground / risk
    update mid-run. The list-style buffers (tool_log, safety_rejections,
    diagnostic_bundle) are already aliased onto the summary in run_agent,
    so they propagate automatically.
    """
    summary: RunSummary | None = tool_context.state.get(STATE_RUN_SUMMARY)
    ctx: RunContext | None = tool_context.state.get(STATE_RUN_CONTEXT)
    if summary is None or ctx is None:
        return
    summary.plan = ctx.plan
    summary.aerial_analysis = ctx.aerial
    summary.ground_analysis = ctx.ground
    summary.risk_assessment = ctx.risk
