import { ChevronDown, MapPin } from "lucide-react";

const ZONES = [
  { id: "A", label: "Zone A", rows: 6, highlight: false },
  { id: "B", label: "Zone B", rows: 6, highlight: true },
  { id: "C", label: "Zone C", rows: 6, highlight: false },
  { id: "D", label: "Zone D", rows: 6, highlight: false },
] as const;

type AnomalyDashboardProps = {
  /** e.g. "B3" — shown as "B3 - High Stress" on the map. */
  activeZoneLabel: string;
};

export function AnomalyDashboard({ activeZoneLabel }: AnomalyDashboardProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1210] shadow-inner shadow-black/60">
      <div className="relative aspect-[4/3] w-full">
        <div className="absolute left-3 top-3 z-10 flex gap-2">
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-white/15 bg-black/70 px-2.5 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-sm"
          >
            Stats
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </div>
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/70 px-2.5 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade80] opacity-35" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ade80]" />
            </span>
            Legend
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </div>

        <div className="absolute inset-0 flex gap-2 p-3 pt-12">
          {ZONES.map((z) => (
            <div
              key={z.id}
              className={`relative flex min-w-0 flex-1 flex-col rounded-xl border ${
                z.highlight
                  ? "border-orange-500/55 bg-[#0f2418]/90"
                  : "border-emerald-800/40 bg-[#0c1a14]/90"
              }`}
            >
              <div className="border-b border-white/10 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-100/65">
                {z.label}
              </div>
              <div className="relative flex flex-1 flex-col gap-0.5 p-1.5">
                {Array.from({ length: z.rows }).map((_, i) => (
                  <div
                    key={i}
                    className="h-2 flex-1 rounded-sm bg-emerald-600/20 ring-1 ring-emerald-500/15"
                  />
                ))}
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.2)]" />
                {z.highlight ? (
                  <>
                    <div className="pointer-events-none absolute left-[18%] top-[32%] h-1 w-1 rounded-full bg-sky-400/90" />
                    <div className="pointer-events-none absolute right-[22%] top-[58%] h-1 w-1 rounded-full bg-sky-400/90" />
                  </>
                ) : null}
              </div>

              {z.highlight ? (
                <div className="pointer-events-none absolute inset-x-1 bottom-7 top-auto rounded-md border border-orange-400 bg-orange-500/25 px-1.5 py-1 shadow-lg shadow-orange-950/40">
                  <div className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-orange-50">
                    <MapPin className="h-3 w-3 shrink-0 text-orange-950" />
                    {activeZoneLabel} - High Stress
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
