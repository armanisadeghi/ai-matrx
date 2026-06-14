// features/transcript-studio/state/scribeAudioBus.ts
//
// React-free pub/sub so any surface can ask the scribe session player to seek +
// play a moment of the audio — without a shared React subtree or prop drilling.
//
// WHY THIS EXISTS
// ---------------
// The thing that plays a session's audio (the SessionAudioPlayer, mounted once
// at the ScribeScreen level) and the things that *reference* a moment in it live
// in unrelated React trees:
//   - an agent's reply on the Agent tab emits an inline `<audiocite>` citation,
//   - a transcript row, a recording card, or any future surface,
// all need to say "play the session at T seconds" while the player is somewhere
// else entirely (and may be on an inactive tab). A tiny event bus decouples the
// citer from the player exactly the way `state/voicePlaybackBus.ts` decouples
// the TTS producer from the stop button.
//
// Session-relative seconds are the ONE coordinate system for the whole studio
// (every raw/cleaned/recording segment carries `tStart`/`tEnd` in seconds from
// session start, paused time excluded — see FEATURE.md invariants). A seek
// request is therefore just `{ sessionId, sessionSeconds }`; the player resolves
// which recording segment owns that instant and what file offset it maps to.

export interface ScribeAudioSeekRequest {
  /** The studio session whose audio should play. */
  sessionId: string;
  /** Where to seek, in seconds from session start (paused time excluded). */
  sessionSeconds: number;
  /**
   * Optional end of the cited span, session-relative seconds. When set, the
   * player auto-pauses on reaching it so a citation plays exactly its clip.
   */
  endSeconds?: number;
  /** Begin playback immediately after seeking. Defaults to true. */
  autoplay?: boolean;
}

type Listener = (req: ScribeAudioSeekRequest) => void;

const listeners = new Set<Listener>();

/**
 * Ask the active session player to seek (and, by default, play). No-ops
 * silently if no player is mounted — the caller never needs to know.
 */
export function requestScribeAudioSeek(req: ScribeAudioSeekRequest): void {
  for (const l of listeners) {
    try {
      l(req);
    } catch {
      // never let one bad subscriber break the bus
    }
  }
}

/** Subscribe a player to seek requests. Returns an unsubscribe fn. */
export function subscribeScribeAudio(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
