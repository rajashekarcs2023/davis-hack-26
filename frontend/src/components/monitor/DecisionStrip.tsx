/**
 * DecisionStrip — compact "Why drone now?" surface for the Satellite stage.
 *
 * Replaces the old WhyDroneNowPanel layout (4 stacked input rows + a long
 * paragraph, ~270px tall) with a single horizontal 4-segment bar (~80px)
 * that expands on tap to show the detailed breakdown.
 *
 * The information density is deliberate. Default state shows the four
 * inputs as colored bar segments + their values + a decision pill, so the
 * farmer can answer "should I trust this dispatch?" in 2 seconds. Tapping
 * "Show reasoning" reveals the full per-input breakdown and the agent's
 * one-paragraph reason.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CloudDrizzle,
  Droplets,
  History,
  Loader2,
  Satellite,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getRisk,
  type RiskAssessment,
  type RiskDecision,
  type SoilMoistureLabel,
} from "../../lib/api";

type DecisionStripProps = {
  zoneId: string;
  /** When provided, skip the fetch and render this directly (for storybook/test). */
  override?: RiskAssessment;
};

const DECISION_STYLE: Record<
  RiskDecision,
  { label: string; bg: string; ring: string; text: string }
> = {
  IGNORE: {
    label: "Ignore",
    bg: "bg-white/10",
    ring: "ring-white/20",
    text: "text-white/70",
  },
  MONITOR: {
    label: "Monitor",
    bg: "bg-amber-500/15",
    ring: "ring-amber-500/30",
    text: "text-amber-300",
  },
  SEND_DRONE: {
    label: "Send drone",
    bg: "bg-emerald-500/22",
    ring: "ring-emerald-500/45",
    text: "text-[#4ade80]",
  },
  SEND_GROUND_ROBOT: {
    label: "Send robot",
    bg: "bg-emerald-500/22",
    ring: "ring-emerald-500/45",
    text: "text-[#4ade80]",
  },
  CREATE_WORK_ORDER: {
    label: "Work order",
    bg: "bg-orange-500/15",
    ring: "ring-orange-500/30",
    text: "text-orange-300",
  },
};

export function DecisionStrip({ zoneId, override }: DecisionStripProps) {
  const [risk, setRisk] = useState<RiskAssessment | null>(override ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (override) {
      setRisk(override);
      return;
    }
    let cancelled = false;
    setRisk(null);
    setError(null);
    getRisk(zoneId)
      .then((r) => {
        if (!cancelled) setRisk(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, override]);

  if (error) {
    return (
      <section
        className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2.5"
        aria-live="polite"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-red-200">
            Risk signal unavailable
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-red-200/70">
            {error.message}
          </p>
        </div>
      </section>
    );
  }

  if (!risk) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d1512] px-3 py-2.5 text-[12px] text-white/50">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />
        Loading risk signal for Zone {zoneId}…
      </section>
    );
  }

  const decisionStyle = DECISION_STYLE[risk.decision] ?? DECISION_STYLE.MONITOR;
  const combinedPct = Math.round(risk.combined_risk_score * 100);

  return (
    <section
      className="overflow-hidden rounded-xl border border-white/10 bg-[#0d1512]"
      aria-label="Decision reasoning"
    >
      {/* HEADER: combined score + decision pill, single row */}
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
            Combined risk
          </p>
          <p className="text-[15px] font-bold text-white tabular-nums">
            {combinedPct}%
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${decisionStyle.bg} ${decisionStyle.ring} ${decisionStyle.text}`}
        >
          {decisionStyle.label}
        </span>
      </header>

      {/* COMPACT 4-SEGMENT BAR: each segment is one input. Width is roughly
          equal across segments; the FILL inside each segment encodes that
          input's score. This gives a 4-up "are these all flashing red?"
          glance without forcing a tall stack. */}
      <div className="grid grid-cols-4 gap-1.5 px-3 pb-2">
        <CompactSegment
          icon={Satellite}
          score={risk.satellite_anomaly_score}
          label="Satellite"
        />
        <CompactSegment
          icon={CloudDrizzle}
          score={risk.weather_pest_risk}
          label="Pest pressure"
        />
        <CompactSegment
          icon={Droplets}
          score={null}
          textValue={risk.soil_moisture}
          label="Soil"
          soilLabel={risk.soil_moisture}
        />
        <CompactSegment
          icon={History}
          score={risk.historical_hotspot_risk}
          label="History"
        />
      </div>

      {/* EXPAND TOGGLE — keeps the bar honest. Default closed = 80px;
          opening reveals the 4 detailed rows + the agent's reason
          paragraph (which together total another ~200px). */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-white/8 bg-black/25 py-1.5 text-[11px] font-medium text-white/55 transition hover:text-white/85"
        aria-expanded={expanded}
      >
        {expanded ? (
          <>
            Hide reasoning <ChevronUp className="h-3 w-3" />
          </>
        ) : (
          <>
            Show reasoning <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>

      {expanded ? (
        <div className="space-y-2.5 border-t border-white/8 px-3 py-3">
          <DetailRow
            icon={Satellite}
            label="Satellite anomaly"
            score={risk.satellite_anomaly_score}
            subtitle="localized canopy stress detected"
          />
          <DetailRow
            icon={CloudDrizzle}
            label="Pest pressure"
            score={risk.weather_pest_risk}
            subtitle="warm/dry conditions favor pest activity"
          />
          <DetailRow
            icon={Droplets}
            label="Soil moisture"
            score={null}
            textValue={risk.soil_moisture}
            subtitle={soilSubtitle(risk.soil_moisture)}
          />
          <DetailRow
            icon={History}
            label="Historical hotspot"
            score={risk.historical_hotspot_risk}
            subtitle="prior outbreak pressure on this block"
          />
          <p className="rounded-lg bg-black/30 px-3 py-2.5 text-[11.5px] leading-relaxed text-white/70 ring-1 ring-white/5">
            {risk.reason}
          </p>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

type CompactSegmentProps = {
  icon: LucideIcon;
  /** 0..1 score, or null if textValue is provided (for soil moisture). */
  score: number | null;
  /** Used in place of `score` for non-numeric inputs like soil moisture. */
  textValue?: string;
  label: string;
  /** When score is null and we want soil-moisture-specific styling. */
  soilLabel?: SoilMoistureLabel;
};

function CompactSegment({
  icon: Icon,
  score,
  textValue,
  label,
  soilLabel,
}: CompactSegmentProps) {
  const pct = score !== null ? Math.round(score * 100) : null;
  // Stoplight gradient on numeric scores. Soil moisture has its own scale.
  const meterColor =
    score === null
      ? soilLabel === "low"
        ? "bg-orange-400"
        : soilLabel === "high"
          ? "bg-sky-400"
          : "bg-emerald-400"
      : score >= 0.65
        ? "bg-[#4ade80]"
        : score >= 0.3
          ? "bg-amber-400"
          : "bg-white/35";

  return (
    <div
      className="flex flex-col items-center justify-between gap-1 rounded-lg bg-black/30 px-1 py-1.5 ring-1 ring-white/5"
      title={label}
    >
      <Icon
        className="h-3 w-3 shrink-0 text-emerald-300/70"
        strokeWidth={2}
      />
      {/* The fill bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-black/55">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${meterColor}`}
          style={{
            width:
              score !== null
                ? `${Math.max(8, Math.round(score * 100))}%`
                : "100%",
          }}
        />
      </div>
      <span className="text-[9.5px] font-bold tabular-nums text-white/85">
        {pct !== null ? `${pct}` : (textValue ?? "·").toUpperCase()}
      </span>
      <span className="line-clamp-1 text-[8.5px] font-medium uppercase tracking-wide text-white/45">
        {label}
      </span>
    </div>
  );
}

type DetailRowProps = {
  icon: LucideIcon;
  label: string;
  score: number | null;
  textValue?: string;
  subtitle: string;
};

function DetailRow({
  icon: Icon,
  label,
  score,
  textValue,
  subtitle,
}: DetailRowProps) {
  const pct = score !== null ? Math.round(score * 100) : null;
  const meterColor =
    score === null
      ? "bg-white/30"
      : score >= 0.65
        ? "bg-[#4ade80]"
        : score >= 0.3
          ? "bg-amber-400"
          : "bg-white/35";

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/12 text-emerald-300/85 ring-1 ring-emerald-500/20">
        <Icon className="h-3 w-3" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-semibold text-white">{label}</span>
          {pct !== null ? (
            <span className="shrink-0 text-[10px] font-bold tabular-nums text-white/85">
              {pct}%
            </span>
          ) : textValue ? (
            <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/85 ring-1 ring-white/10">
              {textValue}
            </span>
          ) : null}
        </div>
        {pct !== null ? (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${meterColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        <p className="mt-0.5 text-[10px] leading-snug text-white/45">{subtitle}</p>
      </div>
    </div>
  );
}

function soilSubtitle(label: SoilMoistureLabel): string {
  switch (label) {
    case "normal":
      return "rules out water stress";
    case "low":
      return "consistent with water stress";
    case "high":
      return "saturated; consider drainage";
  }
}
