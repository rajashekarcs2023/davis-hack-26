/**
 * "Why drone now?" panel — surfaces the multi-input risk reasoning that
 * justifies dispatching the drone. Lives on the Map screen above the
 * AnomalyCard.
 *
 * Story: AgriScout does NOT fly the drone blindly on a satellite anomaly.
 * It blends four inputs (satellite, weather, soil moisture, history) into
 * a combined score and an explicit decision (IGNORE / MONITOR / SEND_DRONE).
 * Showing this on the farmer's phone makes the agent's resource allocation
 * visible and trustworthy.
 *
 * Data: GET /api/risk/{zone_id} (see backend/app/api/routes_risk.py).
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CloudDrizzle,
  Droplets,
  History,
  Loader2,
  PlaneTakeoff,
  Satellite,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getRisk, type RiskAssessment, type RiskDecision } from "../lib/api";

type WhyDroneNowPanelProps = {
  zoneId: string;
};

/** Decision pill styling. The same color cues recur on the AerialScanScreen
 *  (Phase 2) so the visual link between "decision was SEND_DRONE" and "drone
 *  is now flying" is preserved. */
const DECISION_STYLE: Record<
  RiskDecision,
  { label: string; bg: string; ring: string; text: string }
> = {
  IGNORE: { label: "Ignore", bg: "bg-white/10", ring: "ring-white/20", text: "text-white/70" },
  MONITOR: { label: "Monitor", bg: "bg-amber-500/15", ring: "ring-amber-500/30", text: "text-amber-300" },
  SEND_DRONE: { label: "Send drone", bg: "bg-emerald-500/20", ring: "ring-emerald-500/40", text: "text-[#4ade80]" },
  SEND_GROUND_ROBOT: { label: "Send robot", bg: "bg-emerald-500/20", ring: "ring-emerald-500/40", text: "text-[#4ade80]" },
  CREATE_WORK_ORDER: { label: "Work order", bg: "bg-orange-500/15", ring: "ring-orange-500/30", text: "text-orange-300" },
};

export function WhyDroneNowPanel({ zoneId }: WhyDroneNowPanelProps) {
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
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
  }, [zoneId]);

  if (error) {
    return (
      <section className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-red-200">Risk signal unavailable</p>
            <p className="mt-1 text-xs leading-snug text-red-200/70">{error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!risk) {
    return (
      <section className="rounded-2xl border border-white/10 bg-[#0d1512] p-4">
        <div className="flex items-center gap-2 text-sm text-white/55">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
          Loading risk signal for Zone {zoneId}…
        </div>
      </section>
    );
  }

  const decisionStyle = DECISION_STYLE[risk.decision] ?? DECISION_STYLE.MONITOR;
  const combinedPct = Math.round(risk.combined_risk_score * 100);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-emerald-500/55 bg-[#0d1512] shadow-inner shadow-black/40">
      {/* Header with combined score + decision pill */}
      <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
            <PlaneTakeoff className="h-3.5 w-3.5" strokeWidth={2.2} /> Why drone now?
          </p>
          <p className="mt-1 text-base font-bold leading-tight text-white">
            Combined risk{" "}
            <span className="text-[#4ade80] tabular-nums">{combinedPct}%</span>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${decisionStyle.bg} ${decisionStyle.ring} ${decisionStyle.text}`}
        >
          {decisionStyle.label}
        </span>
      </header>

      {/* 4-input breakdown */}
      <div className="space-y-2.5 px-4 py-3.5">
        <RiskInputRow
          icon={Satellite}
          label="Satellite anomaly"
          score={risk.satellite_anomaly_score}
          subtitle="localized canopy stress detected"
        />
        <RiskInputRow
          icon={CloudDrizzle}
          label="Weather pest risk"
          score={risk.weather_pest_risk}
          subtitle="degree-day index (warm + dry)"
        />
        <RiskInputRow
          icon={Droplets}
          label="Soil moisture"
          score={null}
          textValue={risk.soil_moisture}
          subtitle={
            risk.soil_moisture === "normal"
              ? "rules out water stress"
              : risk.soil_moisture === "low"
                ? "consistent with water stress"
                : "saturated; consider drainage"
          }
        />
        <RiskInputRow
          icon={History}
          label="Historical hotspot"
          score={risk.historical_hotspot_risk}
          subtitle="prior outbreak pressure on this block"
        />
      </div>

      {/* Reason sentence — the agent's plain-English summary */}
      <p className="border-t border-white/10 bg-black/30 px-4 py-3 text-xs leading-relaxed text-white/70">
        {risk.reason}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

type RiskInputRowProps = {
  icon: LucideIcon;
  label: string;
  /** When provided, renders a 0..1 score as a horizontal meter. */
  score: number | null;
  /** When provided (and score is null), renders this string in place of the meter. */
  textValue?: string;
  subtitle: string;
};

function RiskInputRow({
  icon: Icon,
  label,
  score,
  textValue,
  subtitle,
}: RiskInputRowProps) {
  const pct = score !== null ? Math.round(score * 100) : null;
  // Color the meter on a stoplight gradient. Below 30 = white (low signal),
  // 30-65 = amber (moderate), 65+ = emerald (strong). Matches the same
  // color cues used elsewhere in the app for "this matters".
  const meterColor =
    score === null
      ? "bg-white/30"
      : score >= 0.65
        ? "bg-[#4ade80]"
        : score >= 0.3
          ? "bg-amber-400"
          : "bg-white/35";

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/12 text-emerald-300/85 ring-1 ring-emerald-500/20">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white">{label}</span>
          {pct !== null ? (
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/85">
              {pct}%
            </span>
          ) : textValue ? (
            <span className="shrink-0 rounded-md bg-white/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/85 ring-1 ring-white/10">
              {textValue}
            </span>
          ) : null}
        </div>
        {pct !== null ? (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${meterColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        <p className="mt-1 text-[11px] leading-snug text-white/45">{subtitle}</p>
      </div>
    </div>
  );
}
