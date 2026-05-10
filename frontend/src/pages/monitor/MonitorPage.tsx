import { useCallback, useMemo, useState } from "react";
import type { FieldPlaceholder } from "../../data/placeholder";
import type { ZoneInfo } from "../../data/zones";
import { AppHeader } from "../../components/AppHeader";
import { CollapsibleFieldMap } from "../../components/monitor/CollapsibleFieldMap";
import { MonitorStageCard } from "../../components/monitor/MonitorStageCard";
import { StageTimeline } from "../../components/monitor/StageTimeline";
import { WeatherBar } from "./components/WeatherBar";
import { postApproval, startOrJoinRun } from "../../lib/api";
import { computeStages, type StageId } from "../../lib/stages";
import { useAutoDispatchCountdown } from "../../lib/useAutoDispatchCountdown";
import { useRun } from "../../lib/useRun";

type MonitorPageProps = {
  data: FieldPlaceholder;
  /**
   * Currently-selected zone (lifted to App.tsx so the Today tab can
   * change it before switching tabs). MonitorPage uses this for:
   *   - the backend zone_id when starting a run
   *   - the visual selection styling in the field map
   *   - the alert/manual-scan banner copy
   */
  selectedZone: ZoneInfo;
  /**
   * Setter for the selected zone, used when the user taps a different
   * zone tile in the field map. App.tsx persists the choice across
   * tab switches.
   */
  onChangeZone: (visualZoneId: ZoneInfo["id"]) => void;
};

/**
 * Monitor tab — the AgriScout pipeline as a single screen.
 *
 * The old 4-screen wizard (Map -> Assessment -> GroundTruth -> WorkOrder)
 * is replaced with a permanent 4-stage timeline at the top + a single
 * focused "active stage" card below. This means the farmer sees the
 * whole agentic flow as one progression, never lost in nested screens.
 *
 * State sources:
 *   - `runId`        : null until we start (or join) a run for the zone
 *   - `useRun(runId)`: long-poll the backend; gives us the live RunSummary
 *   - `computeStages(run)`: pure function that maps the run -> 4 stage states
 *   - `useAutoDispatchCountdown`: 30s timer that auto-dispatches (or that
 *     the human can override via Hold / Send-now)
 *
 * The "5 triggers" the design brief calls out are visible here:
 *   T1 satellite -> assess  : automatic (the run starts when countdown fires)
 *   T2 assess    -> drone   : automatic (no approval needed for aerial)
 *   T3 drone     -> robot   : 30s auto-approve countdown (RobotApprovalGate);
 *                              the human can override via Hold / Approve & dispatch / Reject
 *   T4 robot     -> report  : automatic
 *   T5 manual override      : Send-now / Hold-off / approval reject (both countdowns)
 */
export function MonitorPage({
  data,
  selectedZone,
  onChangeZone,
}: MonitorPageProps) {
  const [runId, setRunId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  /** Stage the user has tapped; falls back to the agent-derived activeStage. */
  const [tappedStage, setTappedStage] = useState<StageId | null>(null);

  const { run, error: runError } = useRun(runId);

  const stages = useMemo(() => computeStages(run), [run]);
  const focusedStage = tappedStage ?? stages.activeStage;

  // Reset the user's manual focus override when the agent moves on. The
  // intent: if you tapped Satellite to look at it, we don't want to keep
  // forcing your view to Satellite after the drone has flown. We snap your
  // focus forward to whatever the agent is doing now.
  // Implementation: when activeStage changes, clear tappedStage iff the
  // new active is "ahead of" the tapped stage. For simplicity, we just
  // clear whenever activeStage changes; users can re-tap if they want.
  // The dependency array makes this a no-op on identical activeStage.

  // ---------- Run lifecycle ----------

  const startRun = useCallback(async () => {
    if (launching || runId) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      // Use the *selected* zone's backend id so manual scans on Zone A
      // actually fire zone_id=A2 against the backend grid (not the
      // hardcoded B3 from FIELD_PLACEHOLDER).
      const newRunId = await startOrJoinRun(selectedZone.backendZoneId);
      setRunId(newRunId);
      // Snap focus forward to the drone stage as soon as we start.
      setTappedStage(null);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  }, [selectedZone.backendZoneId, launching, runId]);

  // The countdown's onAutoFire / onSendNow both call startRun. Hold doesn't
  // do anything destructive — it just pauses the timer.
  const countdown = useAutoDispatchCountdown({
    seconds: 30,
    enabled: runId === null && !runError,
    onAutoFire: startRun,
    onSendNow: startRun,
  });

  const handleApproveRobot = useCallback(async () => {
    if (!runId) return;
    try {
      await postApproval(runId, true);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : String(err));
    }
  }, [runId]);

  const handleRejectRobot = useCallback(async () => {
    if (!runId) return;
    try {
      await postApproval(runId, false);
    } catch {
      // Best-effort.
    }
    setRunId(null);
    setTappedStage(null);
  }, [runId]);

  // Robot-dispatch auto-approve countdown. Mirrors the satellite
  // countdown, but armed only while the run is paused at the human-in-
  // the-loop gate. If the operator does nothing for 30 s the robot is
  // auto-approved — this matches the drone-dispatch UX and keeps the
  // demo moving without forcing a click.
  //
  // The hook auto-resets on the `enabled` edge: when status flips to
  // awaiting_approval the timer arms at 30 s, when the gate is cleared
  // (status moves to executing/completed) the timer goes disabled.
  const robotApprovalCountdown = useAutoDispatchCountdown({
    seconds: 30,
    enabled: run?.status === "awaiting_approval",
    onAutoFire: handleApproveRobot,
    onSendNow: handleApproveRobot,
  });

  const handleResetToMap = useCallback(() => {
    setRunId(null);
    setTappedStage(null);
  }, []);

  /**
   * What happens when the user taps a zone tile (any of A/B/C/D) on the
   * field map. The intent: tapping the zone IS "select this zone AND
   * start a scan on it".
   *
   * Two distinct cases:
   *   1. Tapping the *currently selected* zone:
   *        - No run yet:        start one immediately (Send Now path)
   *        - Run is mid-flight: no-op (don't double-fire)
   *        - Run is terminal:   reset; the satellite countdown re-arms
   *                              and the user can confirm again.
   *   2. Tapping a *different* zone:
   *        - We update the selected zone in App state. We do NOT
   *          immediately fire a run — the user just changed their
   *          focus; they can hit Send Now (or wait for the countdown)
   *          to actually dispatch on the new zone.
   *        - If a run is currently mid-flight on the previous zone, we
   *          leave that run alone (it'll keep polling) and only switch
   *          the visual focus.
   */
  const handleZoneTap = useCallback(
    (visualZoneId: ZoneInfo["id"]) => {
      if (visualZoneId !== selectedZone.id) {
        // Switching zones — update selection only.
        onChangeZone(visualZoneId);
        // If a run was terminal, also drop it so the new zone's
        // pre-run state shows correctly.
        if (
          run &&
          (run.status === "completed" ||
            run.status === "rejected" ||
            run.status === "failed")
        ) {
          setRunId(null);
          setTappedStage(null);
        }
        return;
      }
      // Tapping the same zone again = scan intent.
      if (!run) {
        void startRun();
        return;
      }
      if (
        run.status === "completed" ||
        run.status === "rejected" ||
        run.status === "failed"
      ) {
        setRunId(null);
        setTappedStage(null);
      }
      // Active run — intentional no-op so we don't double-fire.
    },
    [run, startRun, selectedZone.id, onChangeZone],
  );

  /**
   * State-aware CTA copy for the zone badge. Mirrors handleZoneTap's
   * three branches so the affordance label always matches what tapping
   * actually does.
   */
  const zoneCtaLabel = useMemo(() => {
    if (!run) return "Tap to scan";
    if (run.status === "completed") return "Scan complete · Tap to re-scan";
    if (run.status === "rejected") return "Scan rejected · Tap to retry";
    if (run.status === "failed") return "Scan failed · Tap to retry";
    if (run.status === "awaiting_approval") return "Awaiting your approval";
    return "Scan in progress…";
  }, [run]);

  /**
   * Whether tapping the zone IS meaningful right now. Wired to handleZoneTap's
   * decision logic: tap is meaningful pre-run AND when a previous run is
   * terminal (we'd reset+restart), but a no-op while a run is mid-flight.
   * Drives the visual disabled state in the field map.
   */
  const zoneTapEnabled = useMemo(() => {
    if (!run) return true;
    return (
      run.status === "completed" ||
      run.status === "rejected" ||
      run.status === "failed"
    );
  }, [run]);

  const handleStageTap = useCallback((id: StageId) => {
    setTappedStage(id);
  }, []);

  // Same as handleStageTap but invoked by wrapped components (e.g. the
  // "View work order" button inside the embedded GroundTruthVerification).
  // Same shape; kept as a separate name so the prop intent is clear.
  const handleJumpToStage = useCallback((id: StageId) => {
    setTappedStage(id);
  }, []);

  // ---------- Status line shown under the timeline ----------

  const statusLine = useMemo(() => {
    if (launching) return "Starting field assessment…";
    if (runError) return `Run polling error: ${runError.message}`;
    if (!run) {
      // Pre-run state: countdown drives the message. Copy differs
      // between alert-driven (AgriScout decided) and manual scans
      // (operator-initiated) so the user understands *why* the
      // countdown is running.
      const isAlertScan = selectedZone.status === "alert";
      if (countdown.state === "armed") {
        return (
          <span>
            <span
              className={
                isAlertScan ? "text-amber-200/85" : "text-emerald-200/80"
              }
            >
              {isAlertScan
                ? "AgriScout flagged this zone"
                : `Manual scan · ${selectedZone.label}`}
            </span>
            {" · "}dispatching drone in{" "}
            <span className="font-bold tabular-nums text-white">{countdown.display}</span>
          </span>
        );
      }
      if (countdown.state === "held") {
        return "Dispatch held by operator · tap Send now to fly";
      }
      if (countdown.state === "fired") {
        return "Drone launching…";
      }
      return null;
    }

    // In-flight: when the run is parked at the human-in-the-loop gate,
    // surface the auto-approve countdown in the status line so the
    // operator sees the pending decision even while looking at a
    // different stage card.
    if (run.status === "awaiting_approval") {
      if (robotApprovalCountdown.state === "held") {
        return "Robot approval held · tap Approve & dispatch to send the robot";
      }
      if (robotApprovalCountdown.state === "fired") {
        return "Approving robot · dispatching ground unit…";
      }
      return (
        <span>
          <span className="text-amber-200/85">Drone confirmed hotspot</span>
          {" · "}auto-approving robot in{" "}
          <span className="font-bold tabular-nums text-white">{robotApprovalCountdown.display}</span>
        </span>
      );
    }

    const active = stages[stages.activeStage];
    return `${active.label}: ${active.status}`;
  }, [launching, runError, run, countdown, robotApprovalCountdown, stages, selectedZone]);

  return (
    <div className="space-y-3">
      {/* Compact header: single row (no tagline, no city/date chip). The
          city/date moves into the WeatherBar below as a leading pill, so
          the top of the page is one row of pills instead of three. */}
      <AppHeader compact />
      <WeatherBar withLocation />

      {/* Always-visible 4-stage timeline */}
      <StageTimeline
        stages={stages}
        focusedStage={focusedStage}
        onStageTap={handleStageTap}
        statusLine={statusLine}
      />

      {/* Field map — collapsed by default. ALL 4 zone tiles are now
          tappable: tapping the currently selected zone fires a scan,
          tapping a different zone switches the focus. The selected
          zone gets emerald-glow styling, the alert zone keeps its
          orange badge, and CTA copy on the selected tile reflects the
          current run state. */}
      <CollapsibleFieldMap
        activeZoneLabel={data.zone}
        selectedVisualId={selectedZone.id}
        onZoneTap={handleZoneTap}
        zoneCtaLabel={zoneCtaLabel}
        zoneTapEnabled={zoneTapEnabled}
      />

      {/* Focused-stage detail card. Note: handleApproveRobot is NOT
          passed in — it's wired into robotApprovalCountdown's
          onAutoFire/onSendNow inside the hook above, so the gate
          triggers approve via countdown.sendNow rather than a separate
          prop. Only the explicit reject path needs a raw handler. */}
      <MonitorStageCard
        data={data}
        run={run}
        runId={runId}
        stages={stages}
        focusedStage={focusedStage}
        countdown={countdown}
        robotApprovalCountdown={robotApprovalCountdown}
        launching={launching}
        launchError={launchError}
        onRejectRobot={handleRejectRobot}
        onResetToMap={handleResetToMap}
        onJumpToStage={handleJumpToStage}
      />
    </div>
  );
}
