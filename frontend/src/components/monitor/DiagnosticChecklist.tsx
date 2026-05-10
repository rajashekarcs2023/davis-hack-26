/**
 * DiagnosticChecklist — the 4-step ground-robot diagnostic progress view.
 *
 * Shows what the robot is doing RIGHT NOW and what it has already found,
 * in plain agronomist language. The AgriScout differentiator: the robot
 * isn't just "inspecting" — it's running a structured differential
 * diagnostic that rules causes in or out one step at a time.
 *
 * The 4 steps are:
 *   1. LEAF        inspect the affected leaf for visual pest markers
 *   2. COMPARE     scan a nearby healthy leaf and diff
 *   3. PROBE       simulated soil-moisture probe reading
 *   4. MARKER      place a physical sticky trap / GPS marker (robot action)
 *
 * Each row starts `pending` (muted), moves to `active` (pulsing emerald,
 * "Inspecting…") when the tool starts firing, then `done` with a one-line
 * evidence summary derived from the backend payload.
 *
 * Data sources:
 *   run.diagnostic_bundle.leaf_affected    -> step 1 state + summary
 *   run.diagnostic_bundle.leaf_healthy     -> step 2 state + summary
 *   run.diagnostic_bundle.soil_probe       -> step 3 state + summary
 *   run.diagnostic_bundle.marker_placed    -> step 4 state (boolean)
 *
 * We also watch run.tool_calls as a leading indicator: if the corresponding
 * tool was called but the bundle hasn't populated yet, we show the row as
 * `active` rather than `pending`. This gives an immediate "robot is working"
 * signal without a 500ms lag between tool call and bundle update.
 */

import {
  Check,
  Leaf,
  Loader2,
  MapPin,
  Microscope,
  Minus,
  TestTube,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  DiagnosticBundle,
  LeafEvidence,
  RunSummary,
  SoilProbeReading,
  ToolCall,
} from "../../lib/api";

type DiagnosticChecklistProps = {
  run: RunSummary | null;
};

type StepState = "pending" | "active" | "done";

type StepRenderProps = {
  /** Short label rendered prominently. */
  label: string;
  /** Sub-line describing what this step does. */
  sublabel: string;
  /** One-line evidence summary once the step is done. */
  evidence: string | null;
  Icon: LucideIcon;
  state: StepState;
};

export function DiagnosticChecklist({ run }: DiagnosticChecklistProps) {
  const bundle: DiagnosticBundle | null = run?.diagnostic_bundle ?? null;
  const toolCalls = run?.tool_calls ?? [];

  const steps: StepRenderProps[] = [
    buildLeafStep(bundle?.leaf_affected ?? null, toolCalls, "inspect_leaves"),
    buildCompareStep(bundle?.leaf_healthy ?? null, toolCalls),
    buildProbeStep(bundle?.soil_probe ?? null, toolCalls),
    buildMarkerStep(bundle?.marker_placed ?? false, toolCalls),
  ];

  const doneCount = steps.filter((s) => s.state === "done").length;
  const totalCount = steps.length;

  return (
    <section
      className="overflow-hidden rounded-xl border border-white/10 bg-[#0d1512] p-3.5 shadow-inner shadow-black/30"
      aria-label="Ground robot diagnostic checklist"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
            Ground diagnostic
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-white/75">
            Differential inspection · rule causes in or out
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums ring-1 ${
            doneCount === totalCount
              ? "bg-emerald-500/18 text-emerald-200 ring-emerald-500/30"
              : "bg-white/6 text-white/65 ring-white/12"
          }`}
        >
          {doneCount}/{totalCount}
        </span>
      </div>

      {/* Step rows */}
      <ol className="mt-3 space-y-1.5">
        {steps.map((step, idx) => (
          <DiagnosticStepRow
            key={step.label}
            index={idx + 1}
            {...step}
          />
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function DiagnosticStepRow({
  index,
  label,
  sublabel,
  evidence,
  Icon,
  state,
}: StepRenderProps & { index: number }) {
  // Visual tokens per state — keeps the component body terse.
  const stateBg =
    state === "done"
      ? "bg-emerald-500/8 ring-emerald-500/25"
      : state === "active"
        ? "bg-amber-500/8 ring-amber-500/25"
        : "bg-black/20 ring-white/8";

  const iconBg =
    state === "done"
      ? "bg-emerald-500/20 text-emerald-200"
      : state === "active"
        ? "bg-amber-500/20 text-amber-200"
        : "bg-white/5 text-white/45";

  return (
    <li className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ring-1 ${stateBg}`}>
      {/* Step icon (changes color with state) */}
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconBg}`}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </span>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9.5px] font-bold tabular-nums text-white/40">
            {index.toString().padStart(2, "0")}
          </span>
          <span
            className={`text-[12.5px] font-semibold leading-tight ${
              state === "pending" ? "text-white/55" : "text-white"
            }`}
          >
            {label}
          </span>
          <StatusDot state={state} />
        </div>
        <p
          className={`mt-0.5 text-[11px] leading-snug ${
            state === "pending" ? "text-white/40" : "text-white/60"
          }`}
        >
          {evidence ?? sublabel}
        </p>
      </div>
    </li>
  );
}

function StatusDot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-emerald-500/18 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-emerald-200">
        <Check className="h-2.5 w-2.5" strokeWidth={2.6} />
        DONE
      </span>
    );
  if (state === "active")
    return (
      <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-amber-500/18 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-amber-200">
        <Loader2 className="h-2.5 w-2.5 animate-spin" strokeWidth={2.6} />
        NOW
      </span>
    );
  return (
    <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-white/5 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-white/40">
      <Minus className="h-2.5 w-2.5" strokeWidth={2.6} />
      PENDING
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step builders — derive StepState + evidence from the bundle
// ---------------------------------------------------------------------------

/** Did the agent call this tool name at any point? Early leading indicator. */
function hasToolCall(toolCalls: ToolCall[], name: string): boolean {
  return toolCalls.some((tc) => (tc.tool ?? tc.name) === name);
}

function buildLeafStep(
  leaf: LeafEvidence | null,
  toolCalls: ToolCall[],
  toolName: string,
): StepRenderProps {
  const sublabel = "Wrist-cam VLM on affected leaf — stippling, webbing, eggs";
  if (leaf) {
    const cues: string[] = [];
    if (leaf.stippling) cues.push("stippling");
    if (leaf.webbing) cues.push("webbing");
    if (leaf.egg_masses) cues.push("egg masses");
    if (leaf.discoloration) cues.push("discoloration");
    const confPct = Math.round(leaf.confidence * 100);
    const evidence =
      cues.length > 0
        ? `Detected: ${cues.join(", ")} · conf ${confPct}%`
        : `No pest cues detected · conf ${confPct}%`;
    return {
      label: "Inspect affected leaf",
      sublabel,
      evidence,
      Icon: Leaf,
      state: "done",
    };
  }
  return {
    label: "Inspect affected leaf",
    sublabel,
    evidence: null,
    Icon: Leaf,
    state: hasToolCall(toolCalls, toolName) ? "active" : "pending",
  };
}

function buildCompareStep(
  healthy: LeafEvidence | null,
  toolCalls: ToolCall[],
): StepRenderProps {
  const sublabel = "Scan nearby healthy leaf — provides differential baseline";
  if (healthy) {
    // If healthy has no cues (as expected), the comparison is useful.
    const cleanBaseline =
      !healthy.stippling &&
      !healthy.webbing &&
      !healthy.egg_masses &&
      !healthy.discoloration;
    const evidence = cleanBaseline
      ? "Healthy leaf is clean — confirms affected leaf is anomalous"
      : "Healthy leaf also shows cues — may be field-wide, not localized";
    return {
      label: "Compare with healthy leaf",
      sublabel,
      evidence,
      Icon: Microscope,
      state: "done",
    };
  }
  return {
    label: "Compare with healthy leaf",
    sublabel,
    evidence: null,
    Icon: Microscope,
    state: hasToolCall(toolCalls, "compare_with_healthy")
      ? "active"
      : "pending",
  };
}

function buildProbeStep(
  probe: SoilProbeReading | null,
  toolCalls: ToolCall[],
): StepRenderProps {
  const sublabel = "Soil-moisture probe — rules water stress in or out";
  if (probe) {
    const evidence = `${probe.moisture_pct}% moisture · ${probe.interpretation} · ${probe.note}`;
    return {
      label: "Probe soil moisture",
      sublabel,
      evidence,
      Icon: TestTube,
      state: "done",
    };
  }
  return {
    label: "Probe soil moisture",
    sublabel,
    evidence: null,
    Icon: TestTube,
    state: hasToolCall(toolCalls, "probe_soil_moisture") ? "active" : "pending",
  };
}

function buildMarkerStep(
  placed: boolean,
  toolCalls: ToolCall[],
): StepRenderProps {
  const sublabel = "Physical marker near hotspot for the human scout";
  if (placed) {
    return {
      label: "Place GPS / trap marker",
      sublabel,
      evidence: "Marker placed — scout can navigate straight to the hotspot",
      Icon: MapPin,
      state: "done",
    };
  }
  return {
    label: "Place GPS / trap marker",
    sublabel,
    evidence: null,
    Icon: MapPin,
    state: hasToolCall(toolCalls, "place_marker") ? "active" : "pending",
  };
}
