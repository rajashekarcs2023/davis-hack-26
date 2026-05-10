/**
 * MonitorStageCard — the focused-stage detail card on the Monitor tab.
 * Routes to one of four sub-components based on which stage is focused.
 *
 * The four stages each show a different cross-section of the run:
 *
 *   SATELLITE   compact decision strip + 30s auto-dispatch countdown +
 *               manual override buttons (the human's override of the agent's
 *               own decision is the demo-day "AI is alive" moment)
 *   DRONE       live drone feed + aerial reasoning + approval gate for robot
 *   ROBOT       wraps the existing GroundTruthVerificationScreen
 *   REPORT      wraps the existing FieldWorkOrderScreen
 *
 * Phase 1.5 deliberately wraps the existing detail components for Drone /
 * Robot / Report. Phase 2 will replace them with denser timeline-aware
 * variants. Keeping the wrappers thin means the existing screens still
 * work and we don't break the run-polling plumbing.
 */

import { AlertTriangle, CheckCircle2, ChevronRight, Hand, Send, XCircle } from "lucide-react";
import type { FieldPlaceholder } from "../../data/placeholder";
import type { RunSummary } from "../../lib/api";
import { AiReasoningPanel } from "../AssessmentAiPanels";
import { GroundTruthVerificationScreen } from "../GroundTruthVerificationScreen";
import { FieldWorkOrderScreen } from "../FieldWorkOrderScreen";
import type { CountdownHandle } from "../../lib/useAutoDispatchCountdown";
import type { StageId, StageMachine } from "../../lib/stages";
import { AerialScanHeader } from "./AerialScanHeader";
import { BeliefEvolutionTimeline } from "./BeliefEvolutionTimeline";
import { BeliefStateStrip } from "./BeliefStateStrip";
import { DecisionStrip } from "./DecisionStrip";
import { DiagnosticChecklist } from "./DiagnosticChecklist";

type MonitorStageCardProps = {
  data: FieldPlaceholder;
  run: RunSummary | null;
  runId: string | null;
  stages: StageMachine;
  /** Stage the user is currently viewing — falls back to `stages.activeStage`. */
  focusedStage: StageId;

  /** Auto-dispatch countdown — drives the SatelliteStageCard. */
  countdown: CountdownHandle;
  /**
   * Robot-dispatch auto-approve countdown. Armed only while the run
   * is parked at status="awaiting_approval". Used by the Drone and
   * Robot stage cards to render the approval gate with the same
   * Hold / Send Now / Reject UX as the satellite countdown — and to
   * auto-approve the dispatch if the operator does nothing for 30 s.
   */
  robotApprovalCountdown: CountdownHandle;
  /** Pre-run launching indicator (used by Send Now / countdown fire). */
  launching: boolean;
  /** Surfaced launch error (e.g. POST /api/runs failed). */
  launchError: string | null;

  /**
   * Reject handler for the robot dispatch gate. Approval doesn't need a
   * separate handler here because RobotApprovalGate triggers approve via
   * the countdown handle's `sendNow` (which MonitorPage wires to
   * handleApproveRobot inside the useAutoDispatchCountdown hook).
   */
  onRejectRobot: () => void;

  /** Used by the ReportStageCard to clear the run. */
  onResetToMap: () => void;

  /**
   * Switch the focused stage. The robot stage uses this to jump to the
   * report once a work order is ready ("View work order" button), and the
   * report stage uses it to jump back to the robot stage.
   */
  onJumpToStage: (stageId: import("../../lib/stages").StageId) => void;
};

export function MonitorStageCard(props: MonitorStageCardProps) {
  const { focusedStage } = props;
  switch (focusedStage) {
    case "satellite":
      return <SatelliteStageCard {...props} />;
    case "drone":
      return <DroneStageCard {...props} />;
    case "robot":
      return <RobotStageCard {...props} />;
    case "report":
      return <ReportStageCard {...props} />;
  }
}

// ---------------------------------------------------------------------------
// Stage 1: Satellite — the compact decision view + autonomy countdown
// ---------------------------------------------------------------------------

function SatelliteStageCard({
  data,
  run,
  countdown,
  launching,
  launchError,
}: MonitorStageCardProps) {
  // Two display modes:
  //  1. No run yet:    show countdown + Hold / Send-now buttons
  //  2. Run started:   show "drone dispatched" confirmation, no buttons
  const runStarted = run !== null;

  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-[#111c18] p-4 shadow-xl shadow-black/40">
      {/* Compact zone header */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight text-white">
            {data.field}
          </h3>
          <p className="text-[11px] text-emerald-200/55">
            {data.cropType} · {data.plantStage} · Rows {data.rows} · {data.affectedAcres} ac
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-medium text-white/35">
          Detected {data.detectedAgo}
        </span>
      </header>

      {/* Compact decision strip — replaces the old WhyDroneNowPanel */}
      <DecisionStrip zoneId={data.zone} />

      {/* Cause sentence — single line */}
      <p className="rounded-lg border-l-2 border-orange-500/55 bg-black/25 px-3 py-2 text-[12.5px] leading-snug text-white/80">
        <span className="font-bold text-orange-200">Hotspot:</span> {data.cause}
      </p>

      {/* Autonomy widget OR run-started confirmation */}
      {runStarted ? (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-[12px] text-emerald-100/85 ring-1 ring-emerald-500/25">
          <Send className="h-3.5 w-3.5 shrink-0 text-emerald-300" strokeWidth={2.2} />
          Drone dispatched · view <span className="font-semibold">Drone</span> stage on the timeline
          <ChevronRight className="ml-auto h-4 w-4 text-emerald-300" />
        </div>
      ) : (
        <DispatchCountdownWidget
          countdown={countdown}
          launching={launching}
          launchError={launchError}
        />
      )}
    </article>
  );
}

function DispatchCountdownWidget({
  countdown,
  launching,
  launchError,
}: {
  countdown: CountdownHandle;
  launching: boolean;
  launchError: string | null;
}) {
  const isHeld = countdown.state === "held";
  const isFired = countdown.state === "fired";
  const isArmed = countdown.state === "armed";

  // Countdown bar background fades from emerald (full) to amber (low) as
  // time runs out, communicating urgency without text.
  const remaining = countdown.remainingSeconds;
  const totalSec = 30;
  const fillPct = isFired ? 100 : Math.max(0, Math.round((1 - remaining / totalSec) * 100));

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/5">
      {/* Header line: countdown text + state */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/65">
            {isFired
              ? "Dispatching now"
              : isHeld
                ? "Held by operator"
                : "Auto-dispatch in"}
          </p>
          <p className="text-xl font-bold tabular-nums text-white">
            {isFired ? "0:00" : countdown.display}
          </p>
        </div>
        <p className="shrink-0 text-right text-[10px] font-medium leading-tight text-white/45">
          {isHeld
            ? "Tap Send now to fly"
            : isFired
              ? "Drone launching"
              : "AgriScout decided · you can override"}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mx-3 mt-2 h-1.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ${
            isHeld ? "bg-amber-400/70" : "bg-emerald-400/85"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>

      {/* Action row */}
      <div className="grid grid-cols-2 gap-2 p-3">
        {isHeld ? (
          <button
            type="button"
            onClick={countdown.resume}
            className="rounded-lg border border-white/15 bg-white/5 py-2.5 text-[12px] font-semibold text-white/85 transition hover:bg-white/10"
          >
            Resume countdown
          </button>
        ) : (
          <button
            type="button"
            onClick={countdown.hold}
            disabled={!isArmed}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 py-2.5 text-[12px] font-semibold text-white/85 transition hover:bg-white/10 disabled:opacity-50"
          >
            <Hand className="h-3.5 w-3.5" strokeWidth={2.2} /> Hold off
          </button>
        )}
        <button
          type="button"
          onClick={countdown.sendNow}
          disabled={isFired || launching}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-[#4ade80] py-2.5 text-[12px] font-bold text-[#06140e] shadow-md shadow-emerald-950/35 transition hover:bg-[#3fcd73] disabled:opacity-60"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
          {launching ? "Sending…" : "Send now"}
        </button>
      </div>

      {launchError ? (
        <p className="border-t border-red-500/30 bg-red-950/30 px-3 py-2 text-[11px] text-red-200/85">
          Couldn&apos;t start a run: {launchError}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Robot dispatch approval gate — countdown-driven
// ---------------------------------------------------------------------------

/**
 * RobotApprovalGate is the human-in-the-loop hand-off between the drone
 * and the ground robot. It mirrors the satellite DispatchCountdownWidget
 * but with amber (decision-pending) styling — a deliberate visual
 * differentiation from the emerald "auto-dispatch" countdown so the
 * operator immediately recognises the higher-stakes physical-dispatch
 * decision.
 *
 * Behaviour:
 *   - Armed:    counts down from 30 s; auto-approves at 0 (calls
 *               onAutoFire on the countdown handle, which is wired
 *               to handleApproveRobot in MonitorPage).
 *   - Held:     paused by Hold off; user must Resume or Approve & dispatch.
 *   - Fired:    countdown finished or operator hit Approve & dispatch;
 *               the actual dispatch is in flight.
 *   - Disabled: not at the gate (run is still aerial-scanning, or the
 *               robot has already been dispatched). Component returns null.
 *
 * Reject (red Ignore button) cancels the run entirely; we don't try to
 * gate that behind the timer because it's a deliberate operator override.
 */
function RobotApprovalGate({
  countdown,
  onReject,
  status,
  headline = "Send ground robot for diagnostic confirmation?",
  subhead = "The drone confirms WHERE the hotspot is. The ground robot determines WHY (pest / water / nutrient).",
}: {
  countdown: CountdownHandle;
  onReject: () => void;
  status: RunSummary["status"] | null | undefined;
  headline?: string;
  subhead?: string;
}) {
  const isHeld = countdown.state === "held";
  const isFired = countdown.state === "fired";
  const isArmed = countdown.state === "armed";
  const isDisabled = countdown.state === "disabled";

  // Don't render the gate if we're not at the approval moment. The
  // countdown is "disabled" before the gate is reached AND after the
  // run advances past it.
  if (isDisabled) return null;

  // Bar fill mirrors the satellite-card widget: empty -> full as time
  // runs out. Amber palette to distinguish "pending decision" from the
  // emerald "auto-dispatch ready" countdown.
  const remaining = countdown.remainingSeconds;
  const totalSec = 30;
  const fillPct = isFired ? 100 : Math.max(0, Math.round((1 - remaining / totalSec) * 100));

  // While the dispatch is in flight (status flipped to executing), the
  // big green button should reflect that state instead of staying as
  // "Approve & dispatch".
  const dispatching = isFired || status === "executing";

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-[#f97316] bg-[#111c18] shadow-xl shadow-black/40">
      {/* Header strip */}
      <div className="flex items-start gap-2.5 px-4 pt-4">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-[#f97316]"
          strokeWidth={2.2}
        />
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white">{headline}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{subhead}</p>
        </div>
      </div>

      {/* Countdown row */}
      <div className="mt-3 flex items-center justify-between gap-2 px-4">
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/70">
            {dispatching
              ? "Dispatching now"
              : isHeld
                ? "Held by operator"
                : "Auto-approving in"}
          </p>
          <p className="text-xl font-bold tabular-nums text-white">
            {dispatching ? "0:00" : countdown.display}
          </p>
        </div>
        <p className="shrink-0 text-right text-[10px] font-medium leading-tight text-white/45">
          {isHeld
            ? "Tap Approve to dispatch"
            : dispatching
              ? "Robot launching"
              : "AgriScout decided · you can override"}
        </p>
      </div>

      {/* Progress bar — same pattern as DispatchCountdownWidget but amber. */}
      <div className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ${
            isHeld ? "bg-amber-300/60" : "bg-amber-400/85"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>

      {/* Action row — three buttons:
            Hold/Resume (toggles)
            Approve & dispatch (the green primary action; also fires the
                                 same code path as the auto-fire timer)
            Reject (cancels the run) */}
      <div className="grid grid-cols-2 gap-2 p-3 pt-2.5">
        {isHeld ? (
          <button
            type="button"
            onClick={countdown.resume}
            className="rounded-lg border border-white/15 bg-white/5 py-2.5 text-[12px] font-semibold text-white/85 transition hover:bg-white/10"
          >
            Resume countdown
          </button>
        ) : (
          <button
            type="button"
            onClick={countdown.hold}
            disabled={!isArmed}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 py-2.5 text-[12px] font-semibold text-white/85 transition hover:bg-white/10 disabled:opacity-50"
          >
            <Hand className="h-3.5 w-3.5" strokeWidth={2.2} /> Hold off
          </button>
        )}
        <button
          type="button"
          onClick={countdown.sendNow}
          disabled={dispatching}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-[#4ade80] py-2.5 text-[12px] font-bold text-[#06140e] shadow-md shadow-emerald-950/35 transition hover:bg-[#3fcd73] disabled:opacity-60"
        >
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
          {dispatching ? "Dispatching…" : "Approve & dispatch"}
        </button>
      </div>

      {/* Reject — full-width row, deliberately separated so it doesn't
          compete visually with the primary green action. */}
      <button
        type="button"
        onClick={onReject}
        className="flex w-full items-center justify-center gap-1.5 border-t border-white/8 bg-black/20 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white/70 transition hover:bg-black/30"
      >
        <XCircle className="h-3.5 w-3.5" strokeWidth={2.2} />
        Ignore anomaly · cancel run
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stage 2: Drone — live aerial feed + reasoning + robot approval gate
// ---------------------------------------------------------------------------

function DroneStageCard({
  data,
  run,
  stages,
  robotApprovalCountdown,
  onRejectRobot,
}: MonitorStageCardProps) {
  // The existing AiReasoningPanel handles the live drone-frame display +
  // VLM reasoning bullets. We layer a tighter header around it and the
  // robot-approval gate below.
  const robotState = stages.robot.state;

  // Belief state after the aerial scan completes. The drone can confirm
  // WHERE the anomaly is but can't distinguish pest / water / nutrient —
  // so the strip should still show ambiguity here, with the leader only
  // shifting modestly from the initial priors. This is the "aerial is not
  // enough, ground robot needed" narrative beat.
  const beliefEvolution = run?.diagnostic_bundle?.belief_evolution ?? null;

  return (
    <article className="space-y-3">
      {/* Aerial scan status — demo telemetry (altitude, coverage, pass #)
          that makes the drone feel alive while we're waiting on the VLM. */}
      <AerialScanHeader zoneLabel={data.zone} run={run} />

      {/* Live aerial feed + reasoning (existing component) */}
      <AiReasoningPanel data={data} run={run} />

      {/* Multi-cause belief state after aerial scan. Shown as soon as the
          agent records the after_aerial snapshot. The component handles its
          own empty state if belief_evolution is still empty. */}
      <BeliefStateStrip evolution={beliefEvolution} snapshot="after_aerial" />


      {/* Robot approval gate — countdown-driven. Only renders when the
          run is paused at status="awaiting_approval"; the gate component
          itself returns null in any other state, so the conditional
          below is for the robotState-derived sibling messages
          (skipped / active). */}
      {robotState === "awaiting_approval" ? (
        <RobotApprovalGate
          countdown={robotApprovalCountdown}
          onReject={onRejectRobot}
          status={run?.status ?? null}
        />
      ) : robotState === "skipped" ? (
        <p className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-[12px] text-white/55">
          Aerial alone is sufficient — robot dispatch skipped.
        </p>
      ) : robotState === "active" ? (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-[12px] text-emerald-100/75">
          Robot dispatched — view <span className="font-semibold">Robot</span> stage on the timeline.
        </p>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Stage 3: Robot — wraps the existing GroundTruthVerificationScreen
// ---------------------------------------------------------------------------

function RobotStageCard({
  data,
  run,
  runId,
  stages,
  robotApprovalCountdown,
  onRejectRobot,
  onResetToMap,
  onJumpToStage,
}: MonitorStageCardProps) {
  // Phase 2 additions above the embedded live-feed screen:
  //   1. DiagnosticChecklist   — what the robot is DOING right now
  //   2. BeliefStateStrip      — what we BELIEVE right now (multi-cause)
  //   3. BeliefEvolutionTimeline — how the belief CHANGED (collapsible)
  // These read directly from run.diagnostic_bundle which the backend
  // populates step-by-step as the 4 diagnostic tools fire.
  const beliefEvolution = run?.diagnostic_bundle?.belief_evolution ?? null;
  const robotState = stages.robot.state;

  return (
    <article className="space-y-3">
      {/* Approval gate — also rendered here (in addition to the Drone
          stage card) because pickActive() auto-focuses the timeline on
          ROBOT when status=awaiting_approval. Without this, a user
          looking at the Robot stage card would see "Verification in
          progress…" with no visible approval gate anywhere on screen.
          Both rendering sites use the same RobotApprovalGate component
          fed by the same countdown handle, so the timer is consistent
          regardless of which stage card is in focus. */}
      {robotState === "awaiting_approval" ? (
        <RobotApprovalGate
          countdown={robotApprovalCountdown}
          onReject={onRejectRobot}
          status={run?.status ?? null}
          subhead="The drone confirmed WHERE the hotspot is. The ground robot will determine WHY (pest / water / nutrient) via a 4-step physical inspection."
        />
      ) : null}

      {/* New multi-cause diagnostic panel — the AgriScout differentiator.
          Grouped at the top so the farmer sees WHAT's being found and
          HOW the cause-belief is evolving before the raw live feed. */}
      <DiagnosticChecklist run={run} />
      <BeliefStateStrip evolution={beliefEvolution} />
      <BeliefEvolutionTimeline evolution={beliefEvolution} />

      {/* Existing live feed + VLA log + confirmation panel (embedded so
          it doesn't render its own chrome). */}
      <GroundTruthVerificationScreen
        zoneLabel={data.zone}
        runId={runId}
        run={run}
        embedded
        onBack={onResetToMap}
        onGenerateWorkOrder={() => onJumpToStage("report")}
      />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Stage 4: Report — wraps the existing FieldWorkOrderScreen
// ---------------------------------------------------------------------------

function ReportStageCard({
  data,
  run,
  onResetToMap,
  onJumpToStage,
}: MonitorStageCardProps) {
  return (
    <FieldWorkOrderScreen
      data={data}
      run={run}
      embedded
      // "Back" in the embedded report = jump back to robot stage in the
      // timeline (where the diagnostic evidence lives).
      onBack={() => onJumpToStage("robot")}
      onReturnToMonitor={onResetToMap}
    />
  );
}
