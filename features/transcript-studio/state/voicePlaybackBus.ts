// voicePlaybackBus — tiny React-free singleton so the Scribe HEADER (in
// ScribeScreen) can show "voice is playing" and stop it, while the actual
// speaker instance lives down in the Agent+ tab (useAutoVoiceResponse). The
// auto-voice hook publishes its live state + a stop() here; the header button
// subscribes. One active playback at a time is all this surface needs.

export interface VoicePlaybackState {
  /** True while audio is loading or playing (i.e. there is something to stop). */
  active: boolean;
  /** True specifically while audio is audibly playing. */
  playing: boolean;
}

let state: VoicePlaybackState = { active: false, playing: false };
let stopFn: () => void = () => {};
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* a bad listener must not break the others */
    }
  }
}

export function setVoicePlayback(next: {
  active: boolean;
  playing: boolean;
  stop: () => void;
}): void {
  stopFn = next.stop;
  if (next.active === state.active && next.playing === state.playing) return;
  state = { active: next.active, playing: next.playing };
  emit();
}

/** Clear the published state (e.g. on consumer unmount). */
export function clearVoicePlayback(): void {
  stopFn = () => {};
  if (!state.active && !state.playing) return;
  state = { active: false, playing: false };
  emit();
}

export function stopVoicePlayback(): void {
  stopFn();
}

export function getVoicePlayback(): VoicePlaybackState {
  return state;
}

export function subscribeVoicePlayback(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
