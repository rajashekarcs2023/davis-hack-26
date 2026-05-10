"""Claude tool-use loop using the Anthropic Messages API.

Why Messages API directly and not the Agent SDK?
    - Fewer moving parts at hackathon time.
    - The tool-use surface is identical; the SDK is a thin wrapper that adds
      session management we don't need yet.
    - We can swap in `claude-agent-sdk` later without changing tools.py at all.

The loop:
    1. POST messages with system prompt + initial user task + tool schemas.
    2. While the response stops with `tool_use`, execute each tool call,
       append a `tool_result` for each, and POST again.
    3. Stop on `end_turn` or when AGENT_MAX_TOOL_CALLS is hit.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from app.agent.prompts import SYSTEM_PROMPT, render_initial_user
from app.agent.tools import (
    TOOL_SCHEMAS,
    RunContext,
    execute_tool,
)
from app.config import settings
from app.domain.anomaly_engine import annotate_grid, classify_zone, load_field_grid
from app.runs import RunStore
from app.schemas import (
    InspectionPlan,
    RunOutcome,
    RunStatus,
    RunSummary,
)

logger = logging.getLogger("terrascout.agent")


def _new_run_id() -> str:
    return f"run-{uuid.uuid4().hex[:10]}"


async def run_agent(zone_id: str) -> RunSummary:
    """Run a full agentic inspection for a zone. Returns the final RunSummary.

    If `ANTHROPIC_API_KEY` is unset, falls back to a deterministic scripted run
    that calls the same tools in a fixed sequence. This keeps the demo runnable
    even without LLM access.
    """
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

    if not settings.has_anthropic:
        logger.warning("ANTHROPIC_API_KEY missing — running scripted agent fallback")
        result = await _scripted_run(ctx, summary, by_id[zone_id])
    else:
        try:
            result = await _claude_run(ctx, summary, by_id[zone_id])
        except Exception as exc:
            logger.exception("Claude run failed (%s); falling back to scripted", exc)
            result = await _scripted_run(ctx, summary, by_id[zone_id])

    await store.upsert(result)
    return result


# ---------------------------------------------------------------------------
# Real Claude tool-use loop
# ---------------------------------------------------------------------------


async def _claude_run(ctx: RunContext, summary: RunSummary, zone) -> RunSummary:
    try:
        from anthropic import AsyncAnthropic
    except ImportError as exc:
        raise RuntimeError("anthropic package not installed") from exc

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

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

    messages: list[dict[str, Any]] = [{"role": "user", "content": initial_user}]
    turn = 0
    work_order = None

    # Alias live mutation buffers onto the summary BEFORE the first tool fires
    # so /api/runs/active sees tool chips and safety rejections accumulate as
    # the agent runs, not just at completion. RunStore holds the same summary
    # reference so live mutations propagate without re-upsert.
    summary.tool_calls = ctx.tool_log
    summary.safety_rejections = ctx.safety_rejections
    # AgriScout pivot: surface risk + diagnostic bundle on the summary the
    # frontend polls. Aliased so the polling endpoint sees belief snapshots,
    # leaf evidence, and probe readings accumulate as each tool fires.
    summary.diagnostic_bundle = ctx.bundle

    while turn < settings.agent_max_tool_calls:
        turn += 1
        resp = await client.messages.create(
            model=settings.claude_model,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS,
            messages=messages,
        )
        # Capture the assistant message (we'll need the original blocks for tool_use ids).
        messages.append({"role": "assistant", "content": resp.content})

        tool_uses = [block for block in resp.content if getattr(block, "type", None) == "tool_use"]
        if not tool_uses or resp.stop_reason in {"end_turn", "stop_sequence"}:
            break

        tool_results: list[dict[str, Any]] = []
        for block in tool_uses:
            tool = block.name
            args = dict(block.input or {})
            if tool == "request_human_approval":
                args.setdefault("run_id", ctx.run_id)
                summary.status = RunStatus.AWAITING_APPROVAL
            result_str = await execute_tool(tool, args, ctx)
            # Refresh derived single-object fields so the polling endpoint
            # sees the latest plan / aerial / ground analysis mid-run.
            summary.plan = ctx.plan
            summary.aerial_analysis = ctx.aerial
            summary.ground_analysis = ctx.ground
            summary.risk_assessment = ctx.risk
            # Diagnostic bundle is already aliased; this line is defensive.
            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": result_str}
            )
            if tool == "create_work_order":
                payload = json.loads(result_str)
                work_order = payload.get("work_order")

        messages.append({"role": "user", "content": tool_results})
        if work_order is not None:
            break

    # Defensive final assignment (no-op if aliases above held).
    summary.tool_calls = ctx.tool_log
    summary.safety_rejections = ctx.safety_rejections
    summary.aerial_analysis = ctx.aerial
    summary.ground_analysis = ctx.ground
    summary.plan = ctx.plan
    summary.risk_assessment = ctx.risk
    summary.diagnostic_bundle = ctx.bundle

    if work_order is not None:
        from app.schemas import WorkOrder

        summary.work_order = WorkOrder(**work_order)
        summary.status = RunStatus.COMPLETED
        summary.outcome = RunOutcome.WORK_ORDER_CREATED
        return summary

    # If we exit the loop without a work order, mark as completed-without-action.
    summary.status = RunStatus.COMPLETED
    summary.outcome = RunOutcome.NO_ACTION_NEEDED
    return summary


# ---------------------------------------------------------------------------
# Scripted fallback (runs without any LLM API access)
# ---------------------------------------------------------------------------


async def _scripted_run(ctx: RunContext, summary: RunSummary, zone) -> RunSummary:
    """Fixed tool sequence so the loop runs end-to-end without Claude.

    Useful for offline dev, CI, and demo-day insurance.
    """
    cls = classify_zone(zone)
    # AgriScout multi-cause framing: even when classification points at
    # irrigation, we phrase the plan as "hotspot detected; cause TBD" so the
    # diagnostic routine has a reason to run.
    plan = InspectionPlan(
        zone_id=zone.zone_id,
        likely_issue=cls.label.value.replace("_", " "),
        urgency="high" if zone.anomaly_score >= 0.6 else "medium",
        confidence=cls.confidence,
        reasoning=cls.reasoning,
        requires_human_approval=False,  # scripted run skips human gate
    )
    ctx.plan = plan
    summary.plan = plan
    # Alias the live mutation buffers onto the summary so /api/runs/active
    # sees tool firings, safety rejections, and the inspection plan as they
    # happen. The RunStore holds a reference to this same summary object so
    # any append to ctx.tool_log shows up in the next poll without a re-upsert.
    summary.tool_calls = ctx.tool_log
    summary.safety_rejections = ctx.safety_rejections
    summary.diagnostic_bundle = ctx.bundle
    summary.status = RunStatus.EXECUTING

    # AgriScout canonical happy path. Approval gate moves to AFTER aerial VLM:
    # the drone is passive observation (no approval needed), the ground robot
    # is active dispatch (approval required, but scripted run auto-skips it).
    seq: list[tuple[str, dict[str, Any]]] = [
        ("fetch_risk_signal", {"zone_id": zone.zone_id}),
        ("fetch_anomaly", {"zone_id": zone.zone_id}),
        (
            "draft_inspection_plan",
            {
                "zone_id": zone.zone_id,
                "likely_issue": plan.likely_issue,
                "urgency": plan.urgency,
                "confidence": plan.confidence,
                "reasoning": plan.reasoning,
            },
        ),
        ("dispatch_drone_to_zone", {"zone_id": zone.zone_id, "target_alt_agl_m": 22.0}),
        ("vlm_analyze_aerial", {"zone_id": zone.zone_id}),
    ]

    for tool, args in seq:
        await execute_tool(tool, args, ctx)
        # Refresh derived single-object fields after each tool so the polling
        # endpoint sees the up-to-date plan / risk / aerial analysis mid-run.
        summary.plan = ctx.plan
        summary.aerial_analysis = ctx.aerial
        summary.risk_assessment = ctx.risk

    # Diagnostic phase. We always run the four diagnostic tools because the
    # whole story depends on the multi-step routine landing.
    if ctx.aerial and ctx.aerial.recommend_ground_truth:
        diag_seq: list[tuple[str, dict[str, Any]]] = [
            ("dispatch_ground_robot", {"zone_id": zone.zone_id}),
            ("vlm_analyze_ground", {"zone_id": zone.zone_id}),
            ("inspect_leaf_with_wrist", {"zone_id": zone.zone_id}),
            ("compare_healthy_plant", {"zone_id": zone.zone_id}),
            ("probe_soil_moisture", {"zone_id": zone.zone_id}),
            ("place_pest_marker", {"zone_id": zone.zone_id}),
        ]
        for tool, args in diag_seq:
            await execute_tool(tool, args, ctx)
            summary.plan = ctx.plan
            summary.ground_analysis = ctx.ground

    final = await execute_tool(
        "create_work_order",
        {
            "zone_id": zone.zone_id,
            "issue": plan.likely_issue,
            "priority": plan.urgency,
        },
        ctx,
    )
    payload = json.loads(final)
    work_order = payload.get("work_order")

    from app.schemas import WorkOrder

    # tool_calls and safety_rejections were already aliased at run start;
    # these final assignments are defensive (no-ops if the alias holds).
    summary.tool_calls = ctx.tool_log
    summary.safety_rejections = ctx.safety_rejections
    summary.aerial_analysis = ctx.aerial
    summary.ground_analysis = ctx.ground
    summary.risk_assessment = ctx.risk
    summary.diagnostic_bundle = ctx.bundle
    summary.work_order = WorkOrder(**work_order) if work_order else None
    summary.status = RunStatus.COMPLETED
    summary.outcome = (
        RunOutcome.WORK_ORDER_CREATED if summary.work_order else RunOutcome.NO_ACTION_NEEDED
    )
    return summary
