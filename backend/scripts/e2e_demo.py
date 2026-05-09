"""End-to-end demo run.

Usage:
    cd backend
    python3 -m scripts.e2e_demo                    # default: zone B3, auto-approve ON
    python3 -m scripts.e2e_demo --zone C2
    python3 -m scripts.e2e_demo --no-auto-approve  # wait for /api/approve like real UI flow

This is the "click button, drone moves, robot moves, work order printed"
verification. The agent issues `request_human_approval` mid-run; in the real
demo a frontend resolves that via POST /api/approve. For headless e2e runs
(this script) we run an in-process watcher that auto-approves any pending
plan after a short delay so the agent proceeds to dispatch the drone + robot.

If you want to test the human-in-the-loop flow manually, use --no-auto-approve
and call POST http://localhost:8000/api/approve {"run_id":"...","approved":true}
from a separate terminal within 120 seconds.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from app.agent.claude_agent import run_agent
from app.agent.tools import pending_approval_run_ids, submit_approval


async def auto_approve_watcher(delay_before_approve: float = 1.5) -> None:
    """Background task: any pending approval gets auto-approved after a short delay.

    Without this watcher (or a UI calling /api/approve), the Claude agent's
    `request_human_approval` tool blocks for 120s, then returns rejection — and
    the agent skips drone/robot dispatch entirely (only a satellite-evidence
    work order gets produced).
    """
    handled: set[str] = set()
    while True:
        await asyncio.sleep(0.2)
        for run_id in pending_approval_run_ids():
            if run_id in handled:
                continue
            handled.add(run_id)
            print(
                f"[auto-approve] plan submitted for {run_id}; "
                f"approving in {delay_before_approve:.1f}s...",
                flush=True,
            )
            await asyncio.sleep(delay_before_approve)
            ok = submit_approval(
                run_id,
                {"approved": True, "note": "auto-approved by e2e_demo --auto-approve"},
            )
            print(
                f"[auto-approve] {'APPROVED' if ok else 'no-op (already resolved)'} for {run_id}",
                flush=True,
            )


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zone", default="B3", help="Zone id to inspect (default: B3).")
    parser.add_argument(
        "--no-auto-approve",
        action="store_true",
        help="Don't auto-approve the plan. Then you must POST /api/approve from another terminal within 120s.",
    )
    args = parser.parse_args()

    watcher: asyncio.Task | None = None
    if not args.no_auto_approve:
        watcher = asyncio.create_task(auto_approve_watcher())

    try:
        summary = await run_agent(args.zone)
    finally:
        if watcher is not None:
            watcher.cancel()
            try:
                await watcher
            except asyncio.CancelledError:
                pass

    print(json.dumps(summary.model_dump(mode="json"), indent=2, default=str))

    if summary.work_order is None:
        print("\n>>> No work order produced. Outcome:", summary.outcome)
        return 1

    wo = summary.work_order
    print("\n========== WORK ORDER ==========")
    print(f"ID:        {wo.work_order_id}")
    print(f"Zone:      {wo.zone_id}")
    print(f"Issue:     {wo.issue}")
    print(f"Priority:  {wo.priority}")
    print("Evidence:")
    for line in wo.evidence:
        print(f"  - {line}")
    print(f"Recommended: {wo.recommended_action}")
    print("================================\n")

    aerial_pts = len((summary.aerial_analysis.evidence_points if summary.aerial_analysis else []) or [])
    ground_pts = len((summary.ground_analysis.evidence_points if summary.ground_analysis else []) or [])
    print(
        f"Tool calls: {len(summary.tool_calls)} | "
        f"Aerial points: {aerial_pts} | Ground points: {ground_pts} | "
        f"Safety rejections: {len(summary.safety_rejections)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
