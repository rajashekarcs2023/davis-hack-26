import { Bot, Navigation } from "lucide-react";
import type { FieldPlaceholder } from "../../../data/placeholder";

type RobotStatusProps = {
  data: FieldPlaceholder;
};

export function RobotStatus({ data }: RobotStatusProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/50 to-black/40 p-4">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/35">
          <Bot className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-emerald-100/90">
              Ground robot
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/25">
              <span className="h-1.5 w-1.5 animate-status-dot rounded-full bg-emerald-400" />
              En route
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-white/75">
            LeKiwi unit is moving to{" "}
            <span className="font-semibold text-white">Zone {data.zone}</span>{" "}
            in <span className="text-white/90">{data.field}</span> for close-up
            verification.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-200/70">
            <Navigation className="h-3.5 w-3.5" />
            ETA ~6 min · path optimized for row access
          </div>
        </div>
      </div>

      <div className="relative mt-4 h-16 overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-emerald-500/10 to-transparent" />
        <div className="absolute inset-y-2 left-[8%] right-[8%] rounded-full bg-white/5" />
        <div className="animate-robot-path absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500 text-black shadow-lg shadow-emerald-900/50 ring-2 ring-emerald-200/40">
          <Bot className="h-4 w-4" />
        </div>
      </div>
    </section>
  );
}
