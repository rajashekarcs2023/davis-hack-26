"""Pydantic models — the wire format for every API surface and the agent's tool I/O.

If you change something here, update `architecture.md §8` (frontend contract).
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Field / anomaly
# ---------------------------------------------------------------------------


class AnomalyPattern(str, Enum):
    NORMAL = "normal"
    ROW_ALIGNED = "row_aligned"
    PATCHY = "patchy"
    EDGE = "edge"
    UNIFORM_LOW = "uniform_low"


class AnomalyLabel(str, Enum):
    NORMAL = "normal"
    MILD_STRESS_MONITOR = "mild_stress_monitor"
    NEEDS_IRRIGATION_INSPECTION = "needs_irrigation_inspection"
    NEEDS_HUMAN_REVIEW = "needs_human_review"
    FALSE_ALARM_CLOUD_NOISE = "false_alarm_cloud_noise"
    # AgriScout multi-cause labels (added in pivot). The drone confirms a
    # hotspot exists; these labels are the cause-hypotheses the agent picks
    # between with help from ground-robot diagnostics.
    PEST_HOTSPOT_SUSPECTED = "pest_hotspot_suspected"
    WATER_STRESS_SUSPECTED = "water_stress_suspected"
    NUTRIENT_DEFICIT_SUSPECTED = "nutrient_deficit_suspected"


class Zone(BaseModel):
    """One cell in the field grid."""

    zone_id: str
    lat: float
    lon: float
    ndvi: float
    ndvi_baseline: float
    ndvi_drop: float
    pattern: AnomalyPattern
    neighbor_avg_ndvi: float
    anomaly_score: float = Field(ge=0.0, le=1.0)
    label: AnomalyLabel | None = None  # ground truth (eval only)


class FieldGrid(BaseModel):
    field_id: str
    name: str
    center_lat: float
    center_lon: float
    rows: int
    cols: int
    zones: list[Zone]


# ---------------------------------------------------------------------------
# Plan / approval / execution
# ---------------------------------------------------------------------------


class DroneAction(BaseModel):
    action: str  # forward, backward, left, right, ascend, descend, rotate_cw, rotate_ccw
    magnitude: float = Field(ge=0.0, le=1.0)


class RobotAction(BaseModel):
    action: str  # see robotsim action vocab
    magnitude: float = Field(ge=0.0, le=1.0)


class InspectionPlan(BaseModel):
    """What Claude proposes before we ask the human to approve."""

    zone_id: str
    likely_issue: str
    urgency: str  # low | medium | high
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    drone_path_hint: list[DroneAction] = Field(default_factory=list)
    robot_path_hint: list[RobotAction] = Field(default_factory=list)
    requires_human_approval: bool = True


class ApprovalDecision(BaseModel):
    run_id: str
    approved: bool
    edited_plan: InspectionPlan | None = None
    note: str | None = None


# ---------------------------------------------------------------------------
# VLM
# ---------------------------------------------------------------------------


class EvidencePoint(BaseModel):
    """A pointed-to location in an image, in Gemini Robotics-ER 1.6 format.

    `point` is `[y, x]` normalized to 0-1000 (the model's native output format —
    see docs/gemini-robotics.md "Pointing to objects"). Frontend can overlay
    these on the rendered drone/robot frame to visualize what the VLM saw.
    """

    point: list[int]  # [y, x] in 0..1000
    label: str


class AerialAnalysis(BaseModel):
    visible: bool
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str]
    evidence_points: list[EvidencePoint] = Field(default_factory=list)
    recommend_ground_truth: bool


class GroundAnalysis(BaseModel):
    dry_soil: bool
    wilted_leaves: bool
    damaged_drip_line: bool
    other_evidence: list[str]
    evidence_points: list[EvidencePoint] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# AgriScout multi-cause diagnostics (added in pivot)
# ---------------------------------------------------------------------------


class RiskAssessment(BaseModel):
    """Multi-input risk score that decides whether the drone is dispatched.

    Inputs are blended from satellite anomaly score, weather pest-risk index,
    soil-moisture sensor reading, and historical hotspot history. The combined
    score drives the `decision` enum and the human-readable `reason` text.

    Demo note: weather, soil, and history inputs are seeded deterministically
    per-zone for reproducibility. Production would wire to NWS API + ground
    sensors + an outbreak-history database.
    """

    zone_id: str
    satellite_anomaly_score: float = Field(ge=0.0, le=1.0)
    weather_pest_risk: float = Field(ge=0.0, le=1.0)
    soil_moisture: str  # "low" | "normal" | "high"
    historical_hotspot_risk: float = Field(ge=0.0, le=1.0)
    combined_risk_score: float = Field(ge=0.0, le=1.0)
    decision: str  # IGNORE | MONITOR | SEND_DRONE | SEND_GROUND_ROBOT | CREATE_WORK_ORDER
    reason: str


class BeliefState(BaseModel):
    """Snapshot of the agent's posterior belief over candidate causes.

    Probabilities sum to ~1.0 (we don't enforce strictly because rounding
    matters for the UI). The `snapshot_label` tags WHEN this snapshot was
    taken so the frontend can animate transitions.
    """

    pest_hotspot: float = Field(ge=0.0, le=1.0)
    water_stress: float = Field(ge=0.0, le=1.0)
    nutrient_deficit: float = Field(ge=0.0, le=1.0)
    false_alarm: float = Field(ge=0.0, le=1.0)
    snapshot_label: str  # "initial" | "after_aerial" | "after_leaf" | "after_compare" | "after_probe" | "final"


class LeafEvidence(BaseModel):
    """Wrist-cam VLM output for a single leaf inspection.

    Pest-specific signals get explicit booleans so the belief-state computer
    can reason about them without parsing free text. `other` carries anything
    the VLM saw that didn't fit the schema.
    """

    stippling: bool = False
    webbing: bool = False
    egg_masses: bool = False
    discoloration: bool = False
    other: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_points: list[EvidencePoint] = Field(default_factory=list)


class SoilProbeReading(BaseModel):
    """Simulated soil-moisture probe reading.

    Honest framing: `note` always carries a disclaimer that this is a
    simulated sensor. Production would call into a real probe driver.
    """

    moisture_pct: float = Field(ge=0.0, le=100.0)
    interpretation: str  # "dry" | "normal" | "wet"
    note: str = "(simulated sensor reading)"


class DiagnosticBundle(BaseModel):
    """All ground-robot diagnostic outputs collected during a run.

    Order matches the demo flow: leaf inspection → healthy comparison →
    soil probe → marker placement. The `belief_evolution` list is the
    sequence of BeliefState snapshots taken at each major step.
    """

    leaf_affected: LeafEvidence | None = None
    leaf_healthy: LeafEvidence | None = None
    soil_probe: SoilProbeReading | None = None
    marker_placed: bool = False
    belief_evolution: list[BeliefState] = Field(default_factory=list)


class ErPolicyStep(BaseModel):
    """One step of the Gemini Robotics-ER closed-loop embodied-reasoning policy.

    The agent loop is:
        for step in range(max_steps):
            frame = <wrist cam>
            step = vlm.analyze_er_policy(frame, zone, goal, current_pose)
            if step.status == "arrived": break
            actions = translate(step.target_point) -> [RobotAction, ...]
            robot.dispatch(actions)

    `target_point` uses the same [y, x] 0..1000 normalized convention as the
    rest of our VLM outputs (Gemini Robotics-ER native pointing format).
    `status` is the ER model's own assessment of whether the goal is met
    so the loop can terminate on its own instead of always burning all steps.
    """

    target_point: list[int]  # [y, x] in 0..1000; where the robot should center the wrist cam next
    status: str  # "navigating" | "arrived" | "lost"
    reasoning: str  # short human-readable sentence; rendered in the VLA action log


# ---------------------------------------------------------------------------
# Run + work order
# ---------------------------------------------------------------------------


class RunStatus(str, Enum):
    PENDING = "pending"
    PLANNING = "planning"
    AWAITING_APPROVAL = "awaiting_approval"
    EXECUTING = "executing"
    COMPLETED = "completed"
    REJECTED = "rejected"
    FAILED = "failed"


class RunOutcome(str, Enum):
    WORK_ORDER_CREATED = "work_order_created"
    NO_ACTION_NEEDED = "no_action_needed"
    REJECTED_BY_HUMAN = "rejected_by_human"
    SAFETY_REJECTED = "safety_rejected"
    SIM_FAILURE = "sim_failure"
    LLM_FAILURE = "llm_failure"


class WorkOrder(BaseModel):
    work_order_id: str
    zone_id: str
    issue: str
    priority: str
    evidence: list[str]
    recommended_action: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))


class RunSummary(BaseModel):
    run_id: str
    field_id: str
    zone_id: str
    status: RunStatus
    outcome: RunOutcome | None = None
    plan: InspectionPlan | None = None
    aerial_analysis: AerialAnalysis | None = None
    ground_analysis: GroundAnalysis | None = None
    work_order: WorkOrder | None = None
    # AgriScout multi-cause additions (added in pivot). Both optional so the
    # legacy irrigation flow keeps deserializing without changes.
    risk_assessment: RiskAssessment | None = None
    diagnostic_bundle: DiagnosticBundle | None = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    finished_at: datetime | None = None
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    safety_rejections: list[dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Sim state mirrors (matches what the DAC bridges return)
# ---------------------------------------------------------------------------


class DroneState(BaseModel):
    lat: float | None = None
    lon: float | None = None
    altAgl: float | None = None
    altMsl: float | None = None
    heading: float | None = None
    speed: float | None = None
    timestamp: float | None = None


class RobotState(BaseModel):
    type: str = "state"
    robot: str | None = None
    joints: dict[str, float] = Field(default_factory=dict)
    base_pose: dict[str, float] | None = None
    task_status: str | None = None
    objects: list[dict[str, Any]] = Field(default_factory=list)
    timestamp: float | None = None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    ok: bool
    sims: dict[str, bool]
    vlm: str
    has_anthropic: bool
    has_google: bool
    version: str
