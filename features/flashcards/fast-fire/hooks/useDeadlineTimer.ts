// features/flashcards/fast-fire/hooks/useDeadlineTimer.ts
//
// DEADLINE TIMER — the fix for the historical timer bug (REQUIREMENTS §5.3 #3,
// hard-requirement #2). The old drill used `setInterval` to DECREMENT a counter
// inside an effect whose deps included unstable callbacks; the effect tore down
// and re-subscribed every render → double-starts and dropped ticks.
//
// Instead: ONE `deadlineTs` (a wall-clock ms timestamp) and ONE
// requestAnimationFrame loop that compares it to `Date.now()`. When the deadline
// passes it fires the per-card transition EXACTLY ONCE via a `firedRef`, then
// stops. No setInterval, no countdown decrement, no callback in the effect deps
// that could churn the subscription. Resetting the deadline (next card) clears
// `firedRef` and restarts the single loop.
//
// The loop ALSO exposes a 0..1 progress value (and remaining ms) for the depleting
// timer bar, updated per frame from local refs — that drives the bar WITHOUT any
// per-frame Redux write or state churn (the UI reads it through a subscription
// callback, see `onTick`). React Compiler is on: no manual memo.

import { useEffect, useRef } from "react";

export interface DeadlineTimerOptions {
  /**
   * Wall-clock ms (Date.now()-based) at which the card expires. null = no active
   * deadline (paused / between cards) — the loop idles.
   */
  deadlineTs: number | null;
  /** Total duration of THIS card's window, ms — for the progress fraction. */
  durationMs: number;
  /** Fired EXACTLY ONCE when the deadline passes. */
  onExpire: () => void;
  /**
   * Per-frame tick while a deadline is active. `remainingMs` ≥ 0, `progress` is
   * 0..1 (0 = just started, 1 = expired). Drives the depleting bar directly off
   * rAF — no React state, no Redux, no re-render per frame.
   */
  onTick?: (remainingMs: number, progress: number) => void;
}

export function useDeadlineTimer(options: DeadlineTimerOptions): void {
  const { deadlineTs, durationMs, onExpire, onTick } = options;

  // Latest values in refs so the SINGLE rAF effect never lists unstable
  // callbacks/values in its deps (that was the original churn bug). The effect
  // depends ONLY on `deadlineTs` — a new card means a new deadline means one
  // clean restart of the loop.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;

  // Guards a single fire per deadline.
  const firedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // No active deadline → idle (and clear any prior frame).
    if (deadlineTs === null) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return undefined;
    }

    // New deadline → arm a fresh single-fire window.
    firedRef.current = false;
    const duration = Math.max(1, durationRef.current);

    const loop = () => {
      const now = Date.now();
      const remaining = deadlineTs - now;

      if (remaining <= 0) {
        // Progress full, remaining clamped to 0, then fire once.
        onTickRef.current?.(0, 1);
        if (!firedRef.current) {
          firedRef.current = true;
          onExpireRef.current();
        }
        rafRef.current = null;
        return; // stop the loop — the transition is owned by onExpire now
      }

      const elapsed = duration - remaining;
      const progress = Math.min(1, Math.max(0, elapsed / duration));
      onTickRef.current?.(remaining, progress);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // ONLY deadlineTs. Everything else is read through a ref so the loop never
    // re-subscribes on a render that didn't change the deadline.
  }, [deadlineTs]);
}
