/**
 * `useRun(runId)` — React hook that polls /api/runs/{run_id} and exposes the
 * current run state. Returns null while loading; surfaces error state.
 *
 * Polling stops automatically when the run reaches a terminal status
 * (`completed | rejected | failed`) so we don't burn requests after the
 * demo finishes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunSummary } from "./api";
import { getDroneFrame, getRobotFrame, getRun } from "./api";

const TERMINAL_STATUSES = new Set(["completed", "rejected", "failed"]);
const DEFAULT_POLL_MS = 750;

export type UseRunResult = {
  run: RunSummary | null;
  error: Error | null;
  /** true if we've never received a response yet. */
  loading: boolean;
  /** true if the run is in a terminal status. */
  done: boolean;
};

export function useRun(runId: string | null, pollMs = DEFAULT_POLL_MS): UseRunResult {
  const [run, setRun] = useState<RunSummary | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(runId !== null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setRun(null);
    setError(null);
    setLoading(runId !== null);

    if (!runId) return;

    let timer: number | null = null;

    async function tick() {
      if (cancelledRef.current) return;
      try {
        // runId is non-null here (guarded above) but TS narrowing doesn't
        // carry through to the async closure, so re-check.
        if (!runId) return;
        const fresh = await getRun(runId);
        if (cancelledRef.current) return;
        setRun(fresh);
        setError(null);
        setLoading(false);
        if (TERMINAL_STATUSES.has(fresh.status)) {
          // One last refresh already happened; stop polling.
          return;
        }
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
      timer = window.setTimeout(tick, pollMs);
    }

    void tick();

    return () => {
      cancelledRef.current = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [runId, pollMs]);

  const done = run !== null && TERMINAL_STATUSES.has(run.status);
  return { run, error, loading, done };
}

/**
 * Polls a frame endpoint at `intervalMs` and returns the latest data URL.
 * Used by GroundTruthVerificationScreen to render the live robot wrist cam.
 */

type FrameSource = "drone" | "robot";

export function useFrame(source: FrameSource | null, intervalMs = 500): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const fetcher = useCallback(async () => {
    if (source === "drone") return getDroneFrame();
    if (source === "robot") return getRobotFrame();
    return null;
  }, [source]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!source) {
      setDataUrl(null);
      return;
    }

    let timer: number | null = null;
    async function tick() {
      if (cancelledRef.current) return;
      try {
        const frame = await fetcher();
        if (cancelledRef.current || !frame) return;
        if (frame.data_url) setDataUrl(frame.data_url);
      } catch {
        // swallow — the frame stream is best-effort, no need to surface
      }
      timer = window.setTimeout(tick, intervalMs);
    }
    void tick();

    return () => {
      cancelledRef.current = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [source, intervalMs, fetcher]);

  return dataUrl;
}
