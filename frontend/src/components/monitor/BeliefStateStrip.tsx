/**
 * BeliefStateStrip — the AgriScout multi-cause probability display.
 *
 * This is the component that proves AgriScout is NOT pest-locked: it shows
 * four competing causes (pest / water / nutrient / false alarm) and their
 * posterior probabilities, plus a label for which snapshot we're looking at
 * (initial, after_aerial, after_leaf, …, final).
 *
 * Data source: `run.diagnostic_bundle.belief_evolution: BeliefState[]`.
 * The backend appends a snapshot at each major diagnostic step, so the
 * strip can either render the latest snapshot (default) or a specific one.
 *
 * Visual model:
 *   - 4 tiny cause chips on top (Pest / Water / Nutrient / False alarm)
 *     each with a number. The leader is highlighted.
 *   - One horizontal stacked bar showing the probabilities visually.
 *   - A snapshot label + (optional) delta since the prior snapshot, so the
 *     user can see "after_leaf" vs "after_probe" shift.
 *
 * Empty state: if belief_evolution is empty (run hasn't reached the first
 * tool call yet), render a muted "awaiting initial belief" strip so the
 * component never jumps in/out of the layout.
 */

import { Bug, Droplet, HelpCircle, Leaf, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BeliefSnapshotLabel, BeliefState } from "../../lib/api";

type BeliefStateStripProps = {
  /** The full belief evolution from run.diagnostic_bundle, if any. */
  evolution: BeliefState[] | null | undefined;
  /**
   * When present, render this specific snapshot label. Defaults to the
   * latest snapshot in the evolution array.
   */
  snapshot?: BeliefSnapshotLabel;
  /** Optional compact mode (used inside denser cards). */
  compact?: boolean;
};

type Cause = "pest_hotspot" | "water_stress" | "nutrient_deficit" | "false_alarm";

const CAUSE_META: Record<
  Cause,
  {
    label: string;
    short: string;
    Icon: LucideIcon;
    /** Tailwind color tokens for the cause's bar segment + chip. */
    bar: string;
    chipBg: string;
    chipRing: string;
    chipText: string;
    /** Hex for the stacked-bar fill (needs literal color since grid-span gradients are painful in Tailwind). */
    hex: string;
  }
> = {
  pest_hotspot: {
    label: "Pest hotspot",
    short: "Pest",
    Icon: Bug,
    bar: "bg-[#f97316]",
    chipBg: "bg-orange-500/15",
    chipRing: "ring-orange-500/35",
    chipText: "text-orange-200",
    hex: "#f97316",
  },
  water_stress: {
    label: "Water stress",
    short: "Water",
    Icon: Droplet,
    bar: "bg-[#38bdf8]",
    chipBg: "bg-sky-500/15",
    chipRing: "ring-sky-500/35",
    chipText: "text-sky-200",
    hex: "#38bdf8",
  },
  nutrient_deficit: {
    label: "Nutrient deficit",
    short: "Nutrient",
    Icon: Leaf,
    bar: "bg-[#facc15]",
    chipBg: "bg-yellow-500/15",
    chipRing: "ring-yellow-500/35",
    chipText: "text-yellow-200",
    hex: "#facc15",
  },
  false_alarm: {
    label: "False alarm",
    short: "False",
    Icon: HelpCircle,
    bar: "bg-[#94a3b8]",
    chipBg: "bg-slate-500/15",
    chipRing: "ring-slate-500/30",
    chipText: "text-slate-200",
    hex: "#94a3b8",
  },
};

const CAUSE_ORDER: Cause[] = [
  "pest_hotspot",
  "water_stress",
  "nutrient_deficit",
  "false_alarm",
];

/** Human-readable label for a snapshot; keep these short. */
const SNAPSHOT_LABEL: Record<BeliefSnapshotLabel, string> = {
  initial: "Initial priors",
  after_aerial: "After aerial scan",
  after_leaf: "After leaf inspection",
  after_compare: "After healthy comparison",
  after_probe: "After soil probe",
  final: "Final diagnosis",
};

export function BeliefStateStrip({
  evolution,
  snapshot,
  compact = false,
}: BeliefStateStripProps) {
  // ---------- Pick the snapshot to render ----------
  const list = evolution ?? [];
  const current = snapshot
    ? (list.find((s) => s.snapshot_label === snapshot) ?? list[list.length - 1] ?? null)
    : (list[list.length - 1] ?? null);

  // ---------- Compute the prior (for delta arrows) ----------
  const priorIndex = current ? list.indexOf(current) - 1 : -1;
  const prior = priorIndex >= 0 ? list[priorIndex] : null;

  // ---------- Empty state ----------
  if (!current) {
    return (
      <section
        className={`overflow-hidden rounded-xl border border-white/10 bg-black/20 ${
          compact ? "px-3 py-2.5" : "p-3.5"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
            Cause belief
          </p>
          <span className="text-[10px] text-white/45">Awaiting evidence…</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div className="h-full w-full animate-pulse bg-white/10" />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-white/45">
          Probabilities update as the drone and ground robot gather evidence.
        </p>
      </section>
    );
  }

  // ---------- Find the leader (highest probability cause) ----------
  const leader = CAUSE_ORDER.reduce<Cause>(
    (best, c) => (current[c] > current[best] ? c : best),
    "pest_hotspot",
  );
  const leaderMeta = CAUSE_META[leader];

  return (
    <section
      className={`overflow-hidden rounded-xl border border-white/10 bg-black/25 ${
        compact ? "px-3 py-2.5" : "p-3.5"
      }`}
      aria-label="Cause belief distribution"
    >
      {/* Header: title + snapshot label */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
            Cause belief
          </p>
          <span className="rounded bg-white/8 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white/65">
            {SNAPSHOT_LABEL[current.snapshot_label]}
          </span>
        </div>
        {/* Leader callout */}
        <div className="flex items-center gap-1 text-[10.5px]">
          <span className="text-white/50">Likely:</span>
          <span className={`font-bold ${leaderMeta.chipText}`}>
            {leaderMeta.short}{" "}
            <span className="tabular-nums">{Math.round(current[leader] * 100)}%</span>
          </span>
        </div>
      </div>

      {/* Stacked horizontal bar (segments for each cause) */}
      <div
        className={`mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10 ${
          compact ? "h-2" : "h-2.5"
        }`}
      >
        {CAUSE_ORDER.map((c) => {
          const pct = Math.max(0, Math.min(100, current[c] * 100));
          if (pct < 0.5) return null;
          return (
            <div
              key={c}
              className="h-full transition-[width] duration-500"
              style={{ width: `${pct}%`, backgroundColor: CAUSE_META[c].hex }}
              aria-label={`${CAUSE_META[c].label}: ${pct.toFixed(0)}%`}
            />
          );
        })}
      </div>

      {/* 4-cell cause chip row */}
      <ul className="mt-2.5 grid grid-cols-4 gap-1.5">
        {CAUSE_ORDER.map((c) => {
          const pct = Math.round(current[c] * 100);
          const priorPct = prior ? Math.round(prior[c] * 100) : null;
          const delta =
            priorPct !== null ? pct - priorPct : null;
          const isLeader = c === leader;
          const meta = CAUSE_META[c];
          return (
            <li
              key={c}
              className={`min-w-0 rounded-lg px-1.5 py-1.5 ring-1 ${
                isLeader
                  ? `${meta.chipBg} ${meta.chipRing}`
                  : "bg-black/25 ring-white/8"
              }`}
            >
              <div className="flex items-center gap-1">
                <meta.Icon
                  className={`h-3 w-3 shrink-0 ${
                    isLeader ? meta.chipText : "text-white/50"
                  }`}
                  strokeWidth={2.2}
                />
                <span
                  className={`truncate text-[9.5px] font-semibold uppercase tracking-wide ${
                    isLeader ? meta.chipText : "text-white/55"
                  }`}
                >
                  {meta.short}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span
                  className={`text-[13px] font-bold leading-none tabular-nums ${
                    isLeader ? "text-white" : "text-white/75"
                  }`}
                >
                  {pct}
                </span>
                <span className="text-[9.5px] text-white/45">%</span>
                {delta !== null && Math.abs(delta) >= 1 ? (
                  <DeltaBadge delta={delta} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`ml-auto inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8.5px] font-bold tabular-nums ${
        up ? "bg-emerald-500/15 text-emerald-200" : "bg-white/5 text-white/55"
      }`}
      title={`Changed ${up ? "+" : ""}${delta} pp since prior snapshot`}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2.4} />
      {up ? "+" : ""}
      {delta}
    </span>
  );
}
