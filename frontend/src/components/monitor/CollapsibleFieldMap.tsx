/**
 * CollapsibleFieldMap — wraps the existing AnomalyDashboard 4-zone map in a
 * collapsed-by-default disclosure so it doesn't dominate the Monitor screen.
 *
 * The dashboard is decorative on the demo (zones don't change in real time,
 * the active zone is always B) but visually grounding — it reassures the
 * farmer that the system "sees" the field. Hiding it by default and showing
 * a "Show field map" button reclaims ~280px of viewport without losing the
 * affordance.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Map } from "lucide-react";
import { AnomalyDashboard } from "../../pages/monitor/components/AnomalyDashboard";

type CollapsibleFieldMapProps = {
  /** Forwarded to the AnomalyDashboard for display (e.g. "B3"). */
  activeZoneLabel: string;
  /**
   * Visual id ("A" | "B" | "C" | "D") of the currently selected zone.
   * Used to emerald-glow the matching tile in the map. Defaults to
   * "B" for back-compat with screens that don't track multi-zone state.
   */
  selectedVisualId?: "A" | "B" | "C" | "D";
  /** Defaults to false — start collapsed. */
  defaultOpen?: boolean;
  /**
   * Optional callback fired when the user taps ANY zone tile (A/B/C/D).
   * MonitorPage uses this to (a) update the selected zone and (b) start
   * a scan when the user taps the already-selected tile a second time.
   * The visual id (not the backend zone id) is passed so the parent can
   * resolve to its zone catalog.
   */
  onZoneTap?: (visualZoneId: "A" | "B" | "C" | "D") => void;
  /** Override the badge CTA copy (e.g. "Scan in progress" while a run is live). */
  zoneCtaLabel?: string;
  /**
   * Whether tapping the *selected* zone fires a scan right now. When
   * false, the selected tile visibly disables its scan affordance
   * (dimmed CTA, cursor-not-allowed) while still letting the user
   * switch to a different zone. MonitorPage flips this off while a run
   * is mid-flight. Defaults to true.
   */
  zoneTapEnabled?: boolean;
};

export function CollapsibleFieldMap({
  activeZoneLabel,
  selectedVisualId = "B",
  defaultOpen = false,
  onZoneTap,
  zoneCtaLabel,
  zoneTapEnabled,
}: CollapsibleFieldMapProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Hint copy on the disclosure header tells the user what tapping the
  // map will get them: just expanding it (no callback) vs. scanning a
  // zone (callback wired). This keeps "what does B3 do" answerable
  // without expanding the map first.
  const headerHint = open
    ? "tap to hide"
    : onZoneTap
      ? "tap to expand · then tap zone to scan"
      : "tap to expand";

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1614]/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/12 text-emerald-300/85 ring-1 ring-emerald-500/20">
            <Map className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
          <div className="leading-tight">
            <p className="text-[12px] font-bold text-white">Field map</p>
            <p className="text-[10.5px] text-white/45">
              Zone {activeZoneLabel} highlighted · {headerHint}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-white/55" />
        ) : (
          <ChevronDown className="h-4 w-4 text-white/55" />
        )}
      </button>

      {open ? (
        <div className="border-t border-white/8">
          <AnomalyDashboard
            activeZoneLabel={activeZoneLabel}
            selectedVisualId={selectedVisualId}
            onZoneTap={onZoneTap}
            zoneCtaLabel={zoneCtaLabel}
            zoneTapEnabled={zoneTapEnabled}
          />
        </div>
      ) : null}
    </section>
  );
}
