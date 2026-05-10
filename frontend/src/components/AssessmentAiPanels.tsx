import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { FieldPlaceholder } from "../data/placeholder";
import type { RunSummary } from "../lib/api";

type PanelProps = {
  data: FieldPlaceholder;
};

const BASELINE_NDVI = 0.78;

export function AssessmentFieldTitle({ data }: PanelProps) {
  return (
    <div className="space-y-1 px-0.5">
      <h2 className="text-lg font-bold tracking-tight text-white">
        AI Field Analysis
      </h2>
      <p className="text-xs font-medium text-emerald-200/55">
        Zone {data.zone} · VLM/VLA Assessment
      </p>
    </div>
  );
}

export function NdviAnomalyPanel({ data }: PanelProps) {
  const expected = BASELINE_NDVI;
  const current = Math.max(0, expected - data.ndvi_drop);
  const dropPct = Math.round(data.ndvi_drop * 100);
  const confidencePct = Math.round(data.anomaly_score * 100);

  return (
    <section className="rounded-2xl border border-emerald-900/40 bg-[#0d1512] p-4 shadow-inner shadow-black/40">
      <h3 className="text-base font-bold text-white">NDVI Anomaly Detection</h3>
      <div className="mt-1 flex justify-between text-[11px] font-medium text-emerald-200/50">
        <span>Normal Range</span>
        <span>Current</span>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-[#0a1210]/80 p-3">
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/40">
              Expected NDVI
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#4ade80]">
              {expected.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/40">
              Current NDVI
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#fb923c]">
              {current.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="my-3 h-px bg-white/10" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/50">Drop from Baseline</span>
          <span className="text-lg font-bold tabular-nums text-red-400">
            -{dropPct}%
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-white/55">Confidence Score</span>
          <span className="font-semibold tabular-nums text-white/90">
            {confidencePct}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
          <div
            className="h-full rounded-full bg-[#4ade80] transition-[width]"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#4ade80]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          High Confidence
        </div>
      </div>
    </section>
  );
}

function ReasoningBullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed text-white/75">
      <span
        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#4ade80]"
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

// Note: HumanInTheLoopPanel was removed in favour of the countdown-driven
// RobotApprovalGate (see components/monitor/MonitorStageCard.tsx). The new
// gate combines a 30-second auto-approve timer with the same Approve/Reject
// affordances, so the legacy two-button panel was no longer needed. If you
// want a static (no-countdown) approval prompt, fork RobotApprovalGate
// rather than reviving this — the underlying state machine in MonitorPage
// is now built around the countdown handle.

export function AssessmentMetadataGrid({ data }: PanelProps) {
  const cells: { label: string; value: string }[] = [
    { label: "Detection Time", value: data.detectedAgo },
    { label: "Satellite Pass", value: "Sentinel-2A" },
    { label: "Cloud Cover", value: "2% (Excellent)" },
    { label: "Resolution", value: "10m multispectral" },
  ];

  return (
    <section className="rounded-2xl border border-white/12 bg-[#0d1512] p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        {cells.map((cell) => (
          <div key={cell.label} className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/40">
              {cell.label}
            </p>
            <p className="mt-1 text-sm font-bold leading-snug text-white">
              {cell.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

type AiReasoningPanelProps = PanelProps & {
  /** Live run from /api/runs/{id}; if present we render the agent's actual
   *  plan reasoning + aerial VLM evidence. Falls back to the static demo
   *  bullets when there's no run yet. */
  run?: RunSummary | null;
};

export function AiReasoningPanel({ data, run }: AiReasoningPanelProps) {
  // Build the bullet list from the live run if we have one. We split
  // `plan.reasoning` on sentence boundaries so each clause becomes its own
  // bullet — matches the visual rhythm of the static fallback below.
  const planSentences = run?.plan?.reasoning
    ? run.plan.reasoning
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : null;
  const aerialEvidence = run?.aerial_analysis?.evidence ?? [];
  const haveLive = !!planSentences && planSentences.length > 0;

  return (
    <section className="rounded-2xl border border-emerald-900/40 bg-[#0d1512] p-4 shadow-inner shadow-black/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[#4ade80] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0a1210]">
            AI
          </span>
          <h3 className="text-base font-bold text-white">AI Reasoning</h3>
        </div>
        {run?.plan?.confidence ? (
          <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-[#4ade80] ring-1 ring-emerald-500/25">
            {Math.round(run.plan.confidence * 100)}% confidence
          </span>
        ) : null}
      </div>
      {haveLive ? (
        <ul className="mt-4 space-y-3">
          {planSentences!.map((s, i) => (
            <ReasoningBullet key={`plan-${i}`}>
              <span className="text-white/85">{s}</span>
            </ReasoningBullet>
          ))}
          {aerialEvidence.length > 0 ? (
            <li className="mt-1 border-t border-white/10 pt-3 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/55">
              Drone VLM observations
            </li>
          ) : null}
          {aerialEvidence.map((e, i) => (
            <ReasoningBullet key={`aerial-${i}`}>
              <span className="text-white/75">{e}</span>
            </ReasoningBullet>
          ))}
        </ul>
      ) : (
        <ul className="mt-4 space-y-3">
          <ReasoningBullet>
            Hotspot detected in Zone {data.zone}, rows {data.rows}. Aerial VLM
            will check{" "}
            <strong className="font-semibold text-white">
              row geometry, canopy texture, and visible damage
            </strong>{" "}
            to narrow the cause.
          </ReasoningBullet>
          <ReasoningBullet>
            Candidate causes:{" "}
            <strong className="font-semibold text-white">
              pest pressure, water stress, nutrient deficit, or false alarm
            </strong>
            . Aerial confirms WHERE; ground robot determines WHY.
          </ReasoningBullet>
          <ReasoningBullet>
            Pattern fingerprints (row-aligned vs. patchy) and proximity to
            field edges will weight the belief between irrigation, pest, and
            nutrient hypotheses.
          </ReasoningBullet>
          <ReasoningBullet>
            This zone has{" "}
            <strong className="font-semibold text-white">
              prior hotspot history
            </strong>
            ; the diagnostic loop will weigh that signal alongside today's
            satellite anomaly and weather pressure index.
          </ReasoningBullet>
        </ul>
      )}
    </section>
  );
}
