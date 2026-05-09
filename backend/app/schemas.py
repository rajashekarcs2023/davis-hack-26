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
