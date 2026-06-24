/**
 * Capture Lock — app-wide single-recording arbitration.
 *
 * THE invariant for this whole audio system: **only one microphone capture may
 * be live at any instant, anywhere in the app.** The global transcription
 * session (`GlobalRecordingProvider`) already enforces start-always-wins for
 * itself, but it is not the only thing that opens a `MediaRecorder` — raw-blob
 * recorders (`useSimpleRecorder` for voice messages / quick transcripts, the
 * flashcard recorders) each run their own. Without a shared arbiter, a dictation
 * session and a WhatsApp voice message (or two flashcard cards) could capture at
 * the same time — exactly the concurrency this system exists to make impossible.
 *
 * This module is that arbiter: a tiny, framework-agnostic, module-level
 * singleton every recorder claims before it starts capturing and releases when
 * it stops. Claiming is **start-always-wins** — a new claim instantly stops the
 * current holder (its `stop` runs synchronously) and takes ownership. It
 * allocates nothing until first use and holds no media itself; it only tracks
 * who currently owns capture and how to stop them.
 *
 * Contract for holders:
 *  - Generate a STABLE id per recorder instance (e.g. `useId()`), or a stable
 *    constant for a singleton owner (the global session).
 *  - `claimCapture({ id, stop })` right before opening the mic / MediaRecorder.
 *  - `releaseCapture(id)` when the recording ends (stopped, finalized, errored,
 *    or unmounted). Release is id-guarded, so a stale release after a takeover
 *    is a safe no-op.
 *  - `stop` MUST be synchronous-effective: it must immediately stop CAPTURE
 *    (close/stop the MediaRecorder). Background finalization (transcription,
 *    upload) may continue afterwards — that's fine, it is not capture.
 *  - A takeover should be treated as a DISCARD by raw recorders (don't auto-
 *    commit a half-finished blob); the user deliberately started something else.
 */

export interface CaptureHolder {
  /** Stable identifier for the claiming recorder instance / owner. */
  id: string;
  /** Optional human label for diagnostics / the global indicator. */
  label?: string;
  /**
   * Stop CAPTURE immediately. Called when another recorder takes over. Must be
   * synchronous-effective (stop the MediaRecorder now); background finalize may
   * continue. Never throws out — wrap your own teardown.
   */
  stop: () => void;
}

let current: CaptureHolder | null = null;
const listeners = new Set<(holder: CaptureHolder | null) => void>();

function notify(): void {
  for (const cb of listeners) {
    try {
      cb(current);
    } catch (err) {
      console.error("[captureLock] listener threw:", err);
    }
  }
}

/**
 * Claim exclusive capture (start-always-wins). If a different holder currently
 * owns capture, its `stop()` runs first (synchronously) so two captures can
 * never overlap. Re-claiming with the SAME id (e.g. the global session taking
 * over itself) does not stop the holder — it just refreshes the registration.
 */
export function claimCapture(holder: CaptureHolder): void {
  if (current && current.id !== holder.id) {
    const previous = current;
    // Clear before stopping so a re-entrant claim/release from inside the
    // previous holder's stop() can't see a stale owner or loop.
    current = null;
    try {
      previous.stop();
    } catch (err) {
      console.error(
        `[captureLock] previous holder "${previous.id}" stop() threw during takeover:`,
        err,
      );
    }
  }
  current = holder;
  notify();
}

/**
 * Release capture for `id`. Id-guarded: if `id` is not the current owner (it was
 * already taken over), this is a no-op — a late release can never clear a newer
 * holder's claim.
 */
export function releaseCapture(id: string): void {
  if (current?.id === id) {
    current = null;
    notify();
  }
}

/** The id of the recorder currently holding capture, or null if idle. */
export function getActiveCaptureId(): string | null {
  return current?.id ?? null;
}

/** True while any recorder holds capture. */
export function isCaptureActive(): boolean {
  return current !== null;
}

/**
 * Subscribe to capture ownership changes. Returns an unsubscribe fn. Fires the
 * current value synchronously is NOT done here — call `getActiveCaptureId()` for
 * the initial read if needed.
 */
export function subscribeCapture(
  cb: (holder: CaptureHolder | null) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
