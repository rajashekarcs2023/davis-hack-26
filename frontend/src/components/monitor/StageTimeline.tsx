/**
 * StageTimeline — the always-visible 4-stage progress strip on the Monitor
 * tab. Replaces the 4-screen wizard with a single-screen view of the
 * agentic pipeline.
 *
 * Layout:
 *   🛰 ─── 🚁 ─── 🤖 ─── 📋
 *   ●━━━━━○━━━━━○━━━━━○
 *   Satellite  Drone  Robot  Report
 *   "Auto-dispatch in 0:28 · ✋"
 *
 * Each circle's visual encodes 3 things at once:
 *   1. State (active / done / pending / skipped / failed / awaiting_approval)
 *   2. Trigger (who did/will do it: 🤖 auto, ✋ human, ⏳ awaiting)
 *   3. Whether the user can tap to switch focus
 *
 * The component is "dumb": it renders whatever StageMachine you pass and
 * fires `onStageTap(stageId)` when the user taps. Logic for which stage is
 * active lives in `lib/stages.ts`.
 */

import {
  Check,
  Hourglass,
  Loader2,
  Minus,
  Satellite,
  PlaneTakeoff,
  Bot,
  ClipboardList,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StageId, StageInfo, StageMachine } from "../../lib/stages";

type StageTimelineProps = {
  stages: StageMachine;
  /** When set, this stage is the focused one and renders bigger / brighter. */
  focusedStage?: StageId;
  /** Called when the user taps a stage circle. */
  onStageTap?: (stageId: StageId) => void;
  /** Optional global status line under the timeline (e.g. countdown text). */
  statusLine?: React.ReactNode;
};

const STAGE_ORDER: StageId[] = ["satellite", "drone", "robot", "report"];

const STAGE_ICON: Record<StageId, LucideIcon> = {
  satellite: Satellite,
  drone: PlaneTakeoff,
  robot: Bot,
  report: ClipboardList,
};

export function StageTimeline({
  stages,
  focusedStage,
  onStageTap,
  statusLine,
}: StageTimelineProps) {
  const focused = focusedStage ?? stages.activeStage;

  // The status line below the timeline is always about the AGENT'S current
  // activity (active stage), not the user's tap-focus. This way the line and
  // its leading icon are coherent: both describe "what's happening right
  // now". The user's tap-focus only affects which dot is highlighted and
  // which detail card renders below — handled by MonitorPage.
  const activityStage = stages[stages.activeStage];

  return (
    <section
      className="rounded-2xl border border-white/10 bg-[#0a1614]/80 px-3 py-3 shadow-inner shadow-black/40"
      aria-label="Pipeline progress"
    >
      <ol className="flex items-start justify-between gap-1">
        {STAGE_ORDER.map((id, idx) => {
          const stage = stages[id];
          const isFocused = id === focused;
          const showConnector = idx < STAGE_ORDER.length - 1;
          const nextStage = showConnector ? stages[STAGE_ORDER[idx + 1]] : null;
          return (
            <StageCell
              key={id}
              stage={stage}
              isFocused={isFocused}
              showConnector={showConnector}
              connectorActive={
                stage.state === "done" &&
                nextStage !== null &&
                nextStage.state !== "pending"
              }
              onTap={onStageTap ? () => onStageTap(id) : undefined}
            />
          );
        })}
      </ol>

      {/* Promoted status line: one source of truth for "what's happening
          now". The leading icon and the text both describe the active
          stage. This replaces the per-cell status text (which truncated
          mid-word) and the duplicate "AgriScout wants ground truth"
          panel that was showing the same info twice. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/35 px-3 py-2 ring-1 ring-white/5">
        <FocusedStateIcon stage={activityStage} />
        <div className="min-w-0 flex-1">
          {statusLine ? (
            <div className="text-[12.5px] font-medium leading-snug text-white/85">
              {statusLine}
            </div>
          ) : (
            <>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/55">
                {activityStage.label}
              </div>
              <div className="truncate text-[12.5px] font-medium leading-snug text-white/85">
                {activityStage.status}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The leading icon for the promoted status line. Encodes both the stage
 * state (active spinner, awaiting hourglass, etc.) and color in one glyph.
 */
function FocusedStateIcon({ stage }: { stage: StageInfo }) {
  switch (stage.state) {
    case "active":
      return (
        <Loader2
          className="h-4 w-4 shrink-0 animate-spin text-emerald-300"
          strokeWidth={2.4}
        />
      );
    case "awaiting_approval":
      return (
        <Hourglass className="h-4 w-4 shrink-0 text-amber-300" strokeWidth={2.2} />
      );
    case "done":
      return (
        <Check className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={2.5} />
      );
    case "failed":
      return (
        <XCircle className="h-4 w-4 shrink-0 text-red-300" strokeWidth={2.2} />
      );
    case "skipped":
      return <Minus className="h-4 w-4 shrink-0 text-white/45" strokeWidth={2.5} />;
    case "pending":
    default:
      return <Minus className="h-4 w-4 shrink-0 text-white/35" strokeWidth={2.2} />;
  }
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

type StageCellProps = {
  stage: StageInfo;
  isFocused: boolean;
  showConnector: boolean;
  connectorActive: boolean;
  onTap?: () => void;
};

function StageCell({
  stage,
  isFocused,
  showConnector,
  connectorActive,
  onTap,
}: StageCellProps) {
  const Icon = STAGE_ICON[stage.id];
  const visual = visualForState(stage);

  // Cell is now just a dot + label. Per-stage status text moved to the
  // promoted status line below the timeline so it has the full row width
  // and never truncates. Trigger badges are also gone here — the focused
  // stage's trigger is shown via the inline icon next to the status line.
  const Wrapper = onTap ? "button" : "div";

  return (
    <li className="flex min-w-0 flex-1 flex-col">
      {/* Dot + connector. Dot is at the LEFT of the cell so the connector
          (flex-1, fills the rest of the cell) lines up with it visually.
          The label below mirrors that left-alignment. */}
      <div className="flex w-full items-center">
        <Wrapper
          {...(onTap ? { type: "button", onClick: onTap } : {})}
          className={`relative z-10 flex shrink-0 items-center justify-center rounded-full transition-all ${
            isFocused ? "h-9 w-9" : "h-7 w-7"
          } ${visual.bg} ${visual.ring} ${visual.text}`}
          aria-current={isFocused ? "step" : undefined}
          aria-label={`${stage.label} stage: ${stage.state.replace(/_/g, " ")}`}
        >
          <Icon
            className={isFocused ? "h-4 w-4" : "h-3.5 w-3.5"}
            strokeWidth={2}
          />
          {visual.statusIcon ? (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0a1210] ring-1 ring-white/15">
              {visual.statusIcon}
            </span>
          ) : null}
          {visual.pulse ? (
            <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-emerald-400/70 animate-ping" />
          ) : null}
        </Wrapper>

        {showConnector ? (
          <div
            className={`ml-1.5 h-[2px] flex-1 rounded-full ${
              connectorActive ? "bg-emerald-500/55" : "bg-white/10"
            }`}
          />
        ) : null}
      </div>

      {/* Label aligned to the dot (left edge of cell). Single line. */}
      <span
        className={`mt-1.5 truncate text-[11px] font-bold ${
          isFocused ? "text-white" : "text-white/55"
        }`}
      >
        {stage.label}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// State -> visual mapping
// ---------------------------------------------------------------------------

type StageVisual = {
  bg: string;
  ring: string;
  text: string;
  statusIcon: React.ReactNode | null;
  pulse: boolean;
};

function visualForState(stage: StageInfo): StageVisual {
  switch (stage.state) {
    case "active":
      return {
        bg: "bg-emerald-500/25",
        ring: "ring-2 ring-emerald-400/65",
        text: "text-emerald-100",
        statusIcon: (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-emerald-300" />
        ),
        pulse: true,
      };
    case "done":
      return {
        bg: "bg-emerald-500/85",
        ring: "ring-1 ring-emerald-300/40",
        text: "text-[#06140e]",
        statusIcon: (
          <Check className="h-2.5 w-2.5 text-emerald-300" strokeWidth={3} />
        ),
        pulse: false,
      };
    case "awaiting_approval":
      return {
        bg: "bg-amber-500/25",
        ring: "ring-2 ring-amber-400/55",
        text: "text-amber-100",
        statusIcon: (
          <Hourglass className="h-2.5 w-2.5 text-amber-300" strokeWidth={2.5} />
        ),
        pulse: true,
      };
    case "skipped":
      return {
        bg: "bg-white/5",
        ring: "ring-1 ring-white/10",
        text: "text-white/35",
        statusIcon: <Minus className="h-2.5 w-2.5 text-white/35" strokeWidth={3} />,
        pulse: false,
      };
    case "failed":
      return {
        bg: "bg-red-500/20",
        ring: "ring-1 ring-red-400/40",
        text: "text-red-200",
        statusIcon: (
          <XCircle className="h-2.5 w-2.5 text-red-300" strokeWidth={2.5} />
        ),
        pulse: false,
      };
    case "pending":
    default:
      return {
        bg: "bg-white/5",
        ring: "ring-1 ring-white/12",
        text: "text-white/45",
        statusIcon: null,
        pulse: false,
      };
  }
}
