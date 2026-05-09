"""POST /api/approve — operator approves or rejects a pending agent plan."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.agent.tools import submit_approval
from app.schemas import ApprovalDecision

router = APIRouter()


@router.post("/api/approve")
def approve(decision: ApprovalDecision) -> dict:
    """Resolves the agent's `request_human_approval` future for `run_id`."""
    payload = {
        "approved": decision.approved,
        "note": decision.note,
        "edited_plan": decision.edited_plan.model_dump(mode="json") if decision.edited_plan else None,
    }
    if not submit_approval(decision.run_id, payload):
        raise HTTPException(status_code=404, detail=f"no run pending approval for {decision.run_id}")
    return {"ok": True, "run_id": decision.run_id, "approved": decision.approved}
