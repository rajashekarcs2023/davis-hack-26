"""ER-as-embodied-reasoning-policy helpers.

Translates the `ErPolicyStep.target_point` (where Gemini Robotics-ER says
the robot should look next) into concrete SO101 action tokens the sim can
execute. This is the thin deterministic layer between the VL model's
spatial reasoning and our robot action vocabulary.

Why this split exists
---------------------
Gemini Robotics-ER is a vision-language *embodied reasoning* model — it
outputs spatial targets in normalized image coordinates (0..1000 for each
of y, x, where (500, 500) is the frame center). It does NOT output
joint-level motor commands.

To close the loop from "ER says look at [420, 510]" to "robot physically
moves its wrist cam to center on that point", we need a translator. That
translator is what this module provides.

The translator is intentionally simple (and easy to defend in technical
Q&A): it interprets the pixel delta between the current wrist-cam center
and ER's target as rough direction signals:

    target y < current y ────────► need to tilt cam UP    (wrist_up)
    target y > current y ────────► need to tilt cam DOWN  (wrist_down)
    target x < current x ────────► need to pan cam LEFT   (wrist_roll_ccw)
    target x > current x ────────► need to pan cam RIGHT  (wrist_roll_cw)

Plus a "reach closer" step if the pose is still far from an
inspection-posture (shoulder still near neutral).

Magnitudes scale with the pixel delta so small adjustments produce small
motions and vice-versa. All magnitudes are clamped below 0.5 to keep the
motion smooth / inspection-feeling rather than a big traversal.

The pitch-honest framing: "Gemini Robotics-ER emits the where; a small
deterministic translator with a safety guard emits the how." This mirrors
how Google's own stack pairs Robotics-ER (reasoning) with Robotics 1.6
(full VLA / action generation).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol

from app.schemas import RobotAction, Zone

logger = logging.getLogger("agriscout.er_policy")


# Frame-space constants. Matches the 0..1000 normalized coordinate system
# used by all our VLM outputs (both Gemini Robotics-ER native and our
# Gemma prompt-level emulation of it).
FRAME_CENTER_Y = 500
FRAME_CENTER_X = 500

# A delta of FRAME_DELTA_UNIT pixels in the normalized frame produces
# exactly magnitude=1.0 in the action token. We cap the actual magnitude
# below MAX_STEP_MAGNITUDE so any single ER step stays in "inspection"
# territory rather than big-traversal.
FRAME_DELTA_UNIT = 300.0  # 30% of the frame width/height at max
MAX_STEP_MAGNITUDE = 0.5  # never emit a magnitude above this from a single ER step
MIN_STEP_MAGNITUDE = 0.12  # below this, the motion is so subtle the sim effectively no-ops — skip it


def _proportional_magnitude(delta: float) -> float:
    """Convert an absolute pixel delta into a motion-token magnitude.

    `delta` is already absolute (caller takes abs). Returns 0.0 if the
    delta is too small to bother moving for. Clamps to MAX_STEP_MAGNITUDE.
    """
    mag = min(MAX_STEP_MAGNITUDE, abs(delta) / FRAME_DELTA_UNIT)
    return mag if mag >= MIN_STEP_MAGNITUDE else 0.0


def target_point_to_actions(
    target_point: list[int],
    current_pose: dict[str, float],
) -> list[RobotAction]:
    """Translate an ER target point into a list of SO101 action tokens.

    Args:
        target_point: [y, x] in 0..1000; where ER says the wrist cam
            should center next.
        current_pose: current joint angles (from robot.get_state().joints).
            Used to decide whether a "reach closer" (shoulder_down) is
            needed before fine wrist adjustments.

    Returns:
        A list of `RobotAction` tokens. May be empty if the target is
        already close enough to center and the arm is already in
        inspection posture (in which case the caller should terminate
        the loop).
    """
    if not isinstance(target_point, list) or len(target_point) != 2:
        return []

    try:
        ty, tx = int(target_point[0]), int(target_point[1])
    except (TypeError, ValueError):
        return []

    # Clamp the target into the valid range so we don't emit weird actions
    # if the VLM hallucinates out-of-bounds coordinates.
    ty = max(0, min(1000, ty))
    tx = max(0, min(1000, tx))

    dy = ty - FRAME_CENTER_Y  # > 0 = target is LOWER in frame → tilt cam DOWN
    dx = tx - FRAME_CENTER_X  # > 0 = target is to the RIGHT → pan cam CW

    actions: list[RobotAction] = []

    # --- Vertical (tilt wrist pitch) ---
    mag_y = _proportional_magnitude(dy)
    if mag_y > 0:
        if dy > 0:
            actions.append(RobotAction(action="wrist_down", magnitude=mag_y))
        else:
            actions.append(RobotAction(action="wrist_up", magnitude=mag_y))

    # --- Horizontal (pan wrist roll) ---
    mag_x = _proportional_magnitude(dx)
    if mag_x > 0:
        if dx > 0:
            actions.append(RobotAction(action="wrist_roll_cw", magnitude=mag_x))
        else:
            actions.append(RobotAction(action="wrist_roll_ccw", magnitude=mag_x))

    # --- Reach closer if shoulder is still near-neutral ---
    # The wrist cam can only point — if the arm itself isn't close to the
    # leaf, pointing alone won't help. The shoulder Pitch joint is
    # negative when the shoulder is rolled down (moving toward the
    # workspace). If we're close to neutral (>-20°) and ER says we need
    # to look LOWER in frame (dy > 50), we should also dip the shoulder.
    shoulder_pitch = current_pose.get("Pitch", 0.0)
    if dy > 50 and shoulder_pitch > -20.0:
        actions.append(RobotAction(action="shoulder_down", magnitude=0.30))

    return actions


def is_goal_reached(step: "object", max_remaining_steps: int) -> bool:
    """Helper so callers don't need to type-check the schema inline.

    Returns True if the ER step explicitly declared "arrived" or we've
    run out of steps (fail-safe — don't loop forever).
    """
    status = getattr(step, "status", None)
    if status == "arrived" or status == "lost":
        return True
    if max_remaining_steps <= 0:
        return True
    return False


# ---------------------------------------------------------------------------
# Reusable closed-loop policy runner
# ---------------------------------------------------------------------------


class _VlmWithErPolicy(Protocol):
    """Structural type for the VLM clients we accept here.

    We only need `analyze_er_policy(frame, zone, goal, current_pose)` and
    a `name` attribute for tracing — anything that satisfies that works.
    """

    name: str

    async def analyze_er_policy(
        self,
        frame_b64: str,
        zone: Zone,
        goal: str,
        current_pose: dict[str, float],
    ) -> Any: ...


class _RobotAdapter(Protocol):
    async def get_state(self) -> Any: ...
    async def dispatch(self, actions: list[RobotAction], budget: Any) -> Any: ...


class _FrameCache(Protocol):
    async def wait_for_usable_frame(self, *, timeout_s: float) -> str | None: ...


async def run_er_policy_loop(
    *,
    vlm: _VlmWithErPolicy,
    robot: _RobotAdapter,
    cache: _FrameCache,
    zone: Zone,
    goal: str,
    budget: Any,
    safety_rejections: list[dict[str, Any]],
    max_steps: int = 5,
    settle_pause_s: float = 0.4,
    frame_timeout_s: float = 2.0,
) -> tuple[list[dict[str, Any]], list[RobotAction], list[dict[str, Any]], str | None]:
    """Run the ER-as-policy closed loop until convergence or step cap.

    Each iteration:
        1. capture wrist-cam frame (b64)
        2. read current pose
        3. ask vlm.analyze_er_policy(frame, zone, goal, pose)
                → ErPolicyStep{target_point, status, reasoning}
        4. if status ∈ {arrived, lost} → break
        5. translate target_point → SO101 action tokens
        6. if no actions emitted (target near center) → break
        7. dispatch actions, settle, loop

    Used by every ground-robot diagnostic tool to do the "navigate to the
    target" prefix in a VLM-driven way before falling through to the
    tool's domain-specific motion (probe insertion, gripper open/close,
    leaf VLM, etc.). Centralizing this here means we get one place to
    tune timing, fallback semantics, and trace formatting.

    Args:
        vlm: any client with analyze_er_policy + a name attribute
        robot: robot adapter (must have get_state + dispatch)
        cache: wrist-cam frame cache (must have wait_for_usable_frame)
        zone: current target zone (passed to the VLM for context)
        goal: free-form English description of what ER should target.
            E.g. "Center the wrist camera on the affected leaf" or
            "Center on a clear soil patch beside the affected plant".
        budget: ctx.budget — passed through to robot.dispatch for safety
        safety_rejections: ctx.safety_rejections — appended to (mutated)
            so the run summary surfaces any rejected actions
        max_steps: upper bound on ER iterations. Each iter is ~0.5-3s
            wall-clock so 5 caps total time around ~15s in worst case.
        settle_pause_s: time to sleep after each dispatch so the wrist
            cam frame catches up before the next ER step.
        frame_timeout_s: per-iteration frame-cache wait. Short by design
            so a backgrounded sim tab doesn't stall the whole loop.

    Returns:
        (er_trace, accepted_actions, rejected_actions, fallback_reason)

        er_trace: list of dicts {step, status, target_point, reasoning}
            — what the ER model said at each iteration
        accepted_actions / rejected_actions: dispatched motion tokens
        fallback_reason: None on success. Otherwise a short string the
            caller should use to decide whether to run their scripted
            fallback motion. Possible values:
              "backend_missing_analyze_er_policy"
              "er_policy_exception: <exc>"
              "er_loop_no_actions"
    """
    er_trace: list[dict[str, Any]] = []
    accepted: list[RobotAction] = []
    rejected: list[dict[str, Any]] = []
    fallback_reason: str | None = None

    if not hasattr(vlm, "analyze_er_policy"):
        return er_trace, accepted, rejected, "backend_missing_analyze_er_policy"

    for step_ix in range(max_steps):
        frame = await cache.wait_for_usable_frame(timeout_s=frame_timeout_s)
        state = await robot.get_state()
        current_pose = dict(state.joints)

        try:
            er_step = await vlm.analyze_er_policy(
                frame or "",
                zone,
                goal=goal,
                current_pose=current_pose,
            )
        except Exception as exc:
            logger.warning(
                "ER policy VLM failed at step %d (%s); breaking loop",
                step_ix + 1,
                exc,
            )
            fallback_reason = f"er_policy_exception: {exc}"
            break

        er_trace.append(
            {
                "step": step_ix + 1,
                "status": er_step.status,
                "target_point": er_step.target_point,
                "reasoning": er_step.reasoning,
            }
        )

        if er_step.status in ("arrived", "lost"):
            break

        actions = target_point_to_actions(er_step.target_point, current_pose)
        if not actions:
            # Model emitted a target too close to center — treat as
            # "good enough" and stop the loop. This is a benign
            # convergence signal, not a failure.
            break

        step_result = await robot.dispatch(actions, budget)
        safety_rejections.extend(step_result.rejected)
        accepted.extend(step_result.accepted)
        rejected.extend(step_result.rejected)

        # Small settle pause so the wrist-cam frame updates before
        # the next ER iteration sees the new view.
        await asyncio.sleep(settle_pause_s)

    # If the loop ran without errors but produced no accepted actions,
    # mark it as needing a scripted fallback so the demo still shows
    # visible motion. Otherwise the run looks dead even though ER
    # silently converged on "no movement needed".
    if not accepted and fallback_reason is None:
        fallback_reason = "er_loop_no_actions"

    return er_trace, accepted, rejected, fallback_reason
