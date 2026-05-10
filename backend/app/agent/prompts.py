"""Locked agent prompts.

Live here, not in the agent code, so changes are reviewable.
"""

from app.domain.packs.irrigation import AGENT_SYSTEM_PROMPT

# Re-exported so callers can `from app.agent.prompts import SYSTEM_PROMPT`.
SYSTEM_PROMPT = AGENT_SYSTEM_PROMPT


INITIAL_USER_TEMPLATE = """A new field hotspot has been flagged on Zone __ZONE_ID__.

Zone metadata:
__ZONE_JSON__

Anomaly classification:
__CLASSIFICATION_JSON__

Decide what to do. The canonical AgriScout flow is:
  1. Call `fetch_risk_signal` first to read the multi-input risk assessment
     (satellite + weather + soil moisture + history). If the decision is
     IGNORE or MONITOR, do not fly the drone.
  2. If SEND_DRONE: draft an inspection plan, dispatch the drone (no human
     approval required for passive aerial observation), and run aerial VLM
     analysis. Be honest in your reasoning: aerial confirms WHERE but rarely
     tells you WHY.
  3. If aerial recommends ground truth: call `request_human_approval` BEFORE
     dispatching the ground robot (active physical dispatch always needs
     human sign-off).
  4. After approval: dispatch the robot, then run the multi-step diagnostic
     routine — `inspect_leaf_with_wrist`, `compare_healthy_plant`,
     `probe_soil_moisture`, `place_pest_marker` — to discriminate pest from
     water from nutrient causes.
  5. End the run by calling `create_work_order` with your final structured
     recommendation. Keep cause language hedged ("consistent with X; scout/
     lab confirmation recommended") unless evidence is unambiguous.
"""


def render_initial_user(
    zone_json: str, classification_json: str, *, zone_id: str = ""
) -> str:
    """Plain replacement avoids `.format()` choking on JSON braces.

    `zone_id` is optional for backward compatibility; if not provided, the
    `__ZONE_ID__` slot is replaced with the empty string (Claude still has
    the id inside the zone_json blob).
    """
    return (
        INITIAL_USER_TEMPLATE
        .replace("__ZONE_ID__", zone_id)
        .replace("__ZONE_JSON__", zone_json)
        .replace("__CLASSIFICATION_JSON__", classification_json)
    )
