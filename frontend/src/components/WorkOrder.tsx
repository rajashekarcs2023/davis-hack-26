import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import type { FieldPlaceholder } from "../data/placeholder";

type WorkOrderProps = {
  data: FieldPlaceholder;
};

function priorityStyles(priority: string) {
  if (priority === "High") {
    return {
      badge: "bg-orange-500/25 text-orange-200 ring-orange-500/30",
      border: "border-l-orange-500",
    };
  }
  return {
    badge: "bg-amber-400/15 text-amber-100 ring-amber-400/25",
    border: "border-l-amber-400",
  };
}

export function WorkOrder({ data }: WorkOrderProps) {
  const ndviPct = Math.round(data.ndvi_drop * 100);
  const confidencePct = Math.round(data.anomaly_score * 100);
  const ps = priorityStyles(data.priority);

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-white/10 bg-terrascout-card shadow-lg shadow-black/30 ${ps.border} border-l-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-white">
            #{data.workOrderId} Zone {data.zone}
          </p>
          <h3 className="mt-1 text-lg font-bold text-white">
            Irrigation system failure
          </h3>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${ps.badge}`}
        >
          {data.priority === "High"
            ? "Urgent action required"
            : "Moderate priority"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-white/10 px-3 py-3 text-center">
        <div className="rounded-lg bg-black/20 px-1 py-2">
          <Clock className="mx-auto mb-1 h-4 w-4 text-white/40" />
          <p className="text-[10px] text-white/45">When</p>
          <p className="text-[11px] font-medium text-white/85">
            {data.detectedAgo}
          </p>
        </div>
        <div className="rounded-lg bg-black/20 px-1 py-2">
          <MapPin className="mx-auto mb-1 h-4 w-4 text-white/40" />
          <p className="text-[10px] text-white/45">Where</p>
          <p className="text-[11px] font-medium leading-tight text-white/85">
            {data.locationLabel}
          </p>
        </div>
        <div className="rounded-lg bg-black/20 px-1 py-2">
          <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-400/70" />
          <p className="text-[10px] text-white/45">Confidence</p>
          <p className="text-[11px] font-semibold text-emerald-400">
            {confidencePct}%
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-orange-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Issue description
          </div>
          <div className="rounded-xl bg-black/30 px-3 py-3 text-sm leading-relaxed text-white/80 ring-1 ring-white/5">
            Satellite analysis detected a {ndviPct}% NDVI drop indicating water
            stress in <span className="text-white">{data.field}</span>. Pattern
            follows crop rows, suggesting{" "}
            <span className="font-medium text-white/95">{data.cause}</span>{" "}
            rather than disease or pest damage.
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Evidence summary
          </div>
          <div className="rounded-xl bg-black/30 px-3 py-3 text-sm leading-relaxed text-white/80 ring-1 ring-white/5">
            NDVI anomaly score{" "}
            <span className="font-semibold text-emerald-300">
              {(data.anomaly_score * 100).toFixed(0)}%
            </span>{" "}
            agreement with irrigation stress signature; localized to Zone{" "}
            {data.zone} rows {data.rows}. No broad canopy decline — consistent
            with emitter or drip-line obstruction.
          </div>
        </div>

        <div className="rounded-xl border border-red-500/20 bg-[#2a1414] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            Potential impact
          </div>
          <div className="mt-2 flex items-end justify-between text-sm">
            <span className="text-white/75">~{data.waterRateGph} gal/hour</span>
            <span className="text-base font-bold text-red-400">
              ${data.costPerDayUsd}/day
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            className="rounded-xl border border-white/20 py-3 text-sm font-semibold text-white/90 hover:bg-white/5"
          >
            Details
          </button>
          <button
            type="button"
            className="rounded-xl bg-emerald-500 py-3 text-sm font-bold text-black hover:bg-emerald-400"
          >
            Mark completed
          </button>
        </div>
      </div>
    </article>
  );
}
