"""In-memory run store with JSONL persistence.

Frontend pattern: POST /api/runs starts a run in the background and returns
the run_id immediately. Frontend polls GET /api/runs/{run_id} to see status
move through PLANNING -> AWAITING_APPROVAL -> EXECUTING -> COMPLETED.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import OrderedDict

from app.config import RUNS_DIR
from app.schemas import RunStatus, RunSummary

logger = logging.getLogger("terrascout.runs")


class RunStore:
    """Single-process store. Replace with sqlite/redis if we need persistence."""

    _instance: RunStore | None = None

    @classmethod
    def get(cls) -> RunStore:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        self._runs: OrderedDict[str, RunSummary] = OrderedDict()
        self._lock = asyncio.Lock()
        self._max_in_memory = 200

    async def upsert(self, summary: RunSummary) -> None:
        async with self._lock:
            self._runs[summary.run_id] = summary
            self._runs.move_to_end(summary.run_id)
            while len(self._runs) > self._max_in_memory:
                self._runs.popitem(last=False)
        # Best-effort JSONL append; never raises into the caller.
        try:
            target = RUNS_DIR / f"{summary.run_id}.json"
            target.write_text(json.dumps(summary.model_dump(mode="json"), indent=2, default=str))
        except Exception as exc:
            logger.warning("failed to persist run %s: %s", summary.run_id, exc)

    async def get_run(self, run_id: str) -> RunSummary | None:
        async with self._lock:
            return self._runs.get(run_id)

    async def list_runs(self, *, limit: int = 50) -> list[RunSummary]:
        async with self._lock:
            return list(self._runs.values())[-limit:][::-1]

    async def mark_status(self, run_id: str, status: RunStatus) -> None:
        async with self._lock:
            r = self._runs.get(run_id)
            if r is not None:
                r.status = status
