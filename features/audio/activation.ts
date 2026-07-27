/**
 * Audio system activation latch.
 *
 * Framework-free module-level singleton — the ONE signal that mounts the
 * entire audio system (`providers/AudioSystemHost.tsx`). Nothing audio-related
 * loads on any route until `activateAudio()` fires; after that, everything
 * (recording engine, TTS speaker, playback/session mirrors, device manager,
 * recovery) mounts once and stays mounted for the life of the tab.
 *
 * LAW: this module imports NOTHING. Every audio entry point (playback queue,
 * voice-playback bus, audio modal, capture lock, recording commands, panel
 * opener) imports it for free — it must never drag a graph with it.
 *
 * The latch is one-way: once activated it never resets. `subscribeAudioActivation`
 * is `useSyncExternalStore`-compatible (subscribe returns an unsubscribe fn and
 * listeners fire on the transition).
 */

let activated = false;
const listeners = new Set<() => void>();

/** True once the audio system has been engaged this tab. Never resets. */
export function isAudioActivated(): boolean {
  return activated;
}

/**
 * Engage the audio system. Idempotent — the first call flips the latch and
 * notifies subscribers; subsequent calls are no-ops.
 */
export function activateAudio(): void {
  if (activated) return;
  activated = true;
  for (const cb of listeners) {
    try {
      cb();
    } catch (err) {
      console.error("[audioActivation] listener threw:", err);
    }
  }
}

/** Subscribe to the activation transition. Returns an unsubscribe fn. */
export function subscribeAudioActivation(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
