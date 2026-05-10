import { Sprout } from "lucide-react";

type AppHeaderProps = {
  /** When set, shows a second row with back + page title (Orders / Analytics). */
  pageTitle?: string;
  pageSubtitle?: string;
  pageRightIcon?: React.ReactNode;
  /**
   * Compact mode: single tight row, drops the "Drone-guided field
   * diagnostics" tagline and the city/date chip (the latter moves into the
   * WeatherBar so the top of the page is one row of pills, not three).
   * Use this on screens where the timeline / decision strip already
   * provides plenty of context.
   */
  compact?: boolean;
};

export function AppHeader({
  pageTitle,
  pageSubtitle,
  pageRightIcon,
  compact = false,
}: AppHeaderProps) {
  return (
    <header className={compact ? "" : "space-y-4"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`flex shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 ring-1 ring-emerald-500/40 ${
              compact ? "h-9 w-9" : "h-11 w-11"
            }`}
          >
            <Sprout
              className={compact ? "h-5 w-5 text-emerald-400" : "h-6 w-6 text-emerald-400"}
              strokeWidth={2}
            />
          </div>
          <div className="min-w-0">
            <h1
              className={`truncate font-bold tracking-tight text-white ${
                compact ? "text-[15px] leading-tight" : "text-base"
              }`}
            >
              AgriScout AI
            </h1>
            {compact ? (
              <p className="text-[10.5px] leading-tight text-emerald-200/55">
                Field diagnostics
              </p>
            ) : (
              <p className="text-xs text-emerald-200/60">
                Drone-guided field diagnostics
              </p>
            )}
          </div>
        </div>
        {compact ? null : (
          <div className="shrink-0 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-right text-[11px] leading-tight">
            <div className="font-medium text-white/50">Davis, CA</div>
            <div className="font-semibold text-white">May 9, 2026</div>
          </div>
        )}
      </div>

      {pageTitle ? (
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80"
            aria-label="Back"
          >
            <span className="text-lg leading-none">‹</span>
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-white">
              {pageTitle}
            </h2>
            {pageSubtitle ? (
              <p className="mt-0.5 text-xs text-emerald-200/55">{pageSubtitle}</p>
            ) : null}
          </div>
          {pageRightIcon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              {pageRightIcon}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
