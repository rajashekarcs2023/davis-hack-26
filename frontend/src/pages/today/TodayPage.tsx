/**
 * TodayPage — the "feed / morning brief" tab.
 *
 * This is the new entry point for the AgriScout app. The narrative arc
 * judges land on:
 *
 *   1. Farmer wakes up, opens AgriScout
 *   2. Sees a morning brief: 1 active alert, 3 zones healthy
 *   3. Reviews the alert card (Zone B3 - canopy stress)
 *   4. Taps "Review & dispatch" to drill into Monitor
 *   5. Confirms in Monitor → countdown fires → run begins
 *
 * The OLD flow was "open app → countdown auto-fires" with no story.
 * This is far more compelling for a demo and matches the actual product
 * pitch ("the system decides when to escalate; the farmer reviews").
 *
 * Sections, top-to-bottom on a phone:
 *   • AppHeader (compact)
 *   • MorningBrief — 1-line headline summarising today's farm state
 *   • ActiveAlertCard — the AI-flagged alert, primary CTA
 *   • FieldHealthStrip — all 4 zones; tap any to scan (manual or alert)
 *   • RecentActivityFeed — past 48h scans / weather / satellite passes
 *   • WeatherBar — today's conditions feeding the risk engine
 *   • QuickStats — small footer row
 *
 * State pattern: TodayPage is a pure presentation component. The
 * `onScanZone(visualZoneId)` callback bubbles up to App.tsx which
 * (a) sets the selected zone and (b) switches the tab to "monitor".
 */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CloudSun,
  Eye,
  FileText,
  Satellite,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { WeatherBar } from "../monitor/components/WeatherBar";
import {
  ZONES,
  getAlertZone,
  type ZoneInfo,
  type ZoneStatus,
} from "../../data/zones";

type TodayPageProps = {
  /**
   * Tap-to-scan callback. Called with the visual zone id ("A" | "B" |
   * "C" | "D") when the user taps the alert card OR a zone pill in the
   * field health strip. App.tsx wires this to a setter that updates
   * both the selected zone and the active tab.
   */
  onScanZone: (visualZoneId: ZoneInfo["id"]) => void;
};

export function TodayPage({ onScanZone }: TodayPageProps) {
  const alertZone = getAlertZone();
  const healthyCount = ZONES.filter((z) => z.status === "healthy").length;

  return (
    <div className="space-y-3">
      {/* Compact header — single row, no city/date chip (moves into WeatherBar). */}
      <AppHeader compact />
      <WeatherBar withLocation />

      {/* Morning brief: 1-line "what you need to know" hero line. */}
      <MorningBrief
        alertCount={alertZone ? 1 : 0}
        healthyCount={healthyCount}
      />

      {/* Active alert card — the primary CTA. Only renders if there is
          an alert (status === "alert"); demo always has B3 hotspot. */}
      {alertZone ? (
        <ActiveAlertCard
          zone={alertZone}
          onReview={() => onScanZone(alertZone.id)}
        />
      ) : null}

      {/* Field health strip — all 4 zones, tappable. */}
      <FieldHealthStrip onTapZone={onScanZone} />

      {/* Recent activity feed — past 48h. */}
      <RecentActivityFeed />

      {/* Quick stats footer. */}
      <QuickStats />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MorningBrief — 1-line headline
// ---------------------------------------------------------------------------

function MorningBrief({
  alertCount,
  healthyCount,
}: {
  alertCount: number;
  healthyCount: number;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1614]/80 px-4 py-3 shadow-inner shadow-black/40">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
        Good morning · Davis Block
      </p>
      <p className="mt-1 text-[14px] leading-snug text-white/90">
        {alertCount === 0 ? (
          <>All quiet. {healthyCount}/4 zones healthy · last scan 6h ago.</>
        ) : (
          <>
            <span className="font-bold text-amber-200">
              {alertCount} active alert
            </span>
            <span className="text-white/65"> · </span>
            <span className="font-medium">{healthyCount}/4 zones healthy</span>
            <span className="text-white/50"> · overnight scan completed</span>
          </>
        )}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ActiveAlertCard — the orange CTA; tapping it routes to Monitor
// ---------------------------------------------------------------------------

function ActiveAlertCard({
  zone,
  onReview,
}: {
  zone: ZoneInfo;
  onReview: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onReview}
      className="group relative w-full overflow-hidden rounded-2xl border border-orange-500/55 border-l-4 border-l-orange-400 bg-gradient-to-br from-[#1a1410] to-[#0d1512] p-4 text-left shadow-xl shadow-orange-950/40 transition active:scale-[0.985] hover:border-orange-400/70"
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/25 ring-1 ring-orange-400/45">
          <AlertTriangle className="h-5 w-5 text-orange-300" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-orange-500/20 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-orange-200 ring-1 ring-orange-400/40">
              Active Alert
            </span>
            <span className="text-[10px] font-medium text-orange-200/65">
              {zone.label} · {zone.backendZoneId}
            </span>
          </div>
          <h3 className="mt-1.5 text-[15px] font-bold leading-tight text-white">
            {zone.alertHeadline ?? "Canopy stress hotspot"}
          </h3>
          <p className="mt-1.5 text-[12px] leading-snug text-white/65">
            {zone.alertDetail}
          </p>
        </div>
      </div>

      {/* Recommendation pill */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" strokeWidth={2.4} />
        <p className="text-[11px] leading-snug text-emerald-100/85">
          <span className="font-semibold">AgriScout recommends:</span>{" "}
          send drone to confirm WHERE, then ground robot for WHY.
        </p>
      </div>

      {/* CTA row */}
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-orange-500/15 px-3 py-2.5 ring-1 ring-orange-400/30">
        <span className="text-[12px] font-bold text-orange-50">
          Review & dispatch
        </span>
        <ArrowRight
          className="h-4 w-4 text-orange-50 transition group-hover:translate-x-0.5"
          strokeWidth={2.5}
        />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// FieldHealthStrip — 4 zone pills, all tappable
// ---------------------------------------------------------------------------

function FieldHealthStrip({
  onTapZone,
}: {
  onTapZone: (visualZoneId: ZoneInfo["id"]) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1614]/80 p-3 shadow-inner shadow-black/40">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
          Field health · 4 zones
        </p>
        <p className="text-[10px] font-medium text-white/40">
          Tap any zone to scan
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ZONES.map((z) => (
          <ZoneTile
            key={z.id}
            zone={z}
            onClick={() => onTapZone(z.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ZoneTile({
  zone,
  onClick,
}: {
  zone: ZoneInfo;
  onClick: () => void;
}) {
  const visual = STATUS_VISUALS[zone.status];
  const StatusIcon = visual.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-xl border p-2.5 text-left transition active:scale-[0.97] ${visual.tile}`}
      aria-label={`Scan ${zone.label}, status ${zone.status}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-white">{zone.label}</span>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${visual.badge}`}
        >
          <StatusIcon className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
      <p
        className={`truncate text-[10px] font-medium uppercase tracking-wider ${visual.statusText}`}
      >
        {zone.status === "alert"
          ? "Alert"
          : zone.status === "watch"
            ? "Watch"
            : "Healthy"}
      </p>
      <p className="truncate text-[10.5px] leading-snug text-white/55">
        {zone.lastScanLabel ?? `${zone.acres} ac · NDVI ${zone.ndvi.toFixed(2)}`}
      </p>
    </button>
  );
}

const STATUS_VISUALS: Record<
  ZoneStatus,
  {
    tile: string;
    badge: string;
    statusText: string;
    icon: LucideIcon;
  }
> = {
  alert: {
    tile: "border-orange-500/55 bg-orange-500/10 hover:border-orange-400",
    badge: "bg-orange-500/85 text-[#1a0d05] ring-1 ring-orange-200/40",
    statusText: "text-orange-200/85",
    icon: AlertTriangle,
  },
  watch: {
    tile: "border-amber-500/35 bg-amber-500/[0.06] hover:border-amber-400/65",
    badge: "bg-amber-500/70 text-[#181006] ring-1 ring-amber-200/30",
    statusText: "text-amber-200/75",
    icon: Eye,
  },
  healthy: {
    tile: "border-emerald-700/45 bg-[#0c1a14]/85 hover:border-emerald-500/65",
    badge: "bg-emerald-500/85 text-[#06140e] ring-1 ring-emerald-300/40",
    statusText: "text-emerald-300/75",
    icon: CheckCircle2,
  },
};

// ---------------------------------------------------------------------------
// RecentActivityFeed — past 48h "Slack-style" feed
// ---------------------------------------------------------------------------

type ActivityItem = {
  id: string;
  icon: LucideIcon;
  iconClass: string;
  when: string;
  title: string;
  detail?: string;
};

const ACTIVITY: ActivityItem[] = [
  {
    id: "sat-pass-today",
    icon: Satellite,
    iconClass: "bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/35",
    when: "4:32 AM",
    title: "Sentinel-2A pass · Zone B3 anomaly flagged",
    detail: "NDVI 0.42 vs 0.64 baseline · row-aligned pattern · escalated",
  },
  {
    id: "scan-yesterday-A",
    icon: CheckCircle2,
    iconClass: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30",
    when: "12:14 PM yesterday",
    title: "Zone A2 scan completed · pest pressure (78%)",
    detail: "Work order WO-A2-31 created · spinosad spray scheduled",
  },
  {
    id: "weather-update",
    icon: CloudSun,
    iconClass: "bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30",
    when: "6:00 AM",
    title: "Weather brief · high ET, 48h heat advisory",
    detail: "Pest pressure risk +12% · irrigation advisory issued",
  },
  {
    id: "scan-wed-D",
    icon: CheckCircle2,
    iconClass: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30",
    when: "Wed 2:42 PM",
    title: "Zone D1 manual scan · no anomaly",
    detail: "Marked resolved by operator · NDVI stable",
  },
  {
    id: "wo-mon",
    icon: FileText,
    iconClass: "bg-white/10 text-white/65 ring-1 ring-white/15",
    when: "Mon",
    title: "Work order WO-C4-09 closed · drip line replaced",
  },
];

function RecentActivityFeed() {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1614]/80 p-3 shadow-inner shadow-black/40">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
          Recent activity
        </p>
        <p className="text-[10px] font-medium text-white/40">Past 48h</p>
      </div>
      <ul className="space-y-1.5">
        {ACTIVITY.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.id}
              className="flex items-start gap-2.5 rounded-lg bg-black/15 px-2.5 py-2 ring-1 ring-white/[0.04]"
            >
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${item.iconClass}`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[11.5px] font-semibold text-white/90">
                  {item.title}
                </p>
                {item.detail ? (
                  <p className="mt-0.5 text-[10.5px] text-white/55">
                    {item.detail}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 self-start text-[10px] font-medium text-white/40">
                {item.when}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// QuickStats — small footer
// ---------------------------------------------------------------------------

function QuickStats() {
  const stats: { label: string; value: string }[] = [
    { label: "Acres monitored", value: "12.1" },
    { label: "Scans this week", value: "14" },
    { label: "Open work orders", value: "3" },
    { label: "Manager escalations", value: "0" },
  ];
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1614]/80 p-3 shadow-inner shadow-black/40">
      <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
        At a glance
      </p>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-black/25 px-2 py-1.5 text-center ring-1 ring-white/[0.04]"
          >
            <p className="text-[14px] font-bold tabular-nums text-white">
              {s.value}
            </p>
            <p className="mt-0.5 text-[8.5px] font-medium uppercase tracking-wider text-white/45">
              {s.label}
            </p>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[11px] font-medium text-white/65 transition hover:bg-white/[0.06]"
      >
        View weekly summary
        <ChevronRight className="h-3.5 w-3.5 text-white/45" />
      </button>
    </section>
  );
}
