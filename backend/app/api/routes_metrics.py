"""GET /api/metrics — eval set + run-time aggregates."""

from __future__ import annotations

from fastapi import APIRouter

from app.domain.metrics import compute_metrics
from app.runs import RunStore

router = APIRouter()


@router.get("/api/metrics")
async def metrics() -> dict:
    eval_metrics = compute_metrics()
    runs = await RunStore.get().list_runs(limit=200)

    n_runs = len(runs)
    n_completed = sum(1 for r in runs if r.status.value == "completed")
    n_work_orders = sum(1 for r in runs if r.work_order is not None)
    n_safety_rejects = sum(len(r.safety_rejections) for r in runs)
    avg_actions = (
        sum(len([t for t in r.tool_calls if t.get("tool", "").startswith("dispatch_")]) for r in runs) / n_runs
        if n_runs
        else 0
    )

    return {
        "eval": eval_metrics,
        "runtime": {
            "total_runs": n_runs,
            "completed_runs": n_completed,
            "work_orders_created": n_work_orders,
            "safety_rejections": n_safety_rejects,
            "avg_dispatch_actions_per_run": round(avg_actions, 2),
        },
    }
