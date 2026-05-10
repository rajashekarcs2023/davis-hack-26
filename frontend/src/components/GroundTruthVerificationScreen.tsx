import { useMemo } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  CirclePlay,
  Loader2,
  Navigation,
} from "lucide-react";
import type { RunSummary } from "../lib/api";
import { useFrame } from "../lib/useRun";

type GroundTruthVerificationScreenProps = {
  zoneLabel: string;
  /** The active run; null until /api/runs/{id} returns its first response. */
  run?: RunSummary | null;
  /** Run id, kept here so the screen can degrade gracefully if `run` is null. */
  runId?: string | null;
  onBack: () => void;
  /** Called when user taps Generate Work Order — optional navigation hook. */
  onGenerateWorkOrder?: () => void;
  /**
   * When true, the component is being rendered inside a parent shell (e.g.
   * the Monitor stage card) that already provides navigation, the zone
   * label, and a progress indicator. In embedded mode we hide the back
   * button + title row + standalone progress badge so the screen reads as
   * pure content. The progress bar inside the verification status panel
   * still shows since it's part of the content, not chrome.
   */
  embedded?: boolean;
};

/**
 * Pretty-print a `{action, magnitude}` tuple as the kind of VLA pseudo-code
 * line the original mockup used (e.g. `drive_forward(0.85)`). We only show
 * actions the safety guard accepted; rejected ones are reported separately.
 */
function formatActionLine(action: { action: string; magnitude: number }): string {
  return `${action.action}(${action.magnitude.toFixed(2)})`;
}

function shortenToolName(name: string | undefined): string {
  if (!name) return "tool";
  return name.replace(/_/g, "_");
}

export function GroundTruthVerificationScreen({
  zoneLabel,
  run,
  runId,
  onBack,
  onGenerateWorkOrder,
  embedded = false,
}: GroundTruthVerificationScreenProps) {
  // Live wrist-cam frame from /api/robot/frame, refreshed every 500 ms.
  const robotFrameUrl = useFrame(runId ? "robot" : null, 500);

  // "Done" = the diagnostic loop has produced enough evidence to call it.
  //
  // Two parallel signals can flip this true:
  //   1. Legacy single-shot vlm_analyze_ground (groundAnalysis with any
  //      positive flag or non-zero confidence). Kept so older runs and
  //      mock-VLM smoke tests still light the panel up correctly.
  //   2. New ER-based diagnostic loop, signalled by ANY of:
  //        - diagnostic_bundle.belief_evolution has the full set of
  //          snapshots (>= 4: after_aerial + after_leaf + after_compare
  //          + after_probe). The "final" snapshot is optional; we don't
  //          require it because the agent sometimes produces a work order
  //          before the final synthetic snapshot is recorded.
  //        - run.work_order is populated.
  //        - run.status has reached "completed" or "rejected" (terminal).
  //
  // Without these the panel was stuck on "Verification in progress…"
  // forever after the run finished, since `ground_analysis` is now always
  // null.
  const groundAnalysis = run?.ground_analysis ?? null;
  const legacyDone =
    !!groundAnalysis &&
    (groundAnalysis.confidence > 0 ||
      groundAnalysis.dry_soil ||
      groundAnalysis.wilted_leaves ||
      groundAnalysis.damaged_drip_line);
  const beliefSnapshots =
    run?.diagnostic_bundle?.belief_evolution?.length ?? 0;
  const bundleDone = beliefSnapshots >= 4;
  const runTerminal =
    run?.status === "completed" || run?.status === "rejected";
  const verificationDone =
    legacyDone || bundleDone || runTerminal || !!run?.work_order;

  // The robot path comes from `plan.robot_path_hint` once dispatch_ground_robot
  // surfaces it (we set this in routes_runs / tools.py). Until then we show
  // a typing-style placeholder.
  const plannedActions = run?.plan?.robot_path_hint ?? [];

  // Pick out the robot-flavored tool calls so we can show meaningful chips.
  // Includes the new ER-based diagnostic loop tools so the progress bar
  // increments naturally as each one fires.
  const toolCalls = run?.tool_calls ?? [];
  const robotRelevantTools = toolCalls.filter((tc) => {
    const n = tc.tool ?? tc.name ?? "";
    return (
      n === "dispatch_ground_robot" ||
      n === "vlm_analyze_ground" ||
      n === "inspect_leaf_with_wrist" ||
      n === "compare_healthy_plant" ||
      n === "probe_soil_moisture" ||
      n === "place_pest_marker" ||
      n === "create_work_order"
    );
  });

  const vlaLines = useMemo(() => {
    if (plannedActions.length === 0) return [] as string[];
    const lines: string[] = [`initialize_navigation(zone_${zoneLabel.toLowerCase()})`];
    for (const a of plannedActions) lines.push(formatActionLine(a));
    if (verificationDone) {
      lines.push("analyze_frame()");
      lines.push("verification_complete()");
    }
    return lines;
  }, [plannedActions, verificationDone, zoneLabel]);

  // Progress bar: anchor on whichever tools have fired so the bar grows
  // monotonically through the run instead of jumping from 55% to 100%.
  // Each diagnostic-loop tool covers one quarter of the post-dispatch
  // work, so the bar marches from 55 -> 65 -> 75 -> 85 -> 95 -> 100.
  const progressPct = useMemo(() => {
    if (verificationDone) return 100;
    let p = 10; // baseline as soon as we hit this screen
    for (const tc of robotRelevantTools) {
      const n = tc.tool ?? tc.name ?? "";
      if (n === "dispatch_ground_robot") p = Math.max(p, 55);
      if (n === "inspect_leaf_with_wrist") p = Math.max(p, 65);
      if (n === "compare_healthy_plant") p = Math.max(p, 75);
      if (n === "probe_soil_moisture") p = Math.max(p, 85);
      if (n === "place_pest_marker") p = Math.max(p, 95);
      if (n === "vlm_analyze_ground") p = Math.max(p, 90);
    }
    return p;
  }, [verificationDone, robotRelevantTools]);

  const groundConfidencePct = groundAnalysis ? Math.round(groundAnalysis.confidence * 100) : 0;
  const confirmedIssue = groundAnalysis
    ? groundAnalysis.damaged_drip_line
      ? "Drip Line Blockage"
      : groundAnalysis.dry_soil
        ? "Dry Soil / Irrigation Underflow"
        : groundAnalysis.wilted_leaves
          ? "Plant Water Stress"
          : "No clear failure mode"
    : "Pending";

  return (
    <div className="space-y-4">
      {/* Chrome (back / title / progress chip) — hidden when embedded
          inside the Monitor stage card, since the timeline + status line
          already provide nav and the verification panel below has its own
          inline progress bar. */}
      {!embedded ? (
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/85 transition hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-white">
              Ground-Truth Verification
            </h2>
            <p className="mt-0.5 text-xs text-emerald-200/55">
              Robotic Scout · Zone {zoneLabel}
            </p>
          </div>
          <div
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums shadow-md shadow-emerald-950/30 ${
              verificationDone
                ? "bg-[#4ade80] text-[#0a1210]"
                : "bg-white/10 text-emerald-200/70 ring-1 ring-white/15"
            }`}
          >
            {progressPct}%
          </div>
        </div>
      ) : null}

      {/* 1. Verification status */}
      <section className="overflow-hidden rounded-2xl border border-emerald-500/35 border-l-4 border-l-[#4ade80] bg-[#0d1512] p-4 shadow-inner shadow-black/40">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              verificationDone ? "bg-[#4ade80]" : "animate-pulse bg-amber-400"
            }`}
          />
          <p className="text-sm font-bold text-white">
            {verificationDone ? "Verification complete!" : "Verification in progress…"}
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
          <div
            className="h-full rounded-full bg-[#4ade80] transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </section>

      {/* 2. Live robot feed */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1512] shadow-lg shadow-black/40">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[#4ade80]">
              <CirclePlay className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-bold text-white">
              Live Robot Feed
            </span>
          </div>
          <span className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
            Unity DAC RobotSim
          </span>
        </div>

        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0a1210]">
          {robotFrameUrl ? (
            <img
              src={robotFrameUrl}
              alt="Live robot wrist camera"
              className="h-full w-full object-cover"
            />
          ) : (
            // Fallback stylized scene if the robot sim isn't producing frames yet.
            <>
              <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-[#4a90c8] via-[#6eb0d8] to-[#8bc4e0]" />
              <div className="absolute inset-x-0 bottom-0 top-[38%] bg-gradient-to-b from-[#5d4037] via-[#6d4c41] to-[#4e342e]" />
              <div className="absolute bottom-[28%] left-[8%] h-[22%] w-[28%] rounded-[40%] bg-[#2e7d32]/90 blur-[1px]" />
              <div className="absolute bottom-[26%] right-[12%] h-[26%] w-[32%] rounded-[45%] bg-[#1b5e20]/95 blur-[1px]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-md bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm">
                  Awaiting robot stream…
                </div>
              </div>
            </>
          )}

          {/* Evidence-point overlay (Gemini Robotics-ER coords are 0..1000). */}
          {groundAnalysis?.evidence_points?.map((ep, idx) => {
            const [y, x] = ep.point;
            const yPct = Math.max(0, Math.min(100, (y / 1000) * 100));
            const xPct = Math.max(0, Math.min(100, (x / 1000) * 100));
            return (
              <div
                key={`ep-${idx}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${xPct}%`, top: `${yPct}%` }}
              >
                <span className="block h-3 w-3 rounded-full border-2 border-white bg-red-500 shadow-md shadow-red-900/40" />
                <span className="mt-1 block whitespace-nowrap rounded bg-red-600/85 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow">
                  {ep.label}
                </span>
              </div>
            );
          })}

          {/* Telemetry overlay */}
          <div className="absolute left-2 top-2 max-w-[72%] rounded-lg border border-white/10 bg-black/65 px-2 py-1.5 font-mono text-[9px] leading-snug text-white/95 backdrop-blur-sm">
            <div>Zone: {zoneLabel}</div>
            <div className="mt-0.5 text-white/85">
              Run: {run?.run_id ? run.run_id.slice(-6) : "—"}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-white/90">
              <Navigation className="h-3 w-3 shrink-0 text-emerald-400" />
              {run?.status ?? "connecting"}
            </div>
          </div>

          {/* Crosshair */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-red-500/60" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-red-500/60" />
            <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-400/80" />
          </div>
        </div>
      </section>

      {/* 3. VLA action log */}
      <section className="rounded-2xl border border-white/10 bg-[#0a1210] p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white">VLA Action Log</h3>
          {plannedActions.length > 0 ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/55">
              {plannedActions.length} actions
            </span>
          ) : null}
        </div>
        <div className="mt-3 rounded-xl border border-emerald-900/40 bg-black/40 px-3 py-3 font-mono text-[11px] leading-relaxed">
          {vlaLines.length > 0 ? (
            <ul className="space-y-1 text-[#4ade80]">
              {vlaLines.map((line, i) => (
                <li key={`${line}-${i}`}>
                  <span className="select-none text-emerald-600">&gt;</span> {line}
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 text-emerald-500/80">
              <div className="flex items-center gap-2 text-[11px]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span>Fetching command stream…</span>
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-3 animate-pulse rounded bg-emerald-500/15"
                  style={{ width: `${68 + i * 4}%` }}
                />
              ))}
            </div>
          )}
        </div>
        {robotRelevantTools.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {robotRelevantTools.map((tc, i) => (
              <span
                key={`${tc.tool ?? tc.name ?? "tool"}-${i}`}
                className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#4ade80]"
              >
                {shortenToolName(tc.tool ?? tc.name)}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {/* 4. VLM verification summary — full detail once ground analysis lands */}
      {verificationDone ? (
        <section className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-[#4ade80] bg-[#111c18] shadow-xl shadow-black/40">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
              <Check className="h-6 w-6 text-[#4ade80]" strokeWidth={2.8} />
            </span>
            <h3 className="text-lg font-bold leading-tight text-white">
              VLM Verification Complete
            </h3>
          </div>

          <div className="p-4 pt-3">
            <div className="rounded-xl border border-white/10 bg-[#0d1613] p-4 shadow-inner shadow-black/30">
              <div className="flex items-center gap-2.5">
                <Camera className="h-5 w-5 shrink-0 text-[#4ade80]" strokeWidth={2} />
                <span className="font-bold text-white">
                  Visual Evidence Confirmed
                </span>
              </div>
              {groundAnalysis?.other_evidence?.length ? (
                <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-emerald-100/65">
                  {groundAnalysis.other_evidence.slice(0, 4).map((line, i) => (
                    <li key={i}>• {line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-emerald-100/65">
                  Close-up inspection confirms localized stress and visual anomaly
                  consistent with the satellite signal.
                </p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Match Confidence
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#4ade80]">
                    {groundConfidencePct >= 70 ? "High" : groundConfidencePct >= 40 ? "Medium" : "Low"} ({groundConfidencePct}%)
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Issue Confirmed
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {confirmedIssue}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onGenerateWorkOrder?.()}
                disabled={!run?.work_order}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4ade80] py-3.5 text-[12px] font-bold uppercase tracking-wide text-[#0a1210] shadow-lg shadow-emerald-950/35 transition hover:bg-[#3fcd73] disabled:cursor-not-allowed disabled:bg-emerald-500/25 disabled:text-emerald-200/55 disabled:shadow-none"
              >
                {run?.work_order ? (
                  <>
                    <Check className="h-5 w-5 shrink-0 stroke-[3]" />
                    View work order
                  </>
                ) : (
                  <>
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin" strokeWidth={2.25} />
                    Finalizing work order…
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 border-l-4 border-l-white/20 bg-[#111c18]/80 px-4 py-3.5 opacity-70">
          <p className="text-sm font-medium text-white/50">
            Awaiting VLM verification…
          </p>
        </section>
      )}
    </div>
  );
}
