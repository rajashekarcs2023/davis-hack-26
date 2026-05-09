"""Tests for the action-token safety guard.

The guard is the only thing between an LLM and a robot. These tests are
non-negotiable.
"""

from __future__ import annotations

import pytest

from app.config import settings
from app.sim.safety import (
    ALLOWED_DRONE_ACTIONS,
    ALLOWED_ROBOT_ACTIONS,
    DispatchBudget,
    review_action,
)


def test_drone_whitelist_rejects_robot_action():
    v = review_action("drone", "drive_forward", 0.5)
    assert not v.ok
    assert "whitelist" in v.reason


def test_robot_whitelist_rejects_drone_action():
    v = review_action("robot", "ascend", 0.5)
    assert not v.ok
    assert "whitelist" in v.reason


def test_magnitude_clamped_above_cap():
    v = review_action("drone", "forward", 2.0)
    assert v.ok
    assert v.magnitude == settings.safety_max_magnitude
    assert v.clamped is True


def test_magnitude_clamped_below_zero():
    v = review_action("robot", "drive_forward", -0.3)
    assert v.ok
    assert v.magnitude == 0.0


def test_budget_exhausts():
    budget = DispatchBudget()
    for _ in range(settings.safety_max_actions_per_dispatch):
        v = review_action("drone", "forward", 0.3, budget=budget)
        assert v.ok
    extra = review_action("drone", "forward", 0.3, budget=budget)
    assert not extra.ok
    assert "budget" in extra.reason
    # The exhausted attempt is recorded in rejections so the metrics page can show it.
    assert any("budget" in r["reason"] for r in budget.rejections)


def test_drone_altitude_floor():
    v = review_action(
        "drone",
        "descend",
        0.5,
        drone_alt_agl=settings.safety_drone_min_agl_m - 1,
    )
    assert not v.ok
    assert "floor" in v.reason


def test_drone_altitude_ceiling():
    v = review_action(
        "drone",
        "ascend",
        0.5,
        drone_alt_agl=settings.safety_drone_max_agl_m + 1,
    )
    assert not v.ok
    assert "ceiling" in v.reason


def test_drone_altitude_neutral_action_unaffected():
    v = review_action("drone", "forward", 0.5, drone_alt_agl=200.0)
    assert v.ok


@pytest.mark.parametrize("action", sorted(ALLOWED_DRONE_ACTIONS))
def test_all_drone_whitelist_passes(action):
    v = review_action("drone", action, 0.3)
    assert v.ok, action


@pytest.mark.parametrize("action", sorted(ALLOWED_ROBOT_ACTIONS))
def test_all_robot_whitelist_passes(action):
    v = review_action("robot", action, 0.3)
    assert v.ok, action


def test_unknown_action_rejected():
    v = review_action("drone", "self_destruct", 1.0)
    assert not v.ok
