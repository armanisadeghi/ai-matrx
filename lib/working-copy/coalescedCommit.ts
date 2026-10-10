/**
 * lib/working-copy/coalescedCommit.ts
 *
 * ONE SAVE PATH PER RECORD — coalesced, serialized, flushable.
 *
 * A record's working copy commits through exactly one of these, owned by the
 * record's session (`./recordSessions.ts`), never by a view. So two editors
 * open on one record schedule ONE timer and run ONE save, and a view that
 * unmounts mid-debounce neither drops the pending work nor fires a second save
 * beside the one still waiting.
 *
 * Rules:
 *  - `schedule()` (re)arms the debounce; the value is read when the commit
 *    RUNS (`read()`), so a burst of edits commits once, with the latest state.
 *  - Commits never overlap. A commit requested while one is in flight runs
 *    once, right after it, with the state at that moment.
 *  - `flush()` runs now (or right after the in-flight one) and resolves when
 *    everything requested so far has been written.
 *  - A commit that throws leaves the record pending (`hasPending()` stays
 *    true), so a later flush retries and nothing reports "clean" over unsaved
 *    work. WHEN it retries is the working copy's (backoff, reconnect).
 */

/** `retry`: the primitive re-running a save that failed (`./workingCopyKind.ts`). */
export type CommitReason = "debounced" | "flush" | "manual" | "retry";

export interface CoalescedCommitOptions<V> {
  /** Milliseconds from the last `schedule()` to the commit. */
  delay: (value: V) => number;
  /**
   * Longest an unbroken run of edits waits before it commits anyway (ms from
   * the FIRST edit since the last commit). Omitted: no cap — a person who
   * never pauses for `delay` never commits until a flush.
   */
  maxWait?: number;
  /** The record's state as it is NOW — read synchronously when a commit starts. */
  read: () => V;
  /** Write it. The ONE save for this record. */
  run: (value: V, reason: CommitReason) => void | Promise<void>;
  /** A commit failed (it stays pending). Defaults to console.error. */
  onError?: (error: unknown) => void;
}

export interface CoalescedCommit {
  /** An edit happened: commit after the delay (restarting any armed timer). */
  schedule: () => void;
  /** An edit happened that waits for an explicit flush (no autosave): pending, no timer. */
  mark: () => void;
  /**
   * Commit now; resolves when every requested commit has run. Nothing pending
   * → nothing written, unless `force` (an explicit "save a snapshot now").
   */
  flush: (reason?: CommitReason, force?: boolean) => Promise<void>;
  /** An edit is waiting (armed timer, queued re-run, or a failed commit). */
  hasPending: () => boolean;
  /** A commit is running. */
  isBusy: () => boolean;
  /** Drop an armed timer without committing (the record was discarded). */
  cancel: () => void;
}

export function createCoalescedCommit<V>(
  options: CoalescedCommitOptions<V>,
): CoalescedCommit {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let again: CommitReason | null = null;
  let dirty = false;
  /** When the current unbroken run of edits began (for `maxWait`). */
  let burstStart: number | null = null;

  const report = options.onError ?? ((error: unknown) => console.error("[working-copy] commit failed", error));

  const start = (reason: CommitReason, force = false): Promise<void> => {
    burstStart = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (inFlight) {
      // Never two writes at once: when something changed since this write
      // started (or a save is explicitly asked for), run once more after it,
      // with the state at that moment. `inFlight` resolves only after that
      // re-run has finished too. Nothing changed → the write in flight IS
      // the flush; a second identical write would be a duplicate snapshot.
      if (dirty || force) again = again === "manual" ? "manual" : reason;
      return inFlight;
    }
    dirty = false;
    let value: V;
    try {
      value = options.read();
    } catch (error) {
      dirty = true;
      report(error);
      return Promise.resolve();
    }
    let outcome: void | Promise<void>;
    try {
      outcome = options.run(value, reason);
    } catch (error) {
      dirty = true;
      report(error);
      return Promise.resolve();
    }
    if (!outcome || typeof (outcome as Promise<void>).then !== "function") {
      if (again) {
        const next = again;
        again = null;
        return start(next);
      }
      return Promise.resolve();
    }
    const running: Promise<void> = (outcome as Promise<void>).then(
      () => undefined,
      (error: unknown) => {
        dirty = true;
        report(error);
      },
    ).then(() => {
      inFlight = null;
      if (again) {
        const next = again;
        again = null;
        return start(next);
      }
      return undefined;
    });
    inFlight = running;
    return running;
  };

  return {
    mark() {
      dirty = true;
    },
    schedule() {
      dirty = true;
      if (timer) clearTimeout(timer);
      let ms: number;
      try {
        ms = options.delay(options.read());
      } catch {
        ms = 0;
      }
      const now = Date.now();
      if (burstStart === null) burstStart = now;
      if (options.maxWait !== undefined) ms = Math.max(0, Math.min(ms, burstStart + options.maxWait - now));
      timer = setTimeout(() => {
        timer = null;
        void start("debounced");
      }, ms);
    },
    flush(reason = "flush", force = false) {
      if (!force && !dirty && !timer && !inFlight && !again) return Promise.resolve();
      return start(reason, force);
    },
    hasPending() {
      return dirty || timer !== null || again !== null;
    },
    isBusy() {
      return inFlight !== null;
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      again = null;
      dirty = false;
      burstStart = null;
    },
  };
}
