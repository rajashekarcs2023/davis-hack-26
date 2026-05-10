import { Sprout } from "lucide-react";

type AppHeaderProps = {
  /** When set, shows a second row with back + page title (Orders / Analytics). */
  pageTitle?: string;
  pageSubtitle?: string;
  pageRightIcon?: React.ReactNode;
};

export function AppHeader({
  pageTitle,
  pageSubtitle,
  pageRightIcon,
}: AppHeaderProps) {
  return (
    <header className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 ring-1 ring-emerald-500/40">
            <Sprout className="h-6 w-6 text-emerald-400" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-white">
              TerraScout AI
            </h1>
            <p className="text-xs text-emerald-200/60">
              Dark Ops · Field Intelligence
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-right text-[11px] leading-tight">
          <div className="font-medium text-white/50">Davis, CA</div>
          <div className="font-semibold text-white">May 9, 2026</div>
        </div>
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
