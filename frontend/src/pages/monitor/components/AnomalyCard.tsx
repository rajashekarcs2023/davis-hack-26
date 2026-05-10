import { AlertTriangle, ArrowUpRight, Droplets } from "lucide-react";
import type { FieldPlaceholder } from "../../../data/placeholder";

export type AnomalyCardVariant = "monitor" | "assessment";

type AnomalyCardProps = {
  data: FieldPlaceholder;
  /** `monitor` = left-accent card + Review CTA. `assessment` = orange banner + timestamp + same body (Figma review screen). */
  variant?: AnomalyCardVariant;
  onReviewAssessment?: () => void;
};

export function AnomalyCard({
  data,
  variant = "monitor",
  onReviewAssessment,
}: AnomalyCardProps) {
  const ndviPct = Math.round(data.ndvi_drop * 100);
  const confidencePct = Math.round(data.anomaly_score * 100);

  const body = (
    <>
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/40 bg-orange-500/15 text-orange-400">
          <AlertTriangle className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug tracking-tight text-white">
            Probable Irrigation System Failure
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#9ca89f]">
            Satellite analysis detected water stress affecting{" "}
            <span className="font-semibold text-white">
              {data.affectedAcres} acres
            </span>{" "}
            in Zone {data.zone}, rows {data.rows}. Pattern suggests blocked drip
            line or emitter failure.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-[#0a1210] px-2 py-2.5 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-white/40">
            NDVI drop
          </div>
          <div className="mt-1 text-lg font-bold text-[#f97316]">-{ndviPct}%</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0a1210] px-2 py-2.5 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-white/40">
            Affected
          </div>
          <div className="mt-1 text-lg font-bold text-white">
            {data.affectedAcres} ac
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0a1210] px-2 py-2.5 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-white/40">
            Confidence
          </div>
          <div className="mt-1 text-lg font-bold text-[#4ade80]">
            {confidencePct}%
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-red-500/30 bg-[#251314] p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-400/90">
          <AlertTriangle className="h-3.5 w-3.5" />
          Potential impact
        </div>
        <div className="mt-2 flex items-end justify-between gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-white/85">
            <Droplets className="h-4 w-4 shrink-0 text-orange-300/90" />
            <span>~{data.waterRateGph} gal/hour</span>
          </div>
          <div className="text-base font-bold text-[#ef4444]">
            ${data.costPerDayUsd}/day
          </div>
        </div>
      </div>
    </>
  );

  if (variant === "assessment") {
    return (
      <div className="space-y-2">
        <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f97316] py-3.5 text-sm font-bold uppercase tracking-wide text-black shadow-lg shadow-orange-950/30">
          <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />
          Zone {data.zone}: High Stress
        </div>
        <p className="px-1 text-[12px] text-white/45">Detected {data.detectedAgo}</p>
        <article className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-[#f97316] bg-[#111c18] p-4 shadow-xl shadow-black/50">
          {body}
        </article>
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-[#f97316] bg-[#111c18] p-4 shadow-xl shadow-black/50">
      {body}
      {onReviewAssessment ? (
        <button
          type="button"
          onClick={onReviewAssessment}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4ade80] py-3.5 text-[13px] font-bold uppercase tracking-wide text-[#0a1210] shadow-md shadow-emerald-950/40 transition hover:bg-[#3fcd73]"
        >
          Review AI assessment
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      ) : null}
    </article>
  );
}
