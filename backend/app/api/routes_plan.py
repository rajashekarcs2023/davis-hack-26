"""POST /api/plan and POST /api/execute/{zone_id} — agent-driven endpoints.

`/api/plan` is a dry-run: drafts a plan without dispatching anything.
`/api/execute/{zone_id}` runs the full agentic loop and returns the RunSummary.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.agent.claude_agent import run_agent
from app.domain.anomaly_engine import annotate_grid, classify_zone, load_field_grid
from app.schemas import InspectionPlan, RunSummary

logger = logging.getLogger("agriscout.api.plan")

router = APIRouter()


@router.post("/api/plan", response_model=InspectionPlan)
def create_plan(zone_id: str) -> InspectionPlan:
    """Dry-run plan: no drone, no robot, no LLM call. Pure rule-based draft."""
    grid = annotate_grid(load_field_grid())
    by_id = {z.zone_id: z for z in grid.zones}
    if zone_id not in by_id:
        raise HTTPException(status_code=404, detail=f"zone {zone_id} not found")
    z = by_id[zone_id]
    cls = classify_zone(z)
    return InspectionPlan(
        zone_id=z.zone_id,
        likely_issue=cls.label.value.replace("_", " "),
        urgency="high" if z.anomaly_score >= 0.6 else "medium",
        confidence=cls.confidence,
        reasoning=cls.reasoning,
        requires_human_approval=True,
    )


@router.post("/api/execute/{zone_id}", response_model=RunSummary)
async def execute(zone_id: str) -> RunSummary:
    """Run the agentic loop for a zone. Uses Claude if ANTHROPIC_API_KEY is set, scripted fallback otherwise."""
    try:
        return await run_agent(zone_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
