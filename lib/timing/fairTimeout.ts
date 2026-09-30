/**
 * fairTimeout — a timeout that only fires after a FAIR window.
 *
 * A `setTimeout` race ("give X one second, then declare X stuck") has a blind
 * spot: when the page itself freezes past the deadline, the timer and X's
 * answer are both due the moment the thread comes back, and the timer usually
 * runs first. X is then blamed for the page's freeze — the 2026-09-30 /board
 * capture reported "IndexedDB operation timed out" while the real defect was
 * a locked-up page.
 *
 * Each window is judged by whether its timer ran on time. A timer that fired
 * `starvedMs` or more late proves the event loop was blocked for that window,
 * so a fresh window is granted (up to `maxStarvedWindows`), letting an answer
 * queued behind the freeze land first. Page freezes are reported separately,
 * with their culprit scripts, by `lib/diagnostics/mainThreadStallMonitor.ts`.
 */

export const FAIR_TIMEOUT_STARVED_MS = 250;
export const FAIR_TIMEOUT_MAX_STARVED_WINDOWS = 5;

export interface FairTimeoutResult {
  /** Windows discarded because the page was frozen through them. */
  starvedWindows: number;
  /** Total lateness of the discarded windows' timers. */
  starvedMs: number;
}

export interface FairTimeout {
  /** Resolves when one window elapses on time (or the starved-window cap is hit). Never rejects. */
  expired: Promise<FairTimeoutResult>;
  cancel: () => void;
}

export function fairTimeout(
  ms: number,
  options: {
    starvedMs?: number;
    maxStarvedWindows?: number;
    /** Called for each discarded window — for a log line, never a capture. */
    onStarvedWindow?: (lateMs: number, starvedWindows: number) => void;
  } = {},
): FairTimeout {
  const starvedThreshold = options.starvedMs ?? FAIR_TIMEOUT_STARVED_MS;
  const maxStarved = options.maxStarvedWindows ?? FAIR_TIMEOUT_MAX_STARVED_WINDOWS;
  let handle: ReturnType<typeof globalThis.setTimeout> | null = null;
  let cancelled = false;
  const result: FairTimeoutResult = { starvedWindows: 0, starvedMs: 0 };
  const expired = new Promise<FairTimeoutResult>((resolve) => {
    const arm = () => {
      const armedAt = Date.now();
      handle = globalThis.setTimeout(() => {
        handle = null;
        if (cancelled) return;
        const lateMs = Math.max(0, Date.now() - armedAt - ms);
        if (lateMs < starvedThreshold || result.starvedWindows >= maxStarved) {
          resolve(result);
          return;
        }
        result.starvedWindows += 1;
        result.starvedMs += lateMs;
        options.onStarvedWindow?.(lateMs, result.starvedWindows);
        arm();
      }, ms);
    };
    arm();
  });
  return {
    expired,
    cancel: () => {
      cancelled = true;
      if (handle !== null) globalThis.clearTimeout(handle);
      handle = null;
    },
  };
}
