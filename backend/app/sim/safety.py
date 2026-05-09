"""Action-token safety guard.

Models propose action tokens; this module decides whether they actually leave
the backend. Every reject is logged so the metrics page can show "the agent
tried to do X, the guard said no" — that's the story for "how do you stop the
LLM doing something stupid?"

Bounds:
    - per-sim whitelist of allowed tokens
    - magnitude clamped to [0.0, SAFETY_MAX_MAGNITUDE]   (default 0.7)
    - max actions per dispatch                            (default 12)
    - drone altitude floor                                (default 8 m AGL)
    - drone altitude ceiling                              (default 80 m AGL)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.config import settings

SimKind = Literal["drone", "robot"]

ALLOWED_DRONE_ACTIONS: frozenset[str] = frozenset(
    {
        "forward",
        "backward",
        "left",
        "right",
        "ascend",
        "descend",
        "rotate_cw",
        "rotate_ccw",
    }
)

ALLOWED_ROBOT_ACTIONS: frozenset[str] = frozenset(
    {
        # base (LeKiwi only — but we let the guard accept; sim will reject for SO101)
        "drive_forward",
        "drive_backward",
        "strafe_left",
        "strafe_right",
        "rotate_left",
        "rotate_right",
        # arm joints
        "rotate_cw",
        "rotate_ccw",
        "shoulder_up",
        "shoulder_down",
        "elbow_up",
        "elbow_down",
        "wrist_up",
        "wrist_down",
        "wrist_roll_cw",
        "wrist_roll_ccw",
        # gripper
        "grip",
        "release",
        # special
        "reset",
    }
)


@dataclass
class SafetyVerdict:
    ok: bool
    action: str
    magnitude: float
    reason: str | None = None  # populated only when ok=False
    clamped: bool = False  # True if magnitude was lowered

    def to_log(self) -> dict:
        return {
            "ok": self.ok,
            "action": self.action,
            "magnitude": self.magnitude,
            "reason": self.reason,
            "clamped": self.clamped,
        }


@dataclass
class DispatchBudget:
    """Per-dispatch counter — one instance per inspection / agent run."""

    used: int = 0
    rejections: list[dict] = field(default_factory=list)

    def remaining(self) -> int:
        return max(0, settings.safety_max_actions_per_dispatch - self.used)


def _clamp_mag(mag: float | int | None) -> tuple[float, bool]:
    try:
        m = float(mag) if mag is not None else 0.0
    except (TypeError, ValueError):
        m = 0.0
    if m != m:  # NaN guard
        m = 0.0
    cap = settings.safety_max_magnitude
    clamped = m > cap or m < 0.0
    return max(0.0, min(cap, m)), clamped


def review_action(
    sim: SimKind,
    action: str,
    magnitude: float,
    *,
    budget: DispatchBudget | None = None,
    drone_alt_agl: float | None = None,
) -> SafetyVerdict:
    """Decide whether an action is allowed; return a verdict.

    `budget` is required if you want max-N enforcement. `drone_alt_agl` is the
    drone's current AGL at the moment of dispatch — used to enforce the
    ascend/descend ceiling and floor.
    """
    allowed = ALLOWED_DRONE_ACTIONS if sim == "drone" else ALLOWED_ROBOT_ACTIONS

    if not isinstance(action, str) or action not in allowed:
        verdict = SafetyVerdict(False, str(action), 0.0, reason=f"action '{action}' not in {sim} whitelist")
        if budget is not None:
            budget.rejections.append(verdict.to_log())
        return verdict

    mag, clamped = _clamp_mag(magnitude)

    if budget is not None and budget.remaining() <= 0:
        verdict = SafetyVerdict(
            False,
            action,
            mag,
            reason=f"dispatch budget exhausted ({settings.safety_max_actions_per_dispatch})",
        )
        budget.rejections.append(verdict.to_log())
        return verdict

    if sim == "drone" and drone_alt_agl is not None:
        if action == "ascend" and drone_alt_agl >= settings.safety_drone_max_agl_m:
            verdict = SafetyVerdict(
                False,
                action,
                mag,
                reason=f"drone at ceiling ({drone_alt_agl:.1f} m AGL >= {settings.safety_drone_max_agl_m} m)",
            )
            if budget is not None:
                budget.rejections.append(verdict.to_log())
            return verdict
        if action == "descend" and drone_alt_agl <= settings.safety_drone_min_agl_m:
            verdict = SafetyVerdict(
                False,
                action,
                mag,
                reason=f"drone at floor ({drone_alt_agl:.1f} m AGL <= {settings.safety_drone_min_agl_m} m)",
            )
            if budget is not None:
                budget.rejections.append(verdict.to_log())
            return verdict

    if budget is not None:
        budget.used += 1
    return SafetyVerdict(True, action, mag, clamped=clamped)
