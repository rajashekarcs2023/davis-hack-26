"""Locked agent prompts.

Live here, not in the agent code, so changes are reviewable.
"""

from app.domain.packs.irrigation import AGENT_SYSTEM_PROMPT

# Re-exported so callers can `from app.agent.prompts import SYSTEM_PROMPT`.
SYSTEM_PROMPT = AGENT_SYSTEM_PROMPT


INITIAL_USER_TEMPLATE = """A new field anomaly has been flagged.

Zone metadata:
__ZONE_JSON__

Anomaly classification:
__CLASSIFICATION_JSON__

Decide what to do. Use your tools to gather any additional evidence you need
(drone aerial verify, ground-truth via robot, etc.), then ask the operator for
approval before any drone or robot dispatch. End the run by calling
`create_work_order` with your final structured recommendation.
"""


def render_initial_user(zone_json: str, classification_json: str) -> str:
    """Plain replacement avoids `.format()` choking on JSON braces."""
    return (
        INITIAL_USER_TEMPLATE
        .replace("__ZONE_JSON__", zone_json)
        .replace("__CLASSIFICATION_JSON__", classification_json)
    )
