"""POST /api/runs (start agent in background) + GET /api/runs / /api/runs/:id."""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.agent.claude_agent import run_agent
from app.runs import RunStore
from app.schemas import RunStatus, RunSummary

logger = logging.getLogger("terrascout.api.runs")

router = APIRouter()


async def _run_in_background(zone_id: str) -> None:
    try:
        await run_agent(zone_id)
    except Exception as exc:
        logger.exception("background run failed: %s", exc)


@router.post("/api/runs", status_code=202)
async def start_run(zone_id: str, background_tasks: BackgroundTasks) -> dict:
    """Kick off an agent run for `zone_id`. Returns immediately with a placeholder run_id.

    The real run_id is created inside `run_agent` and visible via /api/runs once the
    agent registers it. For frontends, the simplest pattern is to call /api/runs and
    then poll /api/runs every 500ms until a new run shows up with the matching zone_id.
    """
    background_tasks.add_task(_run_in_background, zone_id)
    return {"ok": True, "queued": True, "zone_id": zone_id, "request_id": uuid.uuid4().hex[:10]}


@router.get("/api/runs", response_model=list[RunSummary])
async def list_runs(limit: int = 50) -> list[RunSummary]:
    return await RunStore.get().list_runs(limit=limit)


@router.get("/api/runs/{run_id}", response_model=RunSummary)
async def get_run(run_id: str) -> RunSummary:
    run = await RunStore.get().get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"run {run_id} not found")
    return run


@router.get("/api/runs/{run_id}/work_order")
async def get_work_order(run_id: str) -> dict:
    run = await RunStore.get().get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"run {run_id} not found")
    if run.work_order is None:
        raise HTTPException(status_code=409, detail=f"run {run_id} has no work order yet (status={run.status.value})")
    return run.work_order.model_dump(mode="json")


# Convenience: wait until the run reaches AWAITING_APPROVAL (frontend polling shortcut).
@router.get("/api/runs/{run_id}/wait_for_approval")
async def wait_for_approval(run_id: str, timeout_s: float = 30.0) -> dict:
    store = RunStore.get()
    elapsed = 0.0
    while elapsed < timeout_s:
        run = await store.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"run {run_id} not found")
        if run.status == RunStatus.AWAITING_APPROVAL or run.status in {
            RunStatus.COMPLETED,
            RunStatus.FAILED,
            RunStatus.REJECTED,
        }:
            return {"run_id": run_id, "status": run.status.value, "plan": run.plan.model_dump(mode="json") if run.plan else None}
        await asyncio.sleep(0.25)
        elapsed += 0.25
    raise HTTPException(status_code=408, detail="timeout waiting for approval state")
