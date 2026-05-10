import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronLeft,
  ListChecks,
  MapPin,
  Target,
  User,
} from "lucide-react";
import type { FieldPlaceholder } from "../data/placeholder";
import type { BeliefState, RunSummary } from "../lib/api";
import { BeliefStateStrip } from "./monitor/BeliefStateStrip";

type FieldWorkOrderScreenProps = {
  data: FieldPlaceholder;
  /** Live run from /api/runs/{id}; if its work_order is set we render the real
   *  thing, otherwise we fall back to the static mockup so the screen still
   *  looks complete in standalone preview / no-backend mode. */
  run?: RunSummary | null;
  onBack: () => void;
  onReturnToMonitor: () => void;
  /**
   * When true, hide the back-button + title-row chrome (the timeline
   * already provides navigation when this is rendered as the Report
   * stage card on Monitor).
   */
  embedded?: boolean;
};

/**
 * Count how many of the 4 ground-robot diagnostic steps actually ran.
 * Pulled from `run.diagnostic_bundle` rather than tool_calls so we only
 * count steps that produced real evidence (a tool-call that failed at
 * the safety guard shouldn't inflate the "diagnostic steps" number in the
 * work order header).
 */
function countDiagnosticSteps(run: RunSummary | null | undefined): number {
  const b = run?.diagnostic_bundle;
  if (!b) return 0;
  let n = 0;
  if (b.leaf_affected) n += 1;
  if (b.leaf_healthy) n += 1;
  if (b.soil_probe) n += 1;
  if (b.marker_placed) n += 1;
  return n;
}

/** Format a UTC ISO string as the demo's two-line date label. */
function formatCreatedAt(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: "—", time: "—" };
    const date = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return { date, time };
  } catch {
    return { date: "—", time: "—" };
  }
}

const GPS_LINE = "GPS: 38.5449°N, 121.7405°W";

function VisualEvidenceDiagram() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#1a2520]">
      <svg
        viewBox="0 0 320 140"
        className="h-auto w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="wo-sky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7eb8dc" />
            <stop offset="100%" stopColor="#b8d4e8" />
          </linearGradient>
          <linearGradient id="wo-soil" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6d4c41" />
            <stop offset="100%" stopColor="#4e342e" />
          </linearGradient>
        </defs>
        <rect width="320" height="55" fill="url(#wo-sky)" />
        <rect y="55" width="320" height="85" fill="url(#wo-soil)" />
        {/* Plants */}
        {[40, 72, 104, 136, 168, 200, 232, 264].map((x) => (
          <rect
            key={x}
            x={x}
            y="38"
            width="14"
            height="22"
            rx="2"
            fill="#2e7d32"
            opacity="0.95"
          />
        ))}
        {/* Drip line */}
        <rect x="24" y="92" width="272" height="8" rx="4" fill="#5d4037" />
        <rect x="24" y="92" width="272" height="8" rx="4" fill="#78909c" opacity="0.35" />
        {/* Blockage segment */}
        <rect x="148" y="91" width="36" height="10" rx="2" fill="#dc2626" opacity="0.95" />
        {/* Pointer */}
        <path
          d="M 166 78 L 166 88"
          stroke="#dc2626"
          strokeWidth="2"
        />
        <rect x="148" y="62" width="56" height="18" rx="4" fill="#991b1b" />
        <text
          x="176"
          y="74"
          textAnchor="middle"
          fill="white"
          fontSize="10"
          fontFamily="system-ui, sans-serif"
          fontWeight="600"
        >
          Blockage
        </text>
      </svg>
    </div>
  );
}

export function FieldWorkOrderScreen({
  data,
  run,
  onBack,
  onReturnToMonitor,
  embedded = false,
}: FieldWorkOrderScreenProps) {
  const ndviPct = Math.round(data.ndvi_drop * 100);
  const wo = run?.work_order ?? null;

  // AgriScout multi-cause: prefer the agent's structured evidence bullets.
  // Each string in wo.evidence is a short finding (e.g. "leaf stippling +
  // webbing", "soil moisture 14% (dry)") so we render them as a bullet list
  // rather than concatenating into a sentence.
  const evidenceBullets: string[] = wo?.evidence ?? [
    "Satellite anomaly detected localized canopy stress",
    `NDVI drop of ${ndviPct}% in affected rows`,
    "Drone aerial scan confirmed hotspot boundary",
    "Ground robot diagnostic ran — see findings below",
  ];

  const issueTitle = wo?.issue ?? "Field anomaly — diagnosis pending";
  const priorityLabel = (wo?.priority ?? "high").toUpperCase();
  const isHighPriority = (wo?.priority ?? "high").toLowerCase() === "high";
  const workOrderId = wo?.work_order_id ?? `WO-${data.workOrderId}`;
  const zoneId = wo?.zone_id ?? data.zone;
  const created = formatCreatedAt(wo?.created_at);

  // Recommended action: the live run gives one string; the placeholder
  // fallback is cause-agnostic scout-language so the standalone preview
  // doesn't pretend the diagnosis is known yet.
  const recommendedActions =
    wo && wo.recommended_action
      ? [wo.recommended_action]
      : ([
          "Dispatch human scout to marker location placed by robot",
          "Confirm finding in person before any field-wide treatment",
          "If confirmed, apply the cause-specific response noted below",
          "Log outcome so AgriScout's priors improve for next season",
        ] as string[]);

  // ---- Multi-cause diagnosis summary ----
  // The final belief snapshot is the demo payoff: it tells the farmer WHY
  // the recommended action is what it is. We pull it from the diagnostic
  // bundle instead of re-computing from the work order, so the numbers line
  // up exactly with the belief strip the user just saw on the Robot stage.
  const beliefEvolution = run?.diagnostic_bundle?.belief_evolution ?? null;
  const finalBelief: BeliefState | null =
    beliefEvolution && beliefEvolution.length > 0
      ? beliefEvolution[beliefEvolution.length - 1]
      : null;
  const diagnosticStepCount = countDiagnosticSteps(run);

  return (
    <>
      {/* Chrome (back / title / Active pill) — hidden when embedded inside
          the Monitor stage card; the timeline provides nav and the work
          order article below carries its own header. */}
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
              Field Work Order
            </h2>
            <p className="mt-0.5 text-xs text-emerald-200/55">Ready for Action</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#4ade80] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#0a1210]">
            Active
          </span>
        </div>
      ) : null}

      <article className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-orange-500 bg-[#111c18] shadow-xl shadow-black/40">
        <div className="border-b border-white/10 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
              Field Work Order
            </p>
            <span className="text-sm font-bold text-[#4ade80]">
              {workOrderId}
            </span>
          </div>
          <h3 className="mt-2 text-xl font-bold leading-snug text-white">
            {issueTitle} — Zone {zoneId}
          </h3>
        </div>

        <div className="space-y-5 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={`h-5 w-5 shrink-0 ${isHighPriority ? "text-orange-400" : "text-amber-300"}`}
                strokeWidth={2.2}
              />
              <span
                className={`text-sm font-bold uppercase tracking-wide ${isHighPriority ? "text-orange-400" : "text-amber-300"}`}
              >
                {priorityLabel} Priority
              </span>
            </div>
            <p className="text-right text-xs text-white/50">
              {diagnosticStepCount > 0
                ? `${diagnosticStepCount} diagnostic steps · ${beliefEvolution?.length ?? 0} belief snapshots`
                : `${ndviPct}% NDVI drop · awaiting robot diagnostic`}
            </p>
          </div>

          {/* Diagnosis summary — the AgriScout multi-cause payoff.
              Only shown when we actually have a final belief snapshot. */}
          {finalBelief ? (
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                <Target className="h-4 w-4 text-[#4ade80]" />
                Diagnosis
              </div>
              <div className="mt-2">
                <BeliefStateStrip
                  evolution={beliefEvolution}
                  snapshot="final"
                  compact
                />
              </div>
            </div>
          ) : null}

          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
              <MapPin className="h-4 w-4 text-[#4ade80]" />
              Location
            </div>
            <p className="mt-1 text-base font-bold text-white">
              Zone {zoneId}, Rows {data.rows}
            </p>
            <p className="mt-1 text-xs text-white/50">{GPS_LINE}</p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
              <AlertTriangle className="h-4 w-4 text-orange-400/90" />
              Issue Description
            </div>
            <p className="mt-1 text-base font-bold text-white">
              {issueTitle}
            </p>
          </div>

          {/* Evidence collected — one bullet per finding so each piece of
              evidence is attributable, not buried in a prose paragraph. */}
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
              <ListChecks className="h-4 w-4 text-orange-300/90" />
              Evidence collected
            </div>
            <ul className="mt-2 space-y-1.5">
              {evidenceBullets.map((line, idx) => (
                <li
                  key={`${line}-${idx}`}
                  className="flex gap-2 text-sm leading-snug text-white/80"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400/80"
                    aria-hidden
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-bold text-white">Visual Evidence</p>
            <div className="mt-3">
              <VisualEvidenceDiagram />
            </div>
          </div>

          <div className="border-t border-white/10 pt-5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/35">
                <Check className="h-4 w-4 text-[#4ade80]" strokeWidth={3} />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
                Recommended Action
              </span>
            </div>
            <ul className="mt-3 space-y-2.5 pl-1">
              {recommendedActions.map((line) => (
                <li
                  key={line}
                  className="flex gap-2.5 text-sm leading-snug text-emerald-100/85"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ade80]"
                    aria-hidden
                  />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
            <div className="flex gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                  Created
                </p>
                <p className="mt-0.5 text-xs font-medium leading-snug text-white/85">
                  {created.date}
                  <br />
                  {created.time}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                  Assigned To
                </p>
                <p className="mt-0.5 text-xs font-semibold text-white">
                  Field Crew
                </p>
              </div>
            </div>
          </div>
        </div>
      </article>

      <div className="pt-1">
        <button
          type="button"
          onClick={onReturnToMonitor}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4ade80] py-3.5 text-sm font-bold text-[#0a1210] shadow-lg shadow-emerald-950/35 transition hover:bg-[#3fcd73]"
        >
          <Check className="h-5 w-5 shrink-0 text-[#0a1210]" strokeWidth={3} />
          Return to monitor
        </button>
      </div>

      <p className="pb-2 pt-2 text-center text-[10px] leading-relaxed text-white/35">
        Generated by AgriScout AI • Powered by VLM/VLA • Sentinel-2 • CIMIS •
        OpenET
      </p>
    </>
  );
}
