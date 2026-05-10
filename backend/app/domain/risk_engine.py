"""Multi-input risk trigger for AgriScout.

This is the "Why drone now?" panel's data source. The story we tell:

    The drone is not flown blindly on a satellite anomaly. It is dispatched
    only when MULTIPLE risk signals — satellite + weather + soil moisture +
    historical hotspot pattern — converge on an actionable but ambiguous
    risk. That ambiguity is what justifies aerial verification.

Production wiring would be:
    - satellite_anomaly_score: from `anomaly_engine.compute_anomaly_score`
    - weather_pest_risk:       from National Weather Service / NOAA degree-day
                               models for the relevant pest (e.g. spider mite
                               degree-day accumulation in strawberries)
    - soil_moisture:           from a ground-sensor partner (Davis Instruments,
                               Pessl Metos, or similar) keyed by zone
    - historical_hotspot_risk: from a per-field outbreak history table

For the demo, weather + soil + history are SEEDED DETERMINISTICALLY per zone
so the demo always reproduces. The seeding is documented and intentional —
it's the same kind of mock data the placeholder.ts file uses on the frontend.

The combined score and decision rule are real (not mocked). The decision
fork is the actual logic the agent will use to choose escalation level.
"""

from __future__ import annotations

import hashlib
from typing import Literal

from app.domain.anomaly_engine import annotate_grid, classify_zone, load_field_grid
from app.schemas import RiskAssessment, Zone

# ---------------------------------------------------------------------------
# Decision fork
# ---------------------------------------------------------------------------

Decision = Literal[
    "IGNORE",
    "MONITOR",
    "SEND_DRONE",
    "SEND_GROUND_ROBOT",
    "CREATE_WORK_ORDER",
]


# ---------------------------------------------------------------------------
# Per-zone deterministic mock inputs
# ---------------------------------------------------------------------------


def _seeded_unit(zone_id: str, salt: str) -> float:
    """Hash zone+salt -> stable float in [0, 1).

    Why hashing instead of `random.seed()`: avoids global RNG state pollution
    and lets us pull multiple independent values per zone with no ordering
    coupling between calls.
    """
    h = hashlib.sha256(f"{zone_id}::{salt}::agriscout-v1".encode()).hexdigest()
    # Take 8 hex chars -> uint32 -> normalize to [0, 1).
    return int(h[:8], 16) / 0xFFFFFFFF


def _mock_weather_pest_risk(zone_id: str) -> float:
    """Pretend NOAA degree-day index for spider mite. 0 = low risk, 1 = high.

    Seeded so each zone has a stable but distinct value. We bias upward by
    +0.4 so the demo zone (B3) surfaces a meaningful risk instead of noise.
    """
    return min(1.0, 0.4 + 0.55 * _seeded_unit(zone_id, "weather"))


def _mock_soil_moisture(zone_id: str) -> tuple[str, float]:
    """Return ("low" | "normal" | "high", probe_pct).

    For the AgriScout demo we want the headline zone (B3) to read NORMAL —
    that's the whole point: soil moisture rules OUT water stress and forces
    the agent to consider pest/nutrient causes. Other zones get random.
    """
    if zone_id == "B3":
        return "normal", 42.0  # normal = ~30-55%
    u = _seeded_unit(zone_id, "soil")
    if u < 0.33:
        return "low", round(15.0 + u * 30.0, 1)
    if u < 0.66:
        return "normal", round(30.0 + u * 25.0, 1)
    return "high", round(55.0 + u * 30.0, 1)


def _mock_historical_hotspot_risk(zone_id: str) -> float:
    """Per-field outbreak history. Higher if this zone has been a hotspot before.

    Seeded so it's stable across runs. We bias zone B3 high because it's the
    demo zone and the story is "this block had spider-mite pressure last
    season too — high prior risk".
    """
    if zone_id == "B3":
        return 0.62
    return round(0.15 + 0.6 * _seeded_unit(zone_id, "history"), 2)


# ---------------------------------------------------------------------------
# Combined score + decision
# ---------------------------------------------------------------------------


# Weights chosen so that:
#   - satellite alone @ 0.6 + everything else 0      -> 0.30 (MONITOR)
#   - satellite 0.6 + weather 0.7 + history 0.6      -> 0.62 (SEND_DRONE)
#   - everything high                                -> ~0.85 (SEND_DRONE)
# Soil moisture only down-weights pest hypothesis; it's not in the combined
# score because "soil moisture normal" is a *piece of information*, not a
# risk amplifier — its role is to tip the agent toward pest vs water cause
# AFTER the drone confirms the hotspot. We surface it on the panel for
# completeness and because it shapes the agent's reasoning.
_WEIGHTS = {
    "satellite": 0.50,
    "weather": 0.30,
    "history": 0.20,
}


def _combine(satellite: float, weather: float, history: float) -> float:
    raw = (
        _WEIGHTS["satellite"] * satellite
        + _WEIGHTS["weather"] * weather
        + _WEIGHTS["history"] * history
    )
    return round(min(1.0, raw), 3)


def _decide(combined: float, satellite: float) -> Decision:
    """Decision fork. Tuned so the demo zone (~0.81) lands on SEND_DRONE.

    Rationale per band:
      < 0.20: nothing to do — IGNORE.
      < 0.45: weak but interesting — MONITOR (revisit on next satellite pass).
      < 0.85: meaningful but ambiguous — SEND_DRONE for visual confirmation.
      >= 0.85 with very strong satellite signal: enough to bypass drone if
              budget is tight. We still SEND_DRONE in the demo because that's
              the story; production could route this directly to robot.
    """
    if combined < 0.20:
        return "IGNORE"
    if combined < 0.45:
        return "MONITOR"
    return "SEND_DRONE"


def _reason(
    decision: Decision,
    satellite: float,
    weather: float,
    soil_moisture: str,
    history: float,
    combined: float,
) -> str:
    """One-sentence human-readable summary the UI panel renders.

    Each sentence anchors to the dominant input so the user sees WHY this
    decision was made, not just that it was made.
    """
    if decision == "IGNORE":
        return (
            f"Combined risk {combined:.2f} below action threshold; signal is "
            "consistent with normal field variability."
        )
    if decision == "MONITOR":
        return (
            f"Combined risk {combined:.2f} is elevated but inconclusive. "
            "Will re-evaluate on the next satellite pass before committing aerial resources."
        )
    # SEND_DRONE — explain WHY the drone is the right next step
    moisture_clause = (
        "soil moisture is in the normal range, which rules out irrigation "
        "stress and points toward pest or nutrient causes"
        if soil_moisture == "normal"
        else f"soil moisture is {soil_moisture}, which is consistent with the satellite signal"
    )
    return (
        f"Combined risk {combined:.2f} is elevated and ambiguous: satellite "
        f"shows localized stress (score {satellite:.2f}), weather is favorable "
        f"to pest activity ({weather:.2f}), and {moisture_clause}. "
        "Aerial confirmation is needed because the satellite alone cannot "
        "distinguish pest pressure from nutrient deficit."
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def assess_risk(zone_id: str) -> RiskAssessment:
    """Build a `RiskAssessment` for `zone_id` from satellite + mock inputs.

    Raises:
        ValueError: if `zone_id` does not exist in the loaded field grid.
    """
    grid = annotate_grid(load_field_grid())
    by_id = {z.zone_id: z for z in grid.zones}
    if zone_id not in by_id:
        raise ValueError(f"unknown zone {zone_id}")

    zone: Zone = by_id[zone_id]
    satellite = float(zone.anomaly_score)
    weather = round(_mock_weather_pest_risk(zone_id), 2)
    soil_label, _soil_pct = _mock_soil_moisture(zone_id)
    history = _mock_historical_hotspot_risk(zone_id)
    combined = _combine(satellite, weather, history)
    decision = _decide(combined, satellite)
    reason = _reason(decision, satellite, weather, soil_label, history, combined)

    return RiskAssessment(
        zone_id=zone_id,
        satellite_anomaly_score=round(satellite, 2),
        weather_pest_risk=weather,
        soil_moisture=soil_label,
        historical_hotspot_risk=history,
        combined_risk_score=combined,
        decision=decision,
        reason=reason,
    )


def soil_moisture_pct(zone_id: str) -> float:
    """Expose the underlying probe reading for the `probe_soil_moisture` tool.

    Kept here (not in tools.py) so the same deterministic seed drives both
    the risk panel and the robot probe — the farmer should never see the
    panel say "normal" and then the robot probe report "dry".
    """
    _label, pct = _mock_soil_moisture(zone_id)
    return pct


__all__ = ["assess_risk", "soil_moisture_pct", "Decision"]
