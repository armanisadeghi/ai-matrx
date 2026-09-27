// features/spatial/persistence/autosave.ts
//
// The debounce/flush core of board autosave, with no React in it so its timing
// rules are testable on their own:
//
//   - `schedule(value)` replaces whatever is pending (last write wins) and
//     restarts the quiet-period timer.
//   - ONE write is in flight at a time. A value scheduled while a write runs
//     waits for it, then goes out — so writes land in the order they were made
//     and a slow save can never be overtaken by an older one.
//   - `flush()` sends the pending value now (unmount, pagehide, "save now").
//   - A failed write is reported through `onError` and NOT retried by itself;
//     the next `schedule` (the person's next edit) or an explicit `flush`
//     tries again with the newest value.

export interface AutosaverOptions<T> {
  delayMs: number;
  write: (value: T) => Promise<void>;
  /** Fires whenever `saving` flips. */
  onSavingChange?: (saving: boolean) => void;
  onSaved?: (value: T) => void;
  onError?: (error: unknown, value: T) => void;
  /** Injected for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface Autosaver<T> {
  schedule: (value: T) => void;
  /** Send the pending value now. Resolves when nothing is pending or in flight. */
  flush: () => Promise<void>;
  /** A value is waiting for the timer. */
  hasPending: () => boolean;
  /** Drop the pending value without writing it (the board was reloaded). */
  cancel: () => void;
}

export function createAutosaver<T>(options: AutosaverOptions<T>): Autosaver<T> {
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let pending: { value: T } | null = null;
  let timer: unknown = null;
  let inFlight: Promise<void> | null = null;

  const stopTimer = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const runOne = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (!pending) return Promise.resolve();
    const { value } = pending;
    pending = null;
    options.onSavingChange?.(true);
    inFlight = options
      .write(value)
      .then(
        () => options.onSaved?.(value),
        (error: unknown) => options.onError?.(error, value),
      )
      .finally(() => {
        inFlight = null;
        options.onSavingChange?.(false);
        // Something arrived while we were writing and its timer already fired
        // (or it was flushed): send it now.
        if (pending && timer === null) void runOne();
      });
    return inFlight;
  };

  const flush = async (): Promise<void> => {
    stopTimer();
    // Wait out a write in flight, then send what is pending, until idle.
    while (inFlight || pending) {
      if (inFlight) await inFlight;
      else await runOne();
    }
  };

  return {
    schedule(value: T) {
      pending = { value };
      stopTimer();
      timer = setTimer(() => {
        timer = null;
        void runOne();
      }, options.delayMs);
    },
    flush,
    hasPending: () => pending !== null,
    cancel() {
      stopTimer();
      pending = null;
    },
  };
}
