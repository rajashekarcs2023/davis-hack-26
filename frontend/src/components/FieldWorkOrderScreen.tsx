import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronLeft,
  MapPin,
  User,
} from "lucide-react";
import type { FieldPlaceholder } from "../data/placeholder";

type FieldWorkOrderScreenProps = {
  data: FieldPlaceholder;
  onBack: () => void;
  onReturnToMonitor: () => void;
};

const GPS_LINE = "GPS: 38.5449°N, 121.7405°W";

const RECOMMENDED_ACTIONS = [
  "Inspect drip line near Row 14 for blockages or kinks",
  "Check emitters for clogging (debris or mineral buildup)",
  "Flush line and replace damaged sections if necessary",
  "Verify water flow restoration after repair",
] as const;

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
  onBack,
  onReturnToMonitor,
}: FieldWorkOrderScreenProps) {
  const ndviPct = Math.round(data.ndvi_drop * 100);

  const issueBody =
    "Robotic inspection confirmed blockage in drip irrigation line affecting rows 12-16. Visual evidence shows dry soil conditions and plant water stress. Satellite data indicates " +
    `${ndviPct}% NDVI drop in affected area.`;

  return (
    <>
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

      <article className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-orange-500 bg-[#111c18] shadow-xl shadow-black/40">
        <div className="border-b border-white/10 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
              Field Work Order
            </p>
            <span className="text-sm font-bold text-[#4ade80]">
              #{data.workOrderId}
            </span>
          </div>
          <h3 className="mt-2 text-xl font-bold leading-snug text-white">
            Irrigation Repair near Zone {data.zone}
          </h3>
        </div>

        <div className="space-y-5 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className="h-5 w-5 shrink-0 text-orange-400"
                strokeWidth={2.2}
              />
              <span className="text-sm font-bold uppercase tracking-wide text-orange-400">
                High Priority
              </span>
            </div>
            <p className="text-right text-xs text-white/50">
              Estimated water loss: {data.waterRateGph} gal/hour
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
              <MapPin className="h-4 w-4 text-[#4ade80]" />
              Location
            </div>
            <p className="mt-1 text-base font-bold text-white">
              Zone {data.zone}, Rows {data.rows}
            </p>
            <p className="mt-1 text-xs text-white/50">{GPS_LINE}</p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
              <AlertTriangle className="h-4 w-4 text-orange-400/90" />
              Issue Description
            </div>
            <p className="mt-1 text-base font-bold text-white">
              Drip Line Blockage
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              {issueBody}
            </p>
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
              {RECOMMENDED_ACTIONS.map((line) => (
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
                  May 9, 2026
                  <br />
                  10:42 AM
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
        Generated by TerraScout AI • Powered by VLM/VLA • Sentinel-2 • CIMIS •
        OpenET
      </p>
    </>
  );
}
