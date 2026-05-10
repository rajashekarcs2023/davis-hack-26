import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
} from "lucide-react";
import type { FieldPlaceholder } from "../../../data/placeholder";

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
            Canopy stress hotspot
          </h3>
          <p className="mt-0.5 text-[11px] text-white/55">
            {data.cause}
          </p>
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
            AgriScout detected a {ndviPct}% NDVI drop in{" "}
            <span className="text-white">{data.field}</span>. Aerial scan
            confirmed a localized hotspot; ground robot ran a differential
            diagnostic. Likely cause:{" "}
            <span className="font-medium text-white/95">{data.cause}</span>.
            Scout confirmation recommended before field-wide treatment.
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Evidence summary
          </div>
          <ul className="space-y-1.5 rounded-xl bg-black/30 px-3 py-3 text-sm leading-snug text-white/80 ring-1 ring-white/5">
            <li className="flex gap-2">
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80"
                aria-hidden
              />
              <span>
                Satellite NDVI anomaly{" "}
                <span className="font-semibold text-emerald-300">
                  {(data.anomaly_score * 100).toFixed(0)}%
                </span>{" "}
                localized to Zone {data.zone}, rows {data.rows}
              </span>
            </li>
            <li className="flex gap-2">
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80"
                aria-hidden
              />
              <span>Drone aerial scan confirmed hotspot boundary</span>
            </li>
            <li className="flex gap-2">
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80"
                aria-hidden
              />
              <span>
                Ground robot ran 4-step differential diagnostic (leaf inspect
                · healthy compare · soil probe · marker placement)
              </span>
            </li>
          </ul>
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
