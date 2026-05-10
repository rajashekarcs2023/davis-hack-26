"""Regression tests for the reusable run_er_policy_loop helper.

Covers:
1. Loop returns successfully when VLM converges (status="arrived")
2. Loop bails with "backend_missing_analyze_er_policy" when VLM lacks the method
3. Loop bails with "er_policy_exception: ..." when VLM raises mid-loop
4. Loop bails with "er_loop_no_actions" when target stays near center
5. Loop respects max_steps cap
6. Action chips are correctly accumulated across multiple steps
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import pytest

from app.agent.er_policy import run_er_policy_loop
from app.schemas import AnomalyPattern, ErPolicyStep, RobotAction, RobotState, Zone


# ---------------------------------------------------------------------------
# Test fixtures: minimal stand-ins for VLM / robot / cache
# ---------------------------------------------------------------------------


@dataclass
class FakeDispatchResult:
    accepted: list[RobotAction] = field(default_factory=list)
    rejected: list[dict[str, Any]] = field(default_factory=list)


class FakeRobot:
    """Records dispatched actions; returns a stable pose."""

    def __init__(self, joints: dict[str, float] | None = None) -> None:
        self.joints = joints or {"Pitch": 0.0, "Rotation": 0.0}
        self.dispatched: list[list[RobotAction]] = []

    async def get_state(self) -> RobotState:
        return RobotState(joints=self.joints, type="state")

    async def dispatch(self, actions: list[RobotAction], _budget: Any) -> FakeDispatchResult:
        self.dispatched.append(actions)
        return FakeDispatchResult(accepted=list(actions), rejected=[])


class FakeCache:
    async def wait_for_usable_frame(self, *, timeout_s: float) -> str:
        return "fake_b64_frame"


class ScriptedVlm:
    """Replays a list of pre-canned ErPolicyStep responses, one per call.

    After exhausting the list, raises an AssertionError so tests fail
    loudly if the loop calls more times than expected.
    """

    name = "scripted-test-vlm"

    def __init__(self, steps: list[ErPolicyStep]) -> None:
        self._steps = list(steps)
        self.calls: list[tuple[str, dict[str, float]]] = []

    async def analyze_er_policy(
        self,
        frame_b64: str,
        zone: Zone,
        goal: str,
        current_pose: dict[str, float],
    ) -> ErPolicyStep:
        self.calls.append((goal, current_pose))
        if not self._steps:
            raise AssertionError("scripted vlm called more times than expected")
        return self._steps.pop(0)


class FailingVlm:
    """Raises on every call — exercises the er_policy_exception path."""

    name = "failing-test-vlm"

    async def analyze_er_policy(
        self, *_args: Any, **_kwargs: Any
    ) -> ErPolicyStep:
        raise RuntimeError("boom")


class NoErVlm:
    """Has no analyze_er_policy method — exercises the
    backend_missing_analyze_er_policy path."""

    name = "no-er-vlm"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _zone() -> Zone:
    return Zone(
        zone_id="B3",
        lat=38.5449,
        lon=-121.7405,
        ndvi=0.45,
        ndvi_baseline=0.65,
        ndvi_drop=0.20,
        pattern=AnomalyPattern.ROW_ALIGNED,
        neighbor_avg_ndvi=0.62,
        anomaly_score=0.85,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loop_converges_on_arrived_status():
    """Two-step convergence: nav step, then arrived → break."""
    vlm = ScriptedVlm(
        [
            ErPolicyStep(target_point=[300, 700], status="navigating", reasoning="step 1"),
            ErPolicyStep(target_point=[500, 500], status="arrived", reasoning="centered"),
        ]
    )
    robot = FakeRobot()
    cache = FakeCache()
    rejections: list[dict[str, Any]] = []

    er_trace, accepted, rejected, fallback = await run_er_policy_loop(
        vlm=vlm,
        robot=robot,
        cache=cache,
        zone=_zone(),
        goal="centre on the leaf",
        budget=None,
        safety_rejections=rejections,
        max_steps=5,
        settle_pause_s=0.0,
    )

    assert fallback is None, f"expected success, got fallback={fallback}"
    assert len(er_trace) == 2
    assert er_trace[0]["status"] == "navigating"
    assert er_trace[1]["status"] == "arrived"
    # First step dispatched at least one action (target was off-center).
    assert len(accepted) >= 1
    assert len(robot.dispatched) >= 1


@pytest.mark.asyncio
async def test_loop_returns_missing_method_for_no_er_vlm():
    rejections: list[dict[str, Any]] = []
    er_trace, accepted, rejected, fallback = await run_er_policy_loop(
        vlm=NoErVlm(),  # type: ignore[arg-type]
        robot=FakeRobot(),
        cache=FakeCache(),
        zone=_zone(),
        goal="x",
        budget=None,
        safety_rejections=rejections,
    )
    assert fallback == "backend_missing_analyze_er_policy"
    assert er_trace == []
    assert accepted == []


@pytest.mark.asyncio
async def test_loop_catches_vlm_exception():
    rejections: list[dict[str, Any]] = []
    er_trace, accepted, rejected, fallback = await run_er_policy_loop(
        vlm=FailingVlm(),  # type: ignore[arg-type]
        robot=FakeRobot(),
        cache=FakeCache(),
        zone=_zone(),
        goal="x",
        budget=None,
        safety_rejections=rejections,
        settle_pause_s=0.0,
    )
    assert fallback is not None and fallback.startswith("er_policy_exception:")
    assert "boom" in fallback


@pytest.mark.asyncio
async def test_loop_bails_when_no_actions_emitted():
    """If ER returns target_point=[500,500] (centered) on the first call,
    the translator emits zero actions, the loop breaks, and we report
    er_loop_no_actions so the caller knows to run scripted fallback."""
    vlm = ScriptedVlm(
        [
            ErPolicyStep(target_point=[500, 500], status="navigating", reasoning="centered"),
        ]
    )
    robot = FakeRobot()
    rejections: list[dict[str, Any]] = []

    er_trace, accepted, rejected, fallback = await run_er_policy_loop(
        vlm=vlm,
        robot=robot,
        cache=FakeCache(),
        zone=_zone(),
        goal="x",
        budget=None,
        safety_rejections=rejections,
        max_steps=5,
        settle_pause_s=0.0,
    )

    assert fallback == "er_loop_no_actions"
    assert len(er_trace) == 1
    assert accepted == []
    assert robot.dispatched == []


@pytest.mark.asyncio
async def test_loop_respects_max_steps():
    """If ER never says arrived and never centers, we cap at max_steps."""
    # 10 steps all "navigating" off-center; we should stop at max_steps=3.
    vlm = ScriptedVlm(
        [
            ErPolicyStep(target_point=[200 + i * 50, 800 - i * 50], status="navigating", reasoning=f"step {i}")
            for i in range(10)
        ]
    )
    rejections: list[dict[str, Any]] = []

    er_trace, accepted, rejected, fallback = await run_er_policy_loop(
        vlm=vlm,
        robot=FakeRobot(),
        cache=FakeCache(),
        zone=_zone(),
        goal="x",
        budget=None,
        safety_rejections=rejections,
        max_steps=3,
        settle_pause_s=0.0,
    )

    assert len(er_trace) == 3, f"expected 3 trace entries, got {len(er_trace)}"
    # Loop ran to completion without convergence — fallback should be None
    # because at least one action was dispatched per step.
    assert fallback is None
    assert len(accepted) >= 3


@pytest.mark.asyncio
async def test_loop_passes_goal_through_to_vlm():
    """The goal string the caller supplies must reach the VLM unchanged
    so per-tool framing (leaf vs healthy vs probe vs marker) actually
    influences the model's spatial decision."""
    vlm = ScriptedVlm(
        [ErPolicyStep(target_point=[500, 500], status="arrived", reasoning="ok")]
    )
    rejections: list[dict[str, Any]] = []

    custom_goal = "Center on the soil patch beside the affected plant"
    await run_er_policy_loop(
        vlm=vlm,
        robot=FakeRobot(),
        cache=FakeCache(),
        zone=_zone(),
        goal=custom_goal,
        budget=None,
        safety_rejections=rejections,
        settle_pause_s=0.0,
    )

    assert len(vlm.calls) == 1
    seen_goal, _seen_pose = vlm.calls[0]
    assert seen_goal == custom_goal


@pytest.mark.asyncio
async def test_loop_breaks_immediately_on_lost_status():
    """ER saying 'lost' should also exit the loop cleanly."""
    vlm = ScriptedVlm(
        [ErPolicyStep(target_point=[500, 500], status="lost", reasoning="cant see leaf")]
    )
    rejections: list[dict[str, Any]] = []

    er_trace, accepted, rejected, fallback = await run_er_policy_loop(
        vlm=vlm,
        robot=FakeRobot(),
        cache=FakeCache(),
        zone=_zone(),
        goal="x",
        budget=None,
        safety_rejections=rejections,
        max_steps=5,
        settle_pause_s=0.0,
    )

    assert len(er_trace) == 1
    assert er_trace[0]["status"] == "lost"
    # No actions dispatched (we exited before translation).
    assert accepted == []
    # er_loop_no_actions because nothing got dispatched.
    assert fallback == "er_loop_no_actions"
