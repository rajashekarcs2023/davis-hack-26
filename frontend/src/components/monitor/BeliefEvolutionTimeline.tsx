/**
 * BeliefEvolutionTimeline — collapsed-by-default disclosure that shows how
 * the belief distribution changed across every diagnostic snapshot.
 *
 * The header always shows the count of snapshots and the before/after
 * leader delta ("Pest 46% → 82%"). Tapping expands to a compact multi-row
 * matrix: one row per snapshot, each row is a tiny stacked bar + the
 * snapshot's label so the user can see the whole story at a glance.
 *
 * Used on the Robot stage once a few snapshots are accumulated. On stages
 * with just one snapshot (drone only has `initial` + `after_aerial`), the
 * evolution story is too short to justify — use `BeliefStateStrip` alone.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { BeliefSnapshotLabel, BeliefState } from "../../lib/api";

type BeliefEvolutionTimelineProps = {
  evolution: BeliefState[] | null | undefined;
  /** Default expanded state (mostly for demo / story mode). */
  defaultOpen?: boolean;
};

type Cause = "pest_hotspot" | "water_stress" | "nutrient_deficit" | "false_alarm";

const CAUSE_ORDER: Cause[] = [
  "pest_hotspot",
  "water_stress",
  "nutrient_deficit",
  "false_alarm",
];

const CAUSE_HEX: Record<Cause, string> = {
  pest_hotspot: "#f97316",
  water_stress: "#38bdf8",
  nutrient_deficit: "#facc15",
  false_alarm: "#94a3b8",
};

const CAUSE_SHORT: Record<Cause, string> = {
  pest_hotspot: "Pest",
  water_stress: "Water",
  nutrient_deficit: "Nutrient",
  false_alarm: "False",
};

const SNAPSHOT_LABEL: Record<BeliefSnapshotLabel, string> = {
  initial: "Initial priors",
  after_aerial: "After aerial scan",
  after_leaf: "After leaf inspect",
  after_compare: "After compare healthy",
  after_probe: "After soil probe",
  final: "Final diagnosis",
};

export function BeliefEvolutionTimeline({
  evolution,
  defaultOpen = false,
}: BeliefEvolutionTimelineProps) {
  const [open, setOpen] = useState(defaultOpen);
  const list = evolution ?? [];

  // Need at least 2 snapshots to tell an evolution story.
  if (list.length < 2) return null;

  const first = list[0];
  const last = list[list.length - 1];
  // Leader of the final snapshot drives the header story.
  const finalLeader = CAUSE_ORDER.reduce<Cause>(
    (best, c) => (last[c] > last[best] ? c : best),
    "pest_hotspot",
  );
  const firstPct = Math.round(first[finalLeader] * 100);
  const lastPct = Math.round(last[finalLeader] * 100);

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
            Belief evolution
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-white/75">
            <span className="font-semibold" style={{ color: CAUSE_HEX[finalLeader] }}>
              {CAUSE_SHORT[finalLeader]}
            </span>{" "}
            <span className="tabular-nums">{firstPct}%</span>{" "}
            <span className="text-white/40">→</span>{" "}
            <span className="tabular-nums">{lastPct}%</span>{" "}
            <span className="text-white/45">· {list.length} snapshots</span>
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-white/55" />
        ) : (
          <ChevronDown className="h-4 w-4 text-white/55" />
        )}
      </button>

      {open ? (
        <div className="border-t border-white/8 px-3 py-2.5">
          <ul className="space-y-1.5">
            {list.map((snap, idx) => {
              const leader = CAUSE_ORDER.reduce<Cause>(
                (best, c) => (snap[c] > snap[best] ? c : best),
                "pest_hotspot",
              );
              const leaderPct = Math.round(snap[leader] * 100);
              return (
                <li key={`${snap.snapshot_label}-${idx}`} className="flex items-center gap-2">
                  {/* Label */}
                  <span className="w-[110px] shrink-0 text-[10.5px] text-white/60">
                    {SNAPSHOT_LABEL[snap.snapshot_label] ?? snap.snapshot_label}
                  </span>
                  {/* Stacked bar */}
                  <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
                    {CAUSE_ORDER.map((c) => {
                      const pct = snap[c] * 100;
                      if (pct < 0.5) return null;
                      return (
                        <div
                          key={c}
                          className="h-full"
                          style={{ width: `${pct}%`, backgroundColor: CAUSE_HEX[c] }}
                        />
                      );
                    })}
                  </div>
                  {/* Leader % */}
                  <span
                    className="w-[58px] shrink-0 text-right text-[10.5px] font-semibold tabular-nums"
                    style={{ color: CAUSE_HEX[leader] }}
                  >
                    {CAUSE_SHORT[leader]} {leaderPct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
