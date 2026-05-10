/**
 * RecentRunsList — shows real AgriScout runs in the Orders tab.
 *
 * Fetches the latest runs from the backend (via `listRuns()`) and renders
 * one compact row per run. Each row surfaces:
 *   - run id + zone
 *   - final belief leader + confidence (pulled from diagnostic_bundle)
 *   - outcome badge (work_order_created / rejected / skipped / …)
 *
 * This is the "historical" view that ties the Orders tab to what actually
 * happened on Monitor. Rows with no diagnostic bundle (runs that didn't
 * escalate to the robot, or failed early) show a muted "no diagnostic"
 * placeholder so the list never has empty/weird rows.
 *
 * We fetch once on mount and don't auto-refresh — past runs are immutable
 * enough that the user can swipe away and come back to see fresh data.
 */

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bug,
  Clock,
  Droplet,
  HelpCircle,
  Leaf,
  ListX,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { listRuns, type BeliefState, type RunSummary } from "../../../lib/api";

// ---- Cause meta: local copy so this component stays independent ---------

type Cause = "pest_hotspot" | "water_stress" | "nutrient_deficit" | "false_alarm";

const CAUSE_ORDER: Cause[] = [
  "pest_hotspot",
  "water_stress",
  "nutrient_deficit",
  "false_alarm",
];

const CAUSE_META: Record<
  Cause,
  { short: string; Icon: LucideIcon; hex: string; ring: string; bg: string; text: string }
> = {
  pest_hotspot: {
    short: "Pest",
    Icon: Bug,
    hex: "#f97316",
    ring: "ring-orange-500/35",
    bg: "bg-orange-500/15",
    text: "text-orange-200",
  },
  water_stress: {
    short: "Water",
    Icon: Droplet,
    hex: "#38bdf8",
    ring: "ring-sky-500/35",
    bg: "bg-sky-500/15",
    text: "text-sky-200",
  },
  nutrient_deficit: {
    short: "Nutrient",
    Icon: Leaf,
    hex: "#facc15",
    ring: "ring-yellow-500/35",
    bg: "bg-yellow-500/15",
    text: "text-yellow-200",
  },
  false_alarm: {
    short: "False",
    Icon: HelpCircle,
    hex: "#94a3b8",
    ring: "ring-slate-500/30",
    bg: "bg-slate-500/15",
    text: "text-slate-200",
  },
};

// ---- Helpers -------------------------------------------------------------

function pickLeader(b: BeliefState): Cause {
  return CAUSE_ORDER.reduce<Cause>(
    (best, c) => (b[c] > b[best] ? c : best),
    "pest_hotspot",
  );
}

function finalBelief(run: RunSummary): BeliefState | null {
  const list = run.diagnostic_bundle?.belief_evolution ?? [];
  return list.length > 0 ? list[list.length - 1] : null;
}

/** Short "5 min ago" style timestamp suitable for a dense list row. */
function formatRelativeTime(iso: string): string {
  try {
    const delta = Date.now() - new Date(iso).getTime();
    const mins = Math.max(0, Math.round(delta / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

// ---- Component -----------------------------------------------------------

export function RecentRunsList() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    listRuns(10)
      .then((data) => {
        if (!active) return;
        setRuns(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      active = false;
    };
  }, []);

  // Section header shows count once loaded so users know what they're looking at.
  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-emerald-300/80" strokeWidth={2.2} />
        <h3 className="text-[13px] font-bold text-white">Recent AgriScout runs</h3>
      </div>
      {runs ? (
        <span className="text-[10.5px] text-white/45">
          {runs.length} run{runs.length === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );

  if (error) {
    return (
      <section className="space-y-2">
        {header}
        <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-950/25 px-3 py-2.5 text-[11.5px] text-red-200/80">
          <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.2} />
          Couldn&apos;t load runs: {error.message}
        </div>
      </section>
    );
  }

  if (!runs) {
    return (
      <section className="space-y-2">
        {header}
        <div className="flex h-16 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-[11.5px] text-white/45">
          Loading…
        </div>
      </section>
    );
  }

  if (runs.length === 0) {
    return (
      <section className="space-y-2">
        {header}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11.5px] text-white/55">
          <ListX className="h-3.5 w-3.5" strokeWidth={2.2} />
          No runs yet. Trigger one from the Monitor tab.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      {header}
      <ul className="space-y-1.5">
        {runs.map((run) => (
          <RunRow key={run.run_id} run={run} />
        ))}
      </ul>
    </section>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const belief = finalBelief(run);
  const leader = belief ? pickLeader(belief) : null;
  const leaderMeta = leader ? CAUSE_META[leader] : null;
  const leaderPct = leader && belief ? Math.round(belief[leader] * 100) : null;

  const outcomeBadge = outcomeToBadge(run);

  return (
    <li className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {/* Leader cause icon (or a neutral placeholder if no diagnostic) */}
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ${
            leaderMeta
              ? `${leaderMeta.bg} ${leaderMeta.ring} ${leaderMeta.text}`
              : "bg-white/5 ring-white/10 text-white/45"
          }`}
          aria-hidden
        >
          {leaderMeta ? (
            <leaderMeta.Icon className="h-4 w-4" strokeWidth={2.2} />
          ) : (
            <HelpCircle className="h-4 w-4" strokeWidth={2.2} />
          )}
        </span>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-[12.5px] font-bold text-white">
              Zone {run.zone_id}
            </p>
            <span className="text-[10.5px] text-white/50 tabular-nums">
              {run.run_id.slice(-6)}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10.5px] text-white/45">
              <Clock className="h-2.5 w-2.5" strokeWidth={2.2} />
              {formatRelativeTime(run.started_at)}
            </span>
          </div>

          {/* Leader line: "Likely: Pest 82%" or "No diagnostic — aerial only" */}
          <p className="mt-0.5 truncate text-[11.5px] leading-snug text-white/70">
            {leader && leaderPct !== null ? (
              <>
                Likely:{" "}
                <span
                  className="font-semibold"
                  style={{ color: CAUSE_META[leader].hex }}
                >
                  {CAUSE_META[leader].short}
                </span>{" "}
                <span className="tabular-nums">{leaderPct}%</span>
                {belief ? (
                  <span className="text-white/45">
                    {" · "}
                    {SNAPSHOT_LABEL[belief.snapshot_label]}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-white/45">
                No diagnostic bundle — aerial only or rejected
              </span>
            )}
          </p>

          {/* Thin stacked bar of the final belief (only if we have it). */}
          {belief ? (
            <div className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
              {CAUSE_ORDER.map((c) => {
                const pct = Math.max(0, Math.min(100, belief[c] * 100));
                if (pct < 0.5) return null;
                return (
                  <div
                    key={c}
                    className="h-full"
                    style={{ width: `${pct}%`, backgroundColor: CAUSE_META[c].hex }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Outcome badge */}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ring-1 ${outcomeBadge.className}`}
          title={outcomeBadge.title}
        >
          {outcomeBadge.label}
        </span>
      </div>
    </li>
  );
}

const SNAPSHOT_LABEL: Record<BeliefState["snapshot_label"], string> = {
  initial: "initial priors",
  after_aerial: "after aerial",
  after_leaf: "after leaf",
  after_compare: "after compare",
  after_probe: "after probe",
  final: "final",
};

// ---- Outcome badge -------------------------------------------------------

function outcomeToBadge(run: RunSummary): {
  label: string;
  className: string;
  title: string;
} {
  // Prefer explicit outcome if set (post-run); otherwise fall back to status.
  const outcome = run.outcome;
  if (outcome === "work_order_created") {
    return {
      label: "WO created",
      className: "bg-emerald-500/18 text-emerald-200 ring-emerald-500/30",
      title: "Agent created a field work order",
    };
  }
  if (outcome === "no_action_needed") {
    return {
      label: "No action",
      className: "bg-slate-500/18 text-slate-200 ring-slate-500/25",
      title: "Agent concluded no action was needed",
    };
  }
  if (outcome === "rejected_by_human") {
    return {
      label: "Rejected",
      className: "bg-red-500/18 text-red-200 ring-red-500/30",
      title: "Human rejected the agent's recommendation",
    };
  }
  if (outcome === "sim_failure" || outcome === "llm_failure") {
    return {
      label: "Failed",
      className: "bg-red-500/18 text-red-200 ring-red-500/30",
      title: outcome.replace(/_/g, " "),
    };
  }

  const status = run.status;
  if (status === "completed") {
    return {
      label: "Done",
      className: "bg-emerald-500/18 text-emerald-200 ring-emerald-500/30",
      title: "Run completed",
    };
  }
  if (status === "awaiting_approval") {
    return {
      label: "Awaiting",
      className: "bg-amber-500/18 text-amber-200 ring-amber-500/30",
      title: "Waiting for human approval",
    };
  }
  if (status === "failed" || status === "rejected") {
    return {
      label: status,
      className: "bg-red-500/18 text-red-200 ring-red-500/30",
      title: `Run ${status}`,
    };
  }
  if (status === "executing" || status === "planning" || status === "pending") {
    return {
      label: "Running",
      className: "bg-sky-500/18 text-sky-200 ring-sky-500/30",
      title: `Agent is currently ${status}`,
    };
  }
  return {
    label: status,
    className: "bg-white/8 text-white/65 ring-white/15",
    title: status,
  };
}

