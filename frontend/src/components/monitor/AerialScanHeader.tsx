/**
 * AerialScanHeader — compact "what the drone is doing right now" strip.
 *
 * Sits at the top of the Drone stage card, above the live aerial feed.
 * Translates the agent's run.status / aerial_analysis into a single-line
 * status + fake telemetry (altitude, coverage, scan pass) that makes the
 * drone feel like it's actually doing work rather than a static image.
 *
 * We don't have true drone telemetry (altitude / coverage) from the
 * backend — these are derived demo values that move with the stage state.
 * That's fine: the AgriScout demo story is about the agent's decisions,
 * not about faithful UAV simulation.
 *
 * States:
 *   before aerial_analysis lands → "Scanning Zone X · Pass 1: wide scan"
 *   after aerial_analysis lands  → "Hotspot confirmed · Pass 2 complete"
 *   if ground_truth not needed   → "Aerial alone conclusive"
 */

import { Gauge, PlaneTakeoff, Satellite, SignalHigh } from "lucide-react";
import type { RunSummary } from "../../lib/api";

type AerialScanHeaderProps = {
  zoneLabel: string;
  run: RunSummary | null;
};

export function AerialScanHeader({ zoneLabel, run }: AerialScanHeaderProps) {
  // -------- Derive the scan state from the run --------
  const aerial = run?.aerial_analysis ?? null;
  const confidencePct = aerial ? Math.round(aerial.confidence * 100) : null;

  // If the agent has decided aerial alone is enough (rare path), surface it.
  const aerialConclusive = aerial && !aerial.recommend_ground_truth && aerial.visible;

  // Scan phase drives the primary line + spinner state.
  let phase: "prelaunch" | "scanning" | "confirmed" | "conclusive";
  if (!run || run.status === "pending") phase = "prelaunch";
  else if (!aerial) phase = "scanning";
  else if (aerialConclusive) phase = "conclusive";
  else phase = "confirmed";

  // -------- Demo telemetry --------
  // Altitude: 50m at hover, descending slightly as the scan refines.
  const altitudeM =
    phase === "prelaunch" ? 60 : phase === "scanning" ? 50 : 35;
  // Coverage: percent of the zone the drone has swept with its camera.
  const coveragePct =
    phase === "prelaunch" ? 0 : phase === "scanning" ? 62 : 100;
  // Scan pass: pass 1 is the wide sweep, pass 2 is the hotspot-focused re-scan.
  const pass = phase === "scanning" ? 1 : phase === "prelaunch" ? 0 : 2;

  const statusLabel =
    phase === "prelaunch"
      ? "Launching…"
      : phase === "scanning"
        ? `Pass ${pass}: wide scan`
        : phase === "conclusive"
          ? "Aerial alone conclusive"
          : `Pass ${pass}: hotspot confirmed`;

  // Accent color follows the phase to give a quick visual cue.
  const accent =
    phase === "scanning"
      ? "border-l-sky-400 bg-sky-500/5"
      : phase === "confirmed" || phase === "conclusive"
        ? "border-l-emerald-400 bg-emerald-500/5"
        : "border-l-white/20 bg-black/25";

  return (
    <section
      className={`overflow-hidden rounded-xl border border-white/10 border-l-4 ${accent}`}
      aria-label="Aerial scan telemetry"
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
            phase === "scanning"
              ? "bg-sky-500/15 text-sky-200"
              : phase === "confirmed" || phase === "conclusive"
                ? "bg-emerald-500/15 text-emerald-200"
                : "bg-white/5 text-white/55"
          }`}
          aria-hidden
        >
          {phase === "scanning" ? (
            <Satellite className="h-4 w-4 animate-pulse" strokeWidth={2.2} />
          ) : (
            <PlaneTakeoff className="h-4 w-4" strokeWidth={2.2} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-[12.5px] font-bold leading-tight text-white">
              Aerial scan · Zone {zoneLabel}
            </p>
            <span
              className={`text-[10.5px] font-semibold uppercase tracking-wide ${
                phase === "scanning"
                  ? "text-sky-300/85"
                  : phase === "confirmed" || phase === "conclusive"
                    ? "text-emerald-300/85"
                    : "text-white/45"
              }`}
            >
              {statusLabel}
            </span>
          </div>

          {/* Telemetry row: altitude · coverage · confidence */}
          <div className="mt-1 flex items-center gap-3 text-[10.5px] text-white/55">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Gauge className="h-3 w-3" strokeWidth={2.4} />
              {altitudeM} m AGL
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <SignalHigh className="h-3 w-3" strokeWidth={2.4} />
              {coveragePct}% coverage
            </span>
            {confidencePct !== null ? (
              <span className="tabular-nums">
                VLM conf {confidencePct}%
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Thin progress bar for coverage — animates as the scan fills. */}
      <div className="h-0.5 w-full bg-white/5">
        <div
          className={`h-full transition-[width] duration-700 ${
            phase === "scanning"
              ? "bg-sky-400/75"
              : phase === "confirmed" || phase === "conclusive"
                ? "bg-emerald-400/80"
                : "bg-white/15"
          }`}
          style={{ width: `${coveragePct}%` }}
        />
      </div>
    </section>
  );
}
