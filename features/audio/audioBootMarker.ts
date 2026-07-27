/**
 * Dirty-recording boot marker.
 *
 * The audio system mounts lazily (`providers/AudioSystemHost.tsx`), so after a
 * crash mid-recording there is no user gesture to trigger the IndexedDB orphan
 * scan that surfaces the recovery toast. This localStorage marker is the cheap
 * boot signal: the recording engine sets it when capture starts and clears it
 * when a recording finalizes cleanly. On boot, `AudioSystemHost` checks it
 * post-idle — if present, it activates the audio system so the real
 * `audioSafetyStore.getOrphaned()` scan (and recovery UI) can run.
 *
 * The recovery path also clears the marker after a clean empty scan and when
 * the last orphan is dismissed, so a handled/dismissed orphan doesn't keep
 * re-activating audio on every boot forever.
 *
 * Framework-free; imports nothing.
 */

export const AUDIO_BOOT_MARKER_KEY = "matrx.audio.dirtyRecording";

export function setAudioBootMarker(): void {
  try {
    localStorage.setItem(AUDIO_BOOT_MARKER_KEY, String(Date.now()));
  } catch {
    /* storage unavailable (private mode / quota) — recovery scan just won't auto-run */
  }
}

export function clearAudioBootMarker(): void {
  try {
    localStorage.removeItem(AUDIO_BOOT_MARKER_KEY);
  } catch {
    /* noop */
  }
}

export function hasAudioBootMarker(): boolean {
  try {
    return localStorage.getItem(AUDIO_BOOT_MARKER_KEY) !== null;
  } catch {
    return false;
  }
}
