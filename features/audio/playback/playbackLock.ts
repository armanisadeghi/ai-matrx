/**
 * Playback Lock — app-wide single-OUTPUT arbitration.
 *
 * The output twin of `captureLock`. Just as only one mic capture may be live at
 * a time, **only one thing may be producing audible playback at any instant,
 * anywhere in the app.** Multiple playback paths exist (the unified
 * `playbackQueue` for Speaker buttons, the streaming auto-voice
 * `useCartesiaStreamingSpeaker`, xAI realtime, podcast PCM) and each one used to
 * play independently — so a War Room read-aloud could stream over a queued
 * utterance, two voices in your ear at once. This arbiter makes that
 * structurally impossible.
 *
 * Claiming is **start-always-wins**: a new claim instantly stops the current
 * holder (its `stop` runs synchronously) and takes ownership. Framework-free,
 * allocates nothing until first use, holds no audio itself — it only tracks who
 * currently owns playback and how to stop them.
 *
 * Contract for holders (mirror of captureLock):
 *  - Stable id per path (constant for a singleton owner, `useId()` per instance).
 *  - `claimPlayback({ id, stop })` right before producing audio.
 *  - `releasePlayback(id)` when playback ends (finished, stopped, errored,
 *    unmounted). Release is id-guarded — a stale release is a safe no-op.
 *  - `stop` MUST be synchronous-effective (stop audio now).
 *
 * Subscribers get a `PlaybackTakeover` describing the holder change, which the
 * AudioPlaybackHost uses to surface the Audio panel whenever playback gets
 * "complex" (a cross-path takeover).
 */

export interface PlaybackHolder {
  /** Stable identifier for the claiming playback path / instance. */
  id: string;
  /** Optional human label for diagnostics / the panel indicator. */
  label?: string;
  /** Stop audio immediately. Called when another path takes over. */
  stop: () => void;
}

export interface PlaybackTakeover {
  /** The holder that now owns playback, or null when playback went idle. */
  current: PlaybackHolder | null;
  /** The holder that was stopped to grant ownership, if this was a takeover. */
  preempted: PlaybackHolder | null;
}

let current: PlaybackHolder | null = null;
const listeners = new Set<(event: PlaybackTakeover) => void>();

function notify(preempted: PlaybackHolder | null): void {
  const event: PlaybackTakeover = { current, preempted };
  for (const cb of listeners) {
    try {
      cb(event);
    } catch (err) {
      console.error("[playbackLock] listener threw:", err);
    }
  }
}

/**
 * Claim exclusive playback (start-always-wins). If a different holder currently
 * owns playback, its `stop()` runs first (synchronously) so two outputs can
 * never overlap. Re-claiming with the SAME id just refreshes the registration.
 */
export function claimPlayback(holder: PlaybackHolder): void {
  if (current && current.id === holder.id) {
    current = holder;
    notify(null);
    return;
  }
  let preempted: PlaybackHolder | null = null;
  if (current) {
    preempted = current;
    // Clear before stopping so a re-entrant claim/release from inside the
    // previous holder's stop() can't see a stale owner or loop.
    current = null;
    try {
      preempted.stop();
    } catch (err) {
      console.error(
        `[playbackLock] previous holder "${preempted.id}" stop() threw during takeover:`,
        err,
      );
    }
  }
  current = holder;
  notify(preempted);
}

/**
 * Release playback for `id`. Id-guarded: if `id` is not the current owner (it
 * was already taken over), this is a no-op.
 */
export function releasePlayback(id: string): void {
  if (current?.id === id) {
    current = null;
    notify(null);
  }
}

/** The id of the path currently holding playback, or null if idle. */
export function getActivePlaybackHolderId(): string | null {
  return current?.id ?? null;
}

/** True while any path holds playback. */
export function isPlaybackHeld(): boolean {
  return current !== null;
}

/** Subscribe to playback ownership changes. Returns an unsubscribe fn. */
export function subscribePlaybackLock(
  cb: (event: PlaybackTakeover) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
