/**
 * useAutoDispatchCountdown — the 30s autonomy timer that drives the
 * "Auto-dispatch in 0:28" UX on the Satellite stage card.
 *
 * Why a hook:
 *   The countdown drives THREE pieces of UI in the Monitor tab simultaneously
 *   - the timeline status line, the satellite card body, and the action
 *   buttons. Putting the timer logic in a hook keeps that fanout DRY and
 *   isolates the lifecycle (start / hold / send-now / fire) so the caller
 *   only deals with the resulting state.
 *
 *   This is also the "5th trigger" surface mentioned in the redesign brief:
 *   the human can override autonomy at any time. Three callbacks hang off
 *   it (onAutoFire / onSendNow / onHold) so the caller wires each one to
 *   the right side-effect (start a run, cancel, etc.).
 *
 * Lifecycle:
 *   - "armed"    : counting down, will fire at 0
 *   - "held"     : paused by the human; will not auto-fire
 *   - "fired"    : timer reached 0 OR user hit send-now; the caller's
 *                  onAutoFire / onSendNow ran exactly once
 *   - "disabled" : the hook is inactive (e.g. there's already a run going)
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CountdownState = "armed" | "held" | "fired" | "disabled";

export type CountdownConfig = {
  /** Seconds to count down. Default 30. */
  seconds?: number;
  /**
   * When false, the countdown does not start (or resets to disabled). Use
   * this to disable the timer once a run is in flight, since auto-dispatch
   * only makes sense before any run exists for the zone.
   */
  enabled: boolean;
  /** Fired exactly once when the timer reaches zero. */
  onAutoFire: () => void;
  /** Fired exactly once when the user hits "Send now". */
  onSendNow?: () => void;
  /** Fired when the user hits "Hold off". */
  onHold?: () => void;
};

export type CountdownHandle = {
  state: CountdownState;
  /** Seconds remaining (clamped >= 0). 0 once fired or disabled. */
  remainingSeconds: number;
  /** "0:28" formatted string for direct display. */
  display: string;
  /** Pause the timer. */
  hold: () => void;
  /** Fire immediately (resolves to onSendNow). */
  sendNow: () => void;
  /** Resume from `held` back to `armed`. */
  resume: () => void;
};

export function useAutoDispatchCountdown(
  config: CountdownConfig,
): CountdownHandle {
  const { seconds = 30, enabled, onAutoFire, onSendNow, onHold } = config;

  const [state, setState] = useState<CountdownState>(
    enabled ? "armed" : "disabled",
  );
  const [remaining, setRemaining] = useState<number>(seconds);

  // Refs so the interval doesn't capture stale callbacks.
  const onAutoFireRef = useRef(onAutoFire);
  const onSendNowRef = useRef(onSendNow);
  const onHoldRef = useRef(onHold);
  useEffect(() => {
    onAutoFireRef.current = onAutoFire;
    onSendNowRef.current = onSendNow;
    onHoldRef.current = onHold;
  });

  // Reset on config flip.
  useEffect(() => {
    if (!enabled) {
      setState("disabled");
      setRemaining(seconds);
    } else if (state === "disabled") {
      setState("armed");
      setRemaining(seconds);
    }
    // We intentionally only reset on the `enabled` edge. Other state changes
    // (held -> armed via resume()) are handled by the action callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, seconds]);

  // The tick. Runs only while armed.
  useEffect(() => {
    if (state !== "armed") return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // Fire AFTER state update commits; setState('fired') will cancel
          // the next tick. Doing it inside the setter keeps us aligned.
          window.setTimeout(() => {
            setState((s) => (s === "armed" ? "fired" : s));
            onAutoFireRef.current?.();
          }, 0);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [state]);

  const hold = useCallback(() => {
    setState((s) => {
      if (s === "armed") {
        onHoldRef.current?.();
        return "held";
      }
      return s;
    });
  }, []);

  const sendNow = useCallback(() => {
    setState((s) => {
      if (s === "armed" || s === "held") {
        // Force remaining to 0 visually.
        setRemaining(0);
        onSendNowRef.current?.();
        return "fired";
      }
      return s;
    });
  }, []);

  const resume = useCallback(() => {
    setState((s) => (s === "held" ? "armed" : s));
  }, []);

  return {
    state,
    remainingSeconds: remaining,
    display: formatMmSs(remaining),
    hold,
    sendNow,
    resume,
  };
}

function formatMmSs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
