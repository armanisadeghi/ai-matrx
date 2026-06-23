// voicePlaybackBus — React-free singleton that decouples read-aloud (TTS) from
// the surfaces that produce and observe it.
//
// TWO DIRECTIONS, ONE BUS:
//
//   ▸ REQUEST (down): a surface asks "read THIS conversation's responses aloud"
//     (or "stop"). It publishes `{ conversationId, enabled }` here. The single
//     app-root owner — `AudioOutputHost` (providers/AudioOutputHost.tsx) — is
//     the ONLY subscriber that mounts the actual speaker, so playback lives at
//     the top of the tree and SURVIVES tab switches and route changes. The
//     surface that asked can unmount (War Room tab switch, navigation) and the
//     in-flight read-aloud keeps playing.
//
//   ▸ STATE (up): the owner publishes live `{ active, playing }` + a `stop()`
//     so a header control (VoicePlaybackButton) anywhere can show "voice is
//     playing" and halt it. The producing speaker is elsewhere (now app-root).
//
// One active read-aloud at a time is all these surfaces need.

export interface VoicePlaybackState {
  /** True while audio is loading or playing (i.e. there is something to stop). */
  active: boolean;
  /** True specifically while audio is audibly playing. */
  playing: boolean;
}

/**
 * A surface's request to have an agent conversation's responses read aloud as
 * they stream. The app-root owner consumes exactly one at a time.
 */
export interface VoicePlaybackRequest {
  /** Conversation whose streaming responses should be spoken. */
  conversationId: string | null;
  /** When false, the owner is dormant for this conversation (no speaking). */
  enabled: boolean;
}

let state: VoicePlaybackState = { active: false, playing: false };
let stopFn: () => void = () => {};
const listeners = new Set<() => void>();

// ── Read-aloud request channel (surface → app-root owner) ───────────────────
let request: VoicePlaybackRequest = { conversationId: null, enabled: false };
const requestListeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* a bad listener must not break the others */
    }
  }
}

function emitRequest() {
  for (const l of requestListeners) {
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

/** Clear the published state (e.g. on owner teardown). */
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

/**
 * Publish a read-aloud request. The app-root owner re-binds to the new
 * conversation / enabled state. A surface calls this on mount + whenever its
 * conversation or auto-voice toggle changes. Passing `enabled: false` (or a
 * null conversation) tells the owner to stand down — but it does NOT cut any
 * audio already in flight; surfaces that want an immediate cut call
 * `stopVoicePlayback()` as well.
 *
 * No-ops when nothing changed so re-renders don't churn the owner.
 */
export function requestVoicePlayback(next: VoicePlaybackRequest): void {
  if (
    next.conversationId === request.conversationId &&
    next.enabled === request.enabled
  ) {
    return;
  }
  request = next;
  emitRequest();
}

/**
 * Stand the owner down ONLY IF the given conversation is still the active
 * requester. For surfaces that come and go in parallel (e.g. several War Room
 * Agent tiles in Grid view share this one bus): a tile clears its OWN request on
 * unmount, but must not cancel a SIBLING tile that became the active requester
 * after it. Guarding on `conversationId` makes a stale unmount a no-op instead
 * of stomping the foreground tile's read-aloud. Does not cut audio in flight.
 */
export function clearVoicePlaybackRequestFor(conversationId: string | null): void {
  if (request.conversationId !== conversationId) return;
  requestVoicePlayback({ conversationId: null, enabled: false });
}

export function getVoicePlaybackRequest(): VoicePlaybackRequest {
  return request;
}

export function subscribeVoicePlaybackRequest(cb: () => void): () => void {
  requestListeners.add(cb);
  return () => requestListeners.delete(cb);
}
