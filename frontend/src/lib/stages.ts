/**
 * Stage machine for the Monitor tab — derives the 4-stage timeline state
 * (satellite / drone / robot / report) from a backend `RunSummary`.
 *
 * The pivot from a 4-screen wizard to a single-screen timeline is the core
 * UX bet: the farmer sees the agentic pipeline as one continuous flow, with
 * the active stage swapping its detail card in place. This module is the
 * pure-function layer that maps backend run state -> UI stage state. The
 * components in `components/monitor/` consume the result.
 *
 * Why this lives in a file and not inline in MonitorPage:
 *   1. Computing stages is non-trivial (multiple inputs: run.status, plan,
 *      aerial_analysis, ground_analysis, work_order, diagnostic_bundle).
 *   2. We unit-test it without React.
 *   3. Two components (`StageTimeline` and `MonitorStageCard`) both need it,
 *      and both should never disagree on which stage is "active".
 */

import type { RunSummary, RunStatus } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four stages of the AgriScout pipeline, in order. */
export type StageId = "satellite" | "drone" | "robot" | "report";

/** Per-stage state. Mirrors the visual states the timeline can render. */
export type StageState =
  /** Hasn't started; will start automatically once upstream is done. */
  | "pending"
  /** Currently running — drone in flight, robot diagnosing, etc. */
  | "active"
  /** Completed successfully; the agent moved on. */
  | "done"
  /** Skipped on purpose (e.g., agent decided no robot needed; user holds). */
  | "skipped"
  /** Waiting for human approval before this stage can begin. */
  | "awaiting_approval"
  /** Failed — sim crashed, VLM returned no evidence, etc. */
  | "failed";

/** Who pushed the stage forward last (or will push it, if pending). */
export type Trigger =
  | "auto" // agent decided autonomously
  | "human" // farmer manually triggered or approved
  | "awaiting"; // pending decision (the 5th trigger: explicit human gate)

/**
 * Per-stage view-model. Components render this directly.
 *
 * `status` is a one-line string the timeline shows under the dot ("Auto-
 * dispatch in 0:28", "Aerial confirmed hotspot", etc.). Keep it short.
 */
export type StageInfo = {
  id: StageId;
  label: string;
  state: StageState;
  trigger: Trigger;
  status: string;
};

export type StageMachine = {
  satellite: StageInfo;
  drone: StageInfo;
  robot: StageInfo;
  report: StageInfo;
  /** The stage whose detail card is shown by default. */
  activeStage: StageId;
};

// ---------------------------------------------------------------------------
// computeStages — the only function this module exports for runtime use
// ---------------------------------------------------------------------------

/**
 * Derive the full stage state from the current run.
 *
 * Behavior:
 *  - `run === null`           → pre-run preview. Satellite is ACTIVE (the
 *                                farmer sees the auto-dispatch countdown);
 *                                everything downstream is pending.
 *  - run still in planning    → satellite ACTIVE, drone priming (pending).
 *  - aerial analysis present  → satellite DONE, drone ACTIVE.
 *  - awaiting_approval after  → drone DONE, robot AWAITING_APPROVAL.
 *    aerial recommends ground
 *  - ground analysis present  → drone DONE, robot ACTIVE (or DONE if the
 *                                bundle is fully populated).
 *  - work order present       → robot DONE, report ACTIVE/DONE.
 *  - rejected / failed        → propagate to the relevant stage.
 *
 * `activeStage` resolves to whichever stage is currently `active` /
 * `awaiting_approval`, falling back to the most recent `done` stage so the
 * UI always has something meaningful to show after completion.
 */
export function computeStages(run: RunSummary | null): StageMachine {
  // --- Pre-run preview ---
  if (!run) {
    return {
      satellite: {
        id: "satellite",
        label: "Satellite",
        state: "active",
        trigger: "auto",
        status: "Hotspot detected · awaiting drone dispatch",
      },
      drone: {
        id: "drone",
        label: "Drone",
        state: "pending",
        trigger: "auto",
        status: "Will fly to confirm hotspot",
      },
      robot: {
        id: "robot",
        label: "Robot",
        state: "pending",
        trigger: "awaiting",
        status: "Conditional on aerial findings",
      },
      report: {
        id: "report",
        label: "Report",
        state: "pending",
        trigger: "auto",
        status: "Auto-generated when diagnosis completes",
      },
      activeStage: "satellite",
    };
  }

  // --- Live run: derive each stage from the backend artifacts. ---
  const status: RunStatus = run.status;
  const hasAerial = run.aerial_analysis !== null;
  const hasGround = run.ground_analysis !== null;
  const hasWorkOrder = run.work_order !== null;
  const aerialRecommendsGround =
    run.aerial_analysis?.recommend_ground_truth === true;

  // Diagnostic bundle is the "deeper" ground truth (Phase 1.4 schema). When
  // it has 4+ snapshots in belief_evolution we know the diagnostic loop has
  // run to completion.
  const bundleComplete =
    (run.diagnostic_bundle?.belief_evolution.length ?? 0) >= 4;

  // SATELLITE: always done by the time we have a run object (the run was
  // *triggered* by the satellite hotspot detection).
  const satellite: StageInfo = {
    id: "satellite",
    label: "Satellite",
    state: "done",
    trigger: "auto",
    status: run.risk_assessment
      ? `Combined risk ${Math.round(run.risk_assessment.combined_risk_score * 100)}% · ${formatDecision(run.risk_assessment.decision)}`
      : "Hotspot detected",
  };

  // DRONE: active during planning/executing-pre-aerial, done once aerial
  // analysis exists, failed if the run errored before that.
  let drone: StageInfo;
  if (status === "failed" && !hasAerial) {
    drone = {
      id: "drone",
      label: "Drone",
      state: "failed",
      trigger: "auto",
      status: "Aerial scan failed",
    };
  } else if (hasAerial) {
    const a = run.aerial_analysis!;
    drone = {
      id: "drone",
      label: "Drone",
      state: "done",
      trigger: "auto",
      status: a.visible
        ? `Hotspot confirmed (${Math.round(a.confidence * 100)}%)`
        : "No anomaly visible from above",
    };
  } else {
    drone = {
      id: "drone",
      label: "Drone",
      state: "active",
      trigger: "auto",
      status:
        status === "planning"
          ? "Agent drafting flight plan"
          : "Drone dispatched · scanning",
    };
  }

  // ROBOT: pending until aerial completes; awaiting_approval if aerial
  // recommends ground truth and we hit awaiting_approval; active during
  // ground truth; done once the bundle is complete; skipped if aerial said
  // no ground needed OR the user rejected at the gate.
  //
  // "Did the robot actually run?" — proven only by ground-truth evidence:
  //   - hasGround       : legacy single-shot vlm_analyze_ground tool
  //   - bundleComplete  : new ER-based diagnostic loop (4+ belief snapshots)
  // The current flow only uses the ER loop, so `ground_analysis` is always
  // null on real runs.
  //
  // Important: a run can reach status=COMPLETED *without* the robot doing
  // any work — this happens when the user rejects at the approval gate
  // (the agent stops and finalizes with outcome=NO_ACTION_NEEDED, but the
  // status is still COMPLETED because the backend doesn't currently set
  // REJECTED on user reject). So we DON'T treat "completed" alone as
  // evidence the robot finished — only the bundle/ground signals do.
  const robotDidWork = hasGround || bundleComplete;
  const runIsTerminal =
    status === "completed" || status === "rejected" || status === "failed";
  let robot: StageInfo;
  if (!hasAerial) {
    robot = {
      id: "robot",
      label: "Robot",
      state: "pending",
      trigger: "awaiting",
      status: "Will dispatch if aerial finds something",
    };
  } else if (hasAerial && !aerialRecommendsGround && !robotDidWork) {
    robot = {
      id: "robot",
      label: "Robot",
      state: "skipped",
      trigger: "auto",
      status: "Aerial alone is sufficient",
    };
  } else if (status === "awaiting_approval" && !robotDidWork) {
    robot = {
      id: "robot",
      label: "Robot",
      state: "awaiting_approval",
      trigger: "awaiting",
      status: "AgriScout wants ground truth · approval needed",
    };
  } else if (status === "rejected") {
    robot = {
      id: "robot",
      label: "Robot",
      state: "skipped",
      trigger: "human",
      status: "Held off by operator",
    };
  } else if (robotDidWork) {
    // Real evidence in hand — the diagnostic loop ran to completion.
    robot = {
      id: "robot",
      label: "Robot",
      state: "done",
      trigger: "auto",
      status: summarizeDiagnosis(run),
    };
  } else if (runIsTerminal) {
    // Run is terminal but no robot evidence — happens when the user
    // rejects at the gate (backend currently uses status=COMPLETED with
    // outcome=NO_ACTION_NEEDED for user-reject) or the run aborted
    // before the diagnostic loop fired. Mark as skipped so the timeline
    // doesn't lie about completed work that didn't happen.
    robot = {
      id: "robot",
      label: "Robot",
      state: "skipped",
      trigger: "human",
      status: "Held off · diagnostic loop not run",
    };
  } else if (hasGround) {
    // Reached when ground_analysis is set but bundle is mid-loop. Keep the
    // legacy "diagnosing" copy here so the UX stays meaningful.
    robot = {
      id: "robot",
      label: "Robot",
      state: "active",
      trigger: "auto",
      status: "Running multi-step diagnostic routine",
    };
  } else {
    // Approved but the diagnostic bundle is still mid-loop. We arrive here
    // mid-execution, between approval and the first inspect_leaf snapshot.
    robot = {
      id: "robot",
      label: "Robot",
      state: "active",
      trigger: "human",
      status: "Robot dispatched · approaching plant",
    };
  }

  // REPORT: pending until work order exists.
  let report: StageInfo;
  if (hasWorkOrder) {
    report = {
      id: "report",
      label: "Report",
      state: "done",
      trigger: "auto",
      status: `Work order ${run.work_order!.work_order_id}`,
    };
  } else if (status === "completed") {
    // Completed without a work order = no action needed.
    report = {
      id: "report",
      label: "Report",
      state: "done",
      trigger: "auto",
      status: "No action needed",
    };
  } else if (status === "rejected" || status === "failed") {
    report = {
      id: "report",
      label: "Report",
      state: "skipped",
      trigger: status === "rejected" ? "human" : "auto",
      status: status === "rejected" ? "Run rejected by operator" : "Run failed",
    };
  } else {
    report = {
      id: "report",
      label: "Report",
      state: "pending",
      trigger: "auto",
      status: "Auto-generated when diagnosis completes",
    };
  }

  return {
    satellite,
    drone,
    robot,
    report,
    activeStage: pickActive(satellite, drone, robot, report),
  };
}

// ---------------------------------------------------------------------------
// Helpers (not exported)
// ---------------------------------------------------------------------------

function pickActive(
  satellite: StageInfo,
  drone: StageInfo,
  robot: StageInfo,
  report: StageInfo,
): StageId {
  // Active or awaiting_approval anywhere → that's the focus.
  for (const s of [satellite, drone, robot, report]) {
    if (s.state === "active" || s.state === "awaiting_approval") return s.id;
  }
  // Otherwise show the rightmost done stage so completed runs land on the
  // report. Walk in reverse.
  for (const s of [report, robot, drone, satellite]) {
    if (s.state === "done") return s.id;
  }
  return "satellite";
}

function formatDecision(d: string): string {
  switch (d) {
    case "SEND_DRONE":
      return "send drone";
    case "SEND_GROUND_ROBOT":
      return "send robot";
    case "CREATE_WORK_ORDER":
      return "work order";
    case "MONITOR":
      return "monitor";
    case "IGNORE":
      return "ignore";
    default:
      return d.toLowerCase().replace(/_/g, " ");
  }
}

/**
 * One-line summary of the diagnostic loop result. Used as the robot stage
 * status string when the bundle is complete. Picks the dominant cause from
 * the final belief snapshot.
 */
function summarizeDiagnosis(run: RunSummary): string {
  const bundle = run.diagnostic_bundle;
  const final = bundle?.belief_evolution[bundle.belief_evolution.length - 1];
  if (!final) return "Diagnostic loop complete";

  // Find the dominant belief.
  const beliefs: { label: string; value: number }[] = [
    { label: "pest pressure", value: final.pest_hotspot },
    { label: "water stress", value: final.water_stress },
    { label: "nutrient deficit", value: final.nutrient_deficit },
    { label: "false alarm", value: final.false_alarm },
  ];
  beliefs.sort((a, b) => b.value - a.value);
  const top = beliefs[0];
  return `${capitalize(top.label)} (${Math.round(top.value * 100)}%)`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
