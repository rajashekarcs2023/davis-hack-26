import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  CirclePlay,
  Loader2,
  Navigation,
} from "lucide-react";

type GroundTruthVerificationScreenProps = {
  zoneLabel: string;
  onBack: () => void;
  /** Called when user taps Generate Work Order — optional navigation hook. */
  onGenerateWorkOrder?: () => void;
};

/** Simulated VLA log latency — swap for real fetch later. */
const SIMULATED_VLA_MS = 2800;

const VLA_LINES_TEMPLATE = (zoneSlug: string) =>
  [
    `initialize_navigation(${zoneSlug})`,
    "rotate_left(0.3)",
    "drive_forward(0.6)",
    "obstacle_detect()",
    "drive_forward(0.4)",
    "shoulder_down(0.4)",
    "visually_verify()",
    "analyze_frame()",
    "verification_complete()",
  ] as const;

export function GroundTruthVerificationScreen({
  zoneLabel,
  onBack,
  onGenerateWorkOrder,
}: GroundTruthVerificationScreenProps) {
  const [vlaReady, setVlaReady] = useState(false);

  const zoneSlug = useMemo(
    () => `zone_${zoneLabel.replace(/\s+/g, "").toLowerCase()}`,
    [zoneLabel]
  );

  useEffect(() => {
    setVlaReady(false);
    const t = window.setTimeout(() => setVlaReady(true), SIMULATED_VLA_MS);
    return () => window.clearTimeout(t);
  }, [zoneLabel]);

  const vlaLines = VLA_LINES_TEMPLATE(zoneSlug);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/85 transition hover:bg-white/10"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight text-white">
            Ground-Truth Verification
          </h2>
          <p className="mt-0.5 text-xs text-emerald-200/55">
            Robotic Scout · Zone {zoneLabel}
          </p>
        </div>
        <div
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums shadow-md shadow-emerald-950/30 ${
            vlaReady
              ? "bg-[#4ade80] text-[#0a1210]"
              : "bg-white/10 text-emerald-200/70 ring-1 ring-white/15"
          }`}
        >
          {vlaReady ? "100%" : "—"}
        </div>
      </div>

      {/* 1. Verification status */}
      <section className="overflow-hidden rounded-2xl border border-emerald-500/35 border-l-4 border-l-[#4ade80] bg-[#0d1512] p-4 shadow-inner shadow-black/40">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              vlaReady ? "bg-[#4ade80]" : "animate-pulse bg-amber-400"
            }`}
          />
          <p className="text-sm font-bold text-white">
            {vlaReady ? "Verification complete!" : "Verification in progress…"}
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
          {vlaReady ? (
            <div className="h-full w-full rounded-full bg-[#4ade80]" />
          ) : (
            <div className="ground-truth-progress-indeterminate h-full w-1/3 rounded-full bg-[#4ade80]/90" />
          )}
        </div>
      </section>

      {/* 2. Live robot feed */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1512] shadow-lg shadow-black/40">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[#4ade80]">
              <CirclePlay className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-bold text-white">
              Live Robot Feed
            </span>
          </div>
          <span className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
            Unity DAC RobotSim
          </span>
        </div>

        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#1a3d52]">
          {/* Stylized scene */}
          <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-[#4a90c8] via-[#6eb0d8] to-[#8bc4e0]" />
          <div className="absolute inset-x-0 bottom-0 top-[38%] bg-gradient-to-b from-[#5d4037] via-[#6d4c41] to-[#4e342e]" />
          <div className="absolute bottom-[28%] left-[8%] h-[22%] w-[28%] rounded-[40%] bg-[#2e7d32]/90 blur-[1px]" />
          <div className="absolute bottom-[26%] right-[12%] h-[26%] w-[32%] rounded-[45%] bg-[#1b5e20]/95 blur-[1px]" />
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="absolute bottom-[18%] h-[35%] w-px bg-[#3e2723]/60"
              style={{ left: `${10 + i * 6}%` }}
            />
          ))}

          {/* Telemetry */}
          <div className="absolute left-2 top-2 max-w-[72%] rounded-lg border border-white/10 bg-black/65 px-2 py-1.5 font-mono text-[9px] leading-snug text-white/95 backdrop-blur-sm">
            <div>GPS: 38.5449°N, 121.7405°W</div>
            <div className="mt-0.5 text-white/85">
              Alt: 18m | Speed: 0.2 m/s
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-white/90">
              <Navigation className="h-3 w-3 shrink-0 text-emerald-400" />
              Heading: 187° S
            </div>
          </div>

          {/* Crosshair */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-red-500/85" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-red-500/85" />
            <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-400/90" />
          </div>

          {/* Blockage alert */}
          <div className="absolute bottom-3 left-1/2 w-[88%] max-w-sm -translate-x-1/2">
            <div className="h-px w-full bg-red-500/70" />
            <div className="mt-1 rounded-lg border border-red-500/40 bg-red-950/55 px-3 py-2 text-center text-xs font-semibold text-white backdrop-blur-sm">
              Blockage Detected
            </div>
          </div>
        </div>
      </section>

      {/* 3. VLA action log */}
      <section className="rounded-2xl border border-white/10 bg-[#0a1210] p-4">
        <h3 className="text-sm font-bold text-white">VLA Action Log</h3>
        <div className="mt-3 rounded-xl border border-emerald-900/40 bg-black/40 px-3 py-3 font-mono text-[11px] leading-relaxed">
          {vlaReady ? (
            <ul className="space-y-1 text-[#4ade80]">
              {vlaLines.map((line) => (
                <li key={line}>
                  <span className="select-none text-emerald-600">&gt;</span>{" "}
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 text-emerald-500/80">
              <div className="flex items-center gap-2 text-[11px]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span>Fetching command stream…</span>
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-3 animate-pulse rounded bg-emerald-500/15"
                  style={{ width: `${68 + i * 4}%` }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. VLM verification summary — full detail once log stream completes */}
      {vlaReady ? (
        <section className="overflow-hidden rounded-2xl border border-white/10 border-l-4 border-l-[#4ade80] bg-[#111c18] shadow-xl shadow-black/40">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
              <Check className="h-6 w-6 text-[#4ade80]" strokeWidth={2.8} />
            </span>
            <h3 className="text-lg font-bold leading-tight text-white">
              VLM Verification Complete
            </h3>
          </div>

          <div className="p-4 pt-3">
            <div className="rounded-xl border border-white/10 bg-[#0d1613] p-4 shadow-inner shadow-black/30">
              <div className="flex items-center gap-2.5">
                <Camera className="h-5 w-5 shrink-0 text-[#4ade80]" strokeWidth={2} />
                <span className="font-bold text-white">
                  Visual Evidence Confirmed
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-emerald-100/65">
                Close-up inspection confirms dry soil conditions and localized
                yellowing in affected rows. Visual pattern matches satellite
                anomaly prediction.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Match Confidence
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#4ade80]">
                    High (91%)
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                    Issue Confirmed
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    Drip Line Blockage
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onGenerateWorkOrder?.()}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4ade80] py-3.5 text-[12px] font-bold uppercase tracking-wide text-[#0a1210] shadow-lg shadow-emerald-950/35 transition hover:bg-[#3fcd73]"
              >
                <Check className="h-5 w-5 shrink-0 stroke-[3]" />
                Generate work order
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 border-l-4 border-l-white/20 bg-[#111c18]/80 px-4 py-3.5 opacity-70">
          <p className="text-sm font-medium text-white/50">
            Awaiting VLM verification…
          </p>
        </section>
      )}
    </div>
  );
}
