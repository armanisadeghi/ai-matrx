/**
 * features/pdf/utils/inactivity.ts
 *
 * Inactivity watchdog for long-running PDF streams. A total-duration timeout
 * is wrong for pipelines (a 500-page extract legitimately runs for minutes);
 * the failure mode that strands UI forever is a stream that stops EMITTING —
 * socket stalled, server hung, proxy half-closed. The watchdog aborts only
 * after `idleMs` with no events, and every callback bumps it.
 *
 * Usage:
 *   const watchdog = createInactivityWatchdog(90_000);
 *   try {
 *     await streamX({ signal: watchdog.signal, callbacks: wrap(watchdog.bump) });
 *   } catch (err) {
 *     if (watchdog.timedOut) throw new Error("No response from the server …");
 *     throw err;
 *   } finally {
 *     watchdog.dispose();
 *   }
 */

export interface InactivityWatchdog {
  /** Pass to fetch / stream consumers. */
  signal: AbortSignal;
  /** Call on every received event to reset the idle timer. */
  bump: () => void;
  /** True once the watchdog (not the caller) triggered the abort. */
  readonly timedOut: boolean;
  /** Clear the timer — always call in `finally`. */
  dispose: () => void;
}

export function createInactivityWatchdog(idleMs: number): InactivityWatchdog {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleMs);
  };
  arm();

  return {
    signal: controller.signal,
    bump: arm,
    get timedOut() {
      return timedOut;
    },
    dispose: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Bound a promise that has no abort hook of its own (e.g. a Supabase
 * round-trip). Resolves/rejects with the promise, or rejects with a
 * timeout error after `ms`.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
