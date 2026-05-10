import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BarChart3, ShieldCheck, Target, Zap } from "lucide-react";
import { AppHeader } from "./AppHeader";

const WEEK = [
  { day: "Mon", issues: 2, width: 60 },
  { day: "Tue", issues: 1, width: 30 },
  { day: "Wed", issues: 3, width: 100 },
  { day: "Thu", issues: 0, width: 0 },
  { day: "Fri", issues: 2, width: 60 },
  { day: "Sat", issues: 1, width: 30 },
  { day: "Sun", issues: 1, width: 30 },
] as const;

const TOTAL = WEEK.reduce((s, d) => s + d.issues, 0);

function StatRow({
  icon: Icon,
  title,
  value,
  body,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  body: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-terrascout-card p-4">
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-emerald-200/55">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/65">{body}</p>
    </div>
  );
}

export function AnalyticsScreen() {
  return (
    <div className="space-y-5">
      <AppHeader
        pageTitle="Analytics"
        pageSubtitle="System performance & insights"
        pageRightIcon={<BarChart3 className="h-5 w-5" />}
      />

      <section className="space-y-3">
        <StatRow
          icon={Target}
          title="Detection accuracy"
          value="91%"
          body="Out of 100 field scans, TerraScout correctly identifies problems 91 times — trust the alerts you see."
        />
        <StatRow
          icon={ShieldCheck}
          title="False alarms"
          value="Only 3%"
          body="Very rarely sends you on unnecessary trips. Out of 100 alerts, only 3 are false alarms."
        />
        <StatRow
          icon={Zap}
          title="Response time"
          value="2 hours"
          body={
            <>
              Average time from satellite scan to alert on your phone. Catches
              problems <span className="font-semibold text-white">early</span>{" "}
              before they get worse.
            </>
          }
        />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-white">This week&apos;s activity</h3>
        <div className="rounded-2xl border border-white/10 bg-terrascout-card p-4">
          <div className="space-y-4">
            {WEEK.map((row) => (
              <div key={row.day}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-white">{row.day}</span>
                  <span className="text-xs text-emerald-200/50">
                    {row.issues} issue{row.issues === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
                  <div
                    className="h-full rounded-full bg-[#5f9e71] transition-all"
                    style={{ width: `${row.width}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-white/10 pt-4 text-sm text-white/75">
            Total issues detected this week:{" "}
            <span className="font-bold text-white">{TOTAL}</span>
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-terrascout-card p-4">
        <h3 className="text-sm font-bold text-white">What this means for you</h3>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-white/75">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <span className="font-semibold text-white">Saves time:</span>{" "}
              TerraScout tells you exactly where to look instead of walking the
              whole farm daily.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <span className="font-semibold text-white">Saves money:</span>{" "}
              Catching irrigation problems hours after they start vs. days saves
              water costs.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <span className="font-semibold text-white">Saves crops:</span>{" "}
              Early detection reduces plant stress and supports better yields.
            </span>
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-white/10 bg-terrascout-card p-4">
        <h3 className="text-sm font-bold text-white">System information</h3>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-emerald-100/45">
          <li>Powered by AI vision technology</li>
          <li>Satellite: Sentinel-2 (10m resolution)</li>
          <li>Update frequency: Every 2–5 days</li>
          <li>Last system check: May 9, 2026</li>
        </ul>
      </section>

      <div className="h-2" aria-hidden />
    </div>
  );
}
