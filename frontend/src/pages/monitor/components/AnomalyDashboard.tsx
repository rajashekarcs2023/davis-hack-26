import { ChevronDown, MapPin, Play } from "lucide-react";

type VisualZoneId = "A" | "B" | "C" | "D";

const ZONES: { id: VisualZoneId; label: string; rows: number; alerted: boolean }[] = [
  { id: "A", label: "Zone A", rows: 6, alerted: false },
  { id: "B", label: "Zone B", rows: 6, alerted: true },
  { id: "C", label: "Zone C", rows: 6, alerted: false },
  { id: "D", label: "Zone D", rows: 6, alerted: false },
];

type AnomalyDashboardProps = {
  /** Backend label for the zone the user has currently selected (e.g. "B3"). */
  activeZoneLabel: string;
  /**
   * Visual id of the currently selected zone. Determines which tile
   * gets the emerald-glow selection ring and which one shows the
   * "Tap to scan" CTA. Defaults to "B" for back-compat.
   */
  selectedVisualId?: VisualZoneId;
  /**
   * Tap callback fired for ANY of the 4 zone tiles. The visual id is
   * passed ("A" | "B" | "C" | "D") so the parent can resolve to its
   * own zone catalog. MonitorPage uses this as a dual-purpose action:
   *   - Tapping a *different* zone -> switches selection only.
   *   - Tapping the *selected* zone again -> starts/restarts a scan.
   */
  onZoneTap?: (visualZoneId: VisualZoneId) => void;
  /**
   * Hint text shown on the SELECTED tile's CTA pill. Defaults to
   * "Tap to scan" when onZoneTap is provided. MonitorPage overrides
   * this with state-aware copy like "Scan in progress…" or
   * "Scan complete · Tap to re-scan".
   */
  zoneCtaLabel?: string;
  /**
   * When false, the selected zone's scan CTA is visibly disabled
   * (dimmed, cursor-not-allowed) but the user can still tap a
   * *different* zone to switch focus. Used while a run is mid-flight
   * so the user doesn't try to fire a second concurrent scan.
   */
  zoneTapEnabled?: boolean;
};

export function AnomalyDashboard({
  activeZoneLabel,
  selectedVisualId = "B",
  onZoneTap,
  zoneCtaLabel,
  zoneTapEnabled = true,
}: AnomalyDashboardProps) {
  const ctaText = zoneCtaLabel ?? (onZoneTap ? "Tap to scan" : null);

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
          {ZONES.map((z) => {
            const isSelected = z.id === selectedVisualId;
            const isWired = !!onZoneTap;
            // While a run is mid-flight (zoneTapEnabled === false) we
            // lock the entire field map: no scan from the selected tile
            // AND no zone-switching from any other tile. Otherwise the
            // user could swap selection mid-run and the timeline+stage
            // card would still reflect the original zone, which is
            // confusing. Once the run terminates, all tiles re-enable.
            const tapAllowed = isWired && zoneTapEnabled;
            const canScanFromHere = isSelected && zoneTapEnabled;
            const Wrapper = isWired ? "button" : "div";
            // Border treatment combines selection (emerald glow) with
            // alerted state (orange tint) so the alerted+selected case
            // (B by default) is distinguishable from alerted-but-not-
            // selected (e.g. user navigated to Zone A; B keeps its
            // alert badge but no glow).
            const borderClass = isSelected
              ? z.alerted
                ? "border-orange-400 ring-2 ring-emerald-400/55 bg-[#0f2418]/95 shadow-lg shadow-emerald-950/40"
                : "border-emerald-400/70 ring-2 ring-emerald-400/45 bg-[#0c1a14]/95 shadow-lg shadow-emerald-950/40"
              : z.alerted
                ? "border-orange-500/45 bg-[#0f2418]/75"
                : "border-emerald-800/40 bg-[#0c1a14]/85";
            const hoverClass = isWired
              ? tapAllowed
                ? "cursor-pointer hover:border-emerald-300/85 active:scale-[0.97]"
                : "cursor-not-allowed opacity-80"
              : "";
            return (
              <Wrapper
                key={z.id}
                {...(isWired
                  ? {
                      type: "button" as const,
                      onClick: tapAllowed ? () => onZoneTap(z.id) : undefined,
                      disabled: !tapAllowed,
                      "aria-label": isSelected
                        ? canScanFromHere
                          ? `Start scan for ${z.label}`
                          : `${z.label} — scan unavailable while run is in progress`
                        : tapAllowed
                          ? `Switch to ${z.label}`
                          : `${z.label} — locked while run is in progress`,
                    }
                  : {})}
                className={`relative flex min-w-0 flex-1 flex-col rounded-xl border text-left transition ${borderClass} ${hoverClass}`}
              >
                <div
                  className={`border-b px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide ${
                    isSelected
                      ? "border-emerald-400/30 text-emerald-100"
                      : "border-white/10 text-emerald-100/65"
                  }`}
                >
                  {z.label}
                </div>
                <div className="relative flex flex-1 flex-col gap-0.5 p-1.5">
                  {Array.from({ length: z.rows }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 flex-1 rounded-sm ring-1 ${
                        z.alerted
                          ? "bg-orange-600/15 ring-orange-500/15"
                          : "bg-emerald-600/20 ring-emerald-500/15"
                      }`}
                    />
                  ))}
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.2)]" />
                  {z.alerted ? (
                    <>
                      <div className="pointer-events-none absolute left-[18%] top-[32%] h-1 w-1 rounded-full bg-sky-400/90" />
                      <div className="pointer-events-none absolute right-[22%] top-[58%] h-1 w-1 rounded-full bg-sky-400/90" />
                    </>
                  ) : null}
                </div>

                {/* Bottom badge:
                      - Alerted zone always shows its "High Stress" pill.
                      - The currently SELECTED zone (alerted or not) also
                        shows the "Tap to scan" CTA underneath. */}
                {z.alerted || isSelected ? (
                  <div
                    className={`pointer-events-none absolute inset-x-1 bottom-7 top-auto rounded-md border px-1.5 py-1 shadow-lg ${
                      z.alerted
                        ? canScanFromHere
                          ? "border-orange-300 bg-orange-500/40 ring-1 ring-orange-200/40 shadow-orange-950/40"
                          : "border-orange-400 bg-orange-500/25 shadow-orange-950/40"
                        : canScanFromHere
                          ? "border-emerald-300 bg-emerald-500/30 ring-1 ring-emerald-200/30 shadow-emerald-950/40"
                          : "border-emerald-500/45 bg-emerald-500/15 shadow-emerald-950/40"
                    }`}
                  >
                    {z.alerted ? (
                      <div className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-orange-50">
                        <MapPin className="h-3 w-3 shrink-0 text-orange-950" />
                        {isSelected ? `${activeZoneLabel} - High Stress` : "High Stress"}
                      </div>
                    ) : isSelected ? (
                      <div className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-emerald-50">
                        <MapPin className="h-3 w-3 shrink-0 text-emerald-950" />
                        {activeZoneLabel} - Selected
                      </div>
                    ) : null}
                    {isSelected && ctaText ? (
                      <div
                        className={`mt-0.5 flex items-center justify-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.08em] ${
                          z.alerted ? "text-orange-50/95" : "text-emerald-50/95"
                        }`}
                      >
                        <Play
                          className={`h-2.5 w-2.5 shrink-0 ${
                            z.alerted ? "fill-orange-50/95" : "fill-emerald-50/95"
                          }`}
                          strokeWidth={0}
                        />
                        {ctaText}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Wrapper>
            );
          })}
        </div>
      </div>
    </section>
  );
}
