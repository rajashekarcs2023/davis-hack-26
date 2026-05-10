"""Regression tests for the belief snapshot recording.

Bug found during demo rehearsal: `inspect_leaf_with_wrist` and
`compare_healthy_plant` were only recording belief snapshots WHEN pest
evidence was detected. With the real Gemini ensemble on synthetic
frames, evidence wasn't always found, so the BeliefStateStrip showed
only 4 snapshots instead of 5-6.

Fix: always record the snapshot, with a `clean_branch` variant when no
pest evidence was found (belief shifts toward water_stress / false_alarm
instead of pest_hotspot — honest signal that we looked and ruled it out).

These tests pin the contract: the belief evolution must contain at least
6 snapshots after a full pipeline run, regardless of whether pest evidence
was detected.
"""

from __future__ import annotations

import pytest

from app.agent.tools import (
    _BELIEF_AFTER_COMPARE_CLEAN,
    _BELIEF_AFTER_LEAF_CLEAN,
    _BELIEF_AFTER_PROBE_WATER,
    _BELIEF_SNAPSHOTS,
    _record_belief,
    RunContext,
)


def _new_ctx() -> RunContext:
    return RunContext(run_id="test-belief")


def test_record_belief_appends_initial_snapshot():
    ctx = _new_ctx()
    snap = _record_belief(ctx, "initial")
    assert snap.snapshot_label == "initial"
    assert len(ctx.bundle.belief_evolution) == 1
    assert snap.pest_hotspot == _BELIEF_SNAPSHOTS["initial"]["pest_hotspot"]


def test_record_belief_is_idempotent_on_label():
    """If a snapshot with the same label is recorded twice, the second
    call must NOT append a duplicate (keeps the evolution stable on retry)."""
    ctx = _new_ctx()
    a = _record_belief(ctx, "after_aerial")
    b = _record_belief(ctx, "after_aerial")
    assert a is b
    assert len(ctx.bundle.belief_evolution) == 1


def test_clean_branch_for_after_leaf():
    """clean_branch=True must use the _BELIEF_AFTER_LEAF_CLEAN values
    (pest_hotspot lower, water_stress higher) — honest signal for
    'we looked and ruled out pests'."""
    ctx = _new_ctx()
    snap = _record_belief(ctx, "after_leaf", clean_branch=True)
    assert snap.snapshot_label == "after_leaf"
    assert snap.pest_hotspot == _BELIEF_AFTER_LEAF_CLEAN["pest_hotspot"]
    assert snap.water_stress == _BELIEF_AFTER_LEAF_CLEAN["water_stress"]
    # Sanity: clean branch's pest_hotspot is LOWER than the regular branch,
    # because clean = ruled out pests.
    assert snap.pest_hotspot < _BELIEF_SNAPSHOTS["after_leaf"]["pest_hotspot"]


def test_clean_branch_for_after_compare():
    ctx = _new_ctx()
    snap = _record_belief(ctx, "after_compare", clean_branch=True)
    assert snap.snapshot_label == "after_compare"
    assert snap.pest_hotspot == _BELIEF_AFTER_COMPARE_CLEAN["pest_hotspot"]
    assert snap.pest_hotspot < _BELIEF_SNAPSHOTS["after_compare"]["pest_hotspot"]


def test_water_branch_for_after_probe():
    ctx = _new_ctx()
    snap = _record_belief(ctx, "after_probe", water_branch=True)
    assert snap.snapshot_label == "after_probe"
    assert snap.water_stress == _BELIEF_AFTER_PROBE_WATER["water_stress"]
    # Water branch flips the dominant cause to water_stress.
    assert snap.water_stress > snap.pest_hotspot


def test_water_branch_only_applies_to_after_probe():
    """water_branch should only matter for label='after_probe'. Other
    labels should ignore it and use their default values."""
    ctx = _new_ctx()
    snap = _record_belief(ctx, "after_aerial", water_branch=True)
    assert snap.pest_hotspot == _BELIEF_SNAPSHOTS["after_aerial"]["pest_hotspot"]


def test_clean_branch_only_applies_to_leaf_and_compare():
    """clean_branch should only matter for after_leaf / after_compare.
    Other labels should ignore it."""
    ctx = _new_ctx()
    snap = _record_belief(ctx, "after_aerial", clean_branch=True)
    assert snap.pest_hotspot == _BELIEF_SNAPSHOTS["after_aerial"]["pest_hotspot"]


def test_full_clean_evolution_produces_6_snapshots():
    """REGRESSION: simulate a full pipeline run where the leaf VLM finds
    NO pest evidence (the bug case). The belief evolution must STILL
    contain 6 snapshots: initial, after_aerial, after_leaf, after_compare,
    after_probe, final."""
    ctx = _new_ctx()
    _record_belief(ctx, "initial")
    _record_belief(ctx, "after_aerial")
    # Clean leaf — no pest evidence found.
    _record_belief(ctx, "after_leaf", clean_branch=True)
    # Clean compare — no contrast to report.
    _record_belief(ctx, "after_compare", clean_branch=True)
    _record_belief(ctx, "after_probe", water_branch=False)
    _record_belief(ctx, "final")

    labels = [s.snapshot_label for s in ctx.bundle.belief_evolution]
    assert labels == [
        "initial",
        "after_aerial",
        "after_leaf",
        "after_compare",
        "after_probe",
        "final",
    ]
    assert len(ctx.bundle.belief_evolution) == 6


def test_full_pest_evolution_produces_6_snapshots():
    """Pest-evidence path: same 6 labels, just using the regular
    pest-rising values."""
    ctx = _new_ctx()
    for label in ("initial", "after_aerial", "after_leaf", "after_compare", "after_probe", "final"):
        _record_belief(ctx, label)
    assert len(ctx.bundle.belief_evolution) == 6
    # Pest_hotspot should rise monotonically through the evolution.
    pests = [s.pest_hotspot for s in ctx.bundle.belief_evolution]
    assert pests == sorted(pests), f"pest_hotspot should rise in pest path: {pests}"


def test_belief_values_sum_close_to_one():
    """All four causes should sum to ~1.0 (within rounding) so the
    BeliefStateStrip can render proportional widths without normalization."""
    for label, values in _BELIEF_SNAPSHOTS.items():
        total = sum(values.values())
        assert 0.99 <= total <= 1.01, f"{label} sums to {total}, expected ~1.0"
    for branch_name, values in [
        ("AFTER_PROBE_WATER", _BELIEF_AFTER_PROBE_WATER),
        ("AFTER_LEAF_CLEAN", _BELIEF_AFTER_LEAF_CLEAN),
        ("AFTER_COMPARE_CLEAN", _BELIEF_AFTER_COMPARE_CLEAN),
    ]:
        total = sum(values.values())
        assert 0.99 <= total <= 1.01, f"{branch_name} sums to {total}, expected ~1.0"
