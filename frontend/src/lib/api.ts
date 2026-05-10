/**
 * Typed API client for the AgriScout backend (FastAPI on :8000).
 *
 * In dev the Vite proxy maps `/api/*` -> `http://localhost:8000/api/*`
 * (see vite.config.ts), so all calls in this file use relative URLs.
 * That also means this works unchanged when a phone hits the laptop's IP:
 *   1. phone -> http://<laptop-ip>:5174/  (Vite, served via --host)
 *   2. fetch('/api/runs') -> Vite proxies to http://localhost:8000/api/runs
 *
 * Wire shapes mirror `backend/app/schemas.py` 1:1. If you change the backend
 * response shape, mirror the change here.
 */

// ---------------------------------------------------------------------------
// Wire types — keep in sync with backend/app/schemas.py
// ---------------------------------------------------------------------------

export type RunStatus =
  | "pending"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "rejected"
  | "failed";

export type RunOutcome =
  | "work_order_created"
  | "no_action_needed"
  | "rejected_by_human"
  | "safety_rejected"
  | "sim_failure"
  | "llm_failure";

export type DroneAction = {
  action: string;
  magnitude: number;
};

export type RobotAction = {
  action: string;
  magnitude: number;
};

export type EvidencePoint = {
  /** [y, x] normalized 0..1000 (Gemini Robotics-ER format). */
  point: [number, number];
  label: string;
};

export type InspectionPlan = {
  zone_id: string;
  likely_issue: string;
  urgency: "low" | "medium" | "high";
  confidence: number;
  reasoning: string;
  drone_path_hint: DroneAction[];
  robot_path_hint: RobotAction[];
  requires_human_approval: boolean;
};

export type AerialAnalysis = {
  visible: boolean;
  confidence: number;
  evidence: string[];
  evidence_points: EvidencePoint[];
  recommend_ground_truth: boolean;
};

export type GroundAnalysis = {
  dry_soil: boolean;
  wilted_leaves: boolean;
  damaged_drip_line: boolean;
  other_evidence: string[];
  evidence_points: EvidencePoint[];
  confidence: number;
};

// ---------------------------------------------------------------------------
// AgriScout multi-cause diagnostics (added in pivot)
// ---------------------------------------------------------------------------

export type RiskDecision =
  | "IGNORE"
  | "MONITOR"
  | "SEND_DRONE"
  | "SEND_GROUND_ROBOT"
  | "CREATE_WORK_ORDER";

export type SoilMoistureLabel = "low" | "normal" | "high";

export type RiskAssessment = {
  zone_id: string;
  satellite_anomaly_score: number;
  weather_pest_risk: number;
  soil_moisture: SoilMoistureLabel;
  historical_hotspot_risk: number;
  combined_risk_score: number;
  decision: RiskDecision;
  reason: string;
};

export type BeliefSnapshotLabel =
  | "initial"
  | "after_aerial"
  | "after_leaf"
  | "after_compare"
  | "after_probe"
  | "final";

export type BeliefState = {
  pest_hotspot: number;
  water_stress: number;
  nutrient_deficit: number;
  false_alarm: number;
  snapshot_label: BeliefSnapshotLabel;
};

export type LeafEvidence = {
  stippling: boolean;
  webbing: boolean;
  egg_masses: boolean;
  discoloration: boolean;
  other: string[];
  confidence: number;
  evidence_points: EvidencePoint[];
};

export type SoilProbeReading = {
  moisture_pct: number;
  interpretation: "dry" | "normal" | "wet";
  note: string;
};

export type DiagnosticBundle = {
  leaf_affected: LeafEvidence | null;
  leaf_healthy: LeafEvidence | null;
  soil_probe: SoilProbeReading | null;
  marker_placed: boolean;
  belief_evolution: BeliefState[];
};

export type WorkOrder = {
  work_order_id: string;
  zone_id: string;
  issue: string;
  priority: string;
  evidence: string[];
  recommended_action: string;
  created_at: string;
};

export type ToolCall = {
  /** Backend writes either `tool` or `name` depending on call site. */
  tool?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  summary?: string;
  ok?: boolean;
  ts?: number;
};

export type RunSummary = {
  run_id: string;
  field_id: string;
  zone_id: string;
  status: RunStatus;
  outcome: RunOutcome | null;
  plan: InspectionPlan | null;
  aerial_analysis: AerialAnalysis | null;
  ground_analysis: GroundAnalysis | null;
  work_order: WorkOrder | null;
  // AgriScout pivot additions — both optional so legacy runs deserialize.
  risk_assessment: RiskAssessment | null;
  diagnostic_bundle: DiagnosticBundle | null;
  started_at: string;
  finished_at: string | null;
  tool_calls: ToolCall[];
  safety_rejections: Array<Record<string, unknown>>;
};

export type ActiveRunResponse =
  | {
      active: true;
      run_id: string;
      zone_id: string;
      status: RunStatus;
      outcome: RunOutcome | null;
      tool_chips: Array<{ name: string; summary?: string; ok?: boolean }>;
      actions: Array<{ kind: "drone" | "robot"; action: string; magnitude: number }>;
      evidence_points: Array<{ source: "aerial" | "ground"; point: [number, number]; label: string }>;
    }
  | {
      active: false;
      tool_chips: never[];
      actions: never[];
      evidence_points: never[];
    };

export type FrameResponse = {
  available: boolean;
  jpeg_b64: string | null;
  data_url: string | null;
  fetched_at: number;
};

// ---------------------------------------------------------------------------
// Low-level fetch helper
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(public status: number, public bodyText: string, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const resp = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new ApiError(resp.status, body, `${init.method ?? "GET"} ${path} -> ${resp.status}`);
  }
  // 202 ack endpoints may return JSON without body shape we care about, but
  // FastAPI always returns JSON for our routes, so this is safe.
  return (await resp.json()) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Kick off a new agent run for `zoneId`. Backend creates the actual `run_id`
 * inside the background task, so the immediate response only confirms the
 * queue. Use {@link pollForNewRun} to discover the new run_id.
 */
export async function startRun(zoneId: string): Promise<{ ok: boolean; queued: boolean; zone_id: string }> {
  return request(`/api/runs?zone_id=${encodeURIComponent(zoneId)}`, { method: "POST" });
}

/** Lightweight "is something running right now?" probe used by sim HUDs. */
export async function getActiveRun(): Promise<ActiveRunResponse> {
  return request<ActiveRunResponse>("/api/runs/active");
}

/** Latest 50 runs newest-first. */
export async function listRuns(limit = 20): Promise<RunSummary[]> {
  return request<RunSummary[]>(`/api/runs?limit=${limit}`);
}

/** Full record for a specific run — the meat of the polling loop. */
export async function getRun(runId: string): Promise<RunSummary> {
  return request<RunSummary>(`/api/runs/${encodeURIComponent(runId)}`);
}

/** Approve / reject the AWAITING_APPROVAL gate. */
export async function postApproval(runId: string, approved: boolean, note?: string): Promise<unknown> {
  return request("/api/approve", {
    method: "POST",
    body: JSON.stringify({ run_id: runId, approved, note }),
  });
}

export async function getDroneFrame(): Promise<FrameResponse> {
  return request<FrameResponse>("/api/drone/frame");
}

export async function getRobotFrame(): Promise<FrameResponse> {
  return request<FrameResponse>("/api/robot/frame");
}

/** Multi-input risk assessment for the "Why drone now?" panel. */
export async function getRisk(zoneId: string): Promise<RiskAssessment> {
  return request<RiskAssessment>(`/api/risk/${encodeURIComponent(zoneId)}`);
}

// ---------------------------------------------------------------------------
// Helpers built on top of the bare endpoints
// ---------------------------------------------------------------------------

/**
 * Start a run and resolve to the new run_id once the agent has registered it.
 * If a run for the same zone is already active, returns that run_id instead
 * so the mobile app and the drone-sim panel cooperate cleanly (Option 3:
 * either side can start a run; the other side joins).
 */
export async function startOrJoinRun(
  zoneId: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<string> {
  const { timeoutMs = 8000, pollMs = 250 } = opts;

  // 1. If something is already running, join it (only if it's the same zone).
  const active = await getActiveRun().catch(() => null);
  if (active?.active && active.zone_id === zoneId) {
    return active.run_id;
  }

  // 2. Otherwise kick a fresh run off and wait for it to appear in the list.
  await startRun(zoneId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const runs = await listRuns(5).catch(() => [] as RunSummary[]);
    const fresh = runs.find((r) => r.zone_id === zoneId && r.status !== "completed" && r.status !== "failed" && r.status !== "rejected");
    if (fresh) return fresh.run_id;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for backend to register a new run for zone ${zoneId}`);
}

export { ApiError };
