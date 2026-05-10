import type { ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, XCircle } from "lucide-react";
import type { FieldPlaceholder } from "../data/placeholder";

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

type HumanInTheLoopProps = {
  onProceed?: () => void;
  onIgnore?: () => void;
};

export function HumanInTheLoopPanel({
  onProceed,
  onIgnore,
}: HumanInTheLoopProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-[#f97316] bg-[#111c18] p-4 shadow-xl shadow-black/40">
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-[#f97316]"
          strokeWidth={2.2}
        />
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white">
            Human-in-the-Loop Decision
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            AI has identified a high-confidence irrigation anomaly. You have the
            final decision on whether to deploy robotic inspection or mark this as
            a false alarm.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        <button
          type="button"
          onClick={onProceed}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4ade80] py-3.5 text-[12px] font-bold uppercase tracking-wide text-[#0a1210] shadow-md shadow-emerald-950/35 transition hover:bg-[#3fcd73]"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.25} />
          Proceed to robotic inspection
        </button>
        <button
          type="button"
          onClick={onIgnore}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#0a1210] py-3.5 text-[12px] font-bold uppercase tracking-wide text-white transition hover:bg-white/5"
        >
          <XCircle className="h-5 w-5 shrink-0 text-white/80" strokeWidth={2.25} />
          Ignore anomaly
        </button>
      </div>
    </section>
  );
}

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

export function AiReasoningPanel({ data }: PanelProps) {
  return (
    <section className="rounded-2xl border border-emerald-900/40 bg-[#0d1512] p-4 shadow-inner shadow-black/40">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-[#4ade80] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0a1210]">
          AI
        </span>
        <h3 className="text-base font-bold text-white">AI Reasoning</h3>
      </div>
      <ul className="mt-4 space-y-3">
        <ReasoningBullet>
          Anomaly follows a distinct{" "}
          <strong className="font-semibold text-white">row pattern</strong>,
          indicating uneven water delivery rather than disease or pest damage.
        </ReasoningBullet>
        <ReasoningBullet>
          Spectral signature shows{" "}
          <strong className="font-semibold text-white">
            water stress characteristics
          </strong>
          : reduced chlorophyll absorption and increased visible reflectance.
        </ReasoningBullet>
        <ReasoningBullet>
          Pattern geometry suggests{" "}
          <strong className="font-semibold text-white">
            drip-line blockage or emitter failure
          </strong>{" "}
          affecting rows {data.rows} in Zone {data.zone}.
        </ReasoningBullet>
        <ReasoningBullet>
          Historical data shows this zone has{" "}
          <strong className="font-semibold text-white">no prior stress events</strong>
          , suggesting recent equipment failure rather than chronic issue.
        </ReasoningBullet>
      </ul>
    </section>
  );
}
