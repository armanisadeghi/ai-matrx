/**
 * Audio Session Registry — shared types.
 *
 * The registry is the SINGLE source of truth for every audio activity in the
 * browser session, in BOTH directions:
 *   - "playback" (audio OUT — TTS read-aloud, the playback queue, podcasts, the
 *     xAI voice agent), and
 *   - "recording" (audio IN — the global transcription recorder, voice messages,
 *     flashcard capture).
 *
 * Every producer registers a session here; the avatar-menu Audio panel renders
 * the registry. This is the "what exists + history + how to control it" layer
 * that sits ABOVE the two app-wide arbiters (`playbackLock`, `captureLock`) —
 * the locks enforce "one-at-a-time"; the registry remembers everything so the
 * user can see and replay what they missed.
 *
 * Sessions are SERIALIZABLE (they mirror into Redux). Control callbacks are NOT
 * serializable, so they live in a side-table inside the registry keyed by id —
 * the same pattern the overlay system uses for callbacks. Never put a function
 * on an `AudioSession`.
 */

/** Audio IN vs audio OUT. */
export type AudioDirection = "playback" | "recording";

/**
 * Status of one session. Playback and recording share this vocabulary so the
 * panel can render both lanes with one set of chips:
 *   - queued    — waiting in line (playback queue only)
 *   - loading   — connecting / synthesizing / buffering (playback), or starting
 *   - active    — playing (out) or recording (in)
 *   - paused
 *   - done      — finished naturally or stopped; kept in history for replay
 *   - error
 */
export type AudioSessionStatus =
  | "queued"
  | "loading"
  | "active"
  | "paused"
  | "done"
  | "error";

/**
 * Where a session came from. Free-form but drawn from a known set so the panel
 * can label/group consistently and so the lockdown guards can attribute audio.
 */
export type AudioSessionSource =
  | "chat-tts" // read-aloud button on a chat/assistant message
  | "auto-voice" // app-root speak-as-it-streams singleton
  | "queue" // the unified playback queue (Speaker buttons, notes, etc.)
  | "podcast" // podcast episode player
  | "voice-agent" // xAI realtime voice agent
  | "recording" // mic capture (transcription, voice message, etc.)
  | "other";

/** One audio activity — serializable; mirrored into Redux. */
export interface AudioSession {
  id: string;
  direction: AudioDirection;
  source: AudioSessionSource;
  /** Short human label for the row (e.g. "Assistant reply", "Voice message"). */
  label: string;
  /** Optional text preview / replay payload for TTS sessions. */
  text?: string;
  status: AudioSessionStatus;
  error?: string;
  /** Epoch ms when first registered (stable across updates → stable ordering). */
  createdAtMs: number;
  /** Epoch ms when the session reached a terminal status. */
  endedAtMs?: number;
  /** True when the panel may offer a Replay action for this (terminal) session. */
  canReplay?: boolean;
}

/**
 * Control callbacks for a session. Held in the registry's side-table (NOT in
 * Redux). Every field is optional — the panel shows only the controls a given
 * session actually exposes for its current status.
 */
export interface AudioSessionControls {
  /** Pause the active session (playback or recording). */
  pause?: () => void | Promise<void>;
  /** Resume a paused session. */
  resume?: () => void | Promise<void>;
  /** Stop now (terminal). MUST be synchronous-effective. */
  stop?: () => void | Promise<void>;
  /** Play a queued/terminal session right now, taking over current output. */
  playNow?: () => void | Promise<void>;
  /** Replay a finished session (often re-routed through the queue). */
  replay?: () => void | Promise<void>;
  /** Remove from the queue / history list. */
  remove?: () => void | Promise<void>;
}

/** Patch applied to an existing session. */
export type AudioSessionPatch = Partial<
  Pick<AudioSession, "label" | "text" | "status" | "error" | "canReplay">
>;

/** Snapshot pushed to subscribers (→ Redux mirror). */
export interface AudioSnapshot {
  sessions: AudioSession[];
}

/** Input to register a new session. */
export interface RegisterSessionInput {
  direction: AudioDirection;
  source: AudioSessionSource;
  label: string;
  text?: string;
  status?: AudioSessionStatus;
  canReplay?: boolean;
}

/** Handle returned by `beginPlaybackSession` — the atomic claim+register helper. */
export interface PlaybackSessionHandle {
  id: string;
  /** Update status/label/text as playback progresses. */
  update: (patch: AudioSessionPatch) => void;
  /** Mark terminal (done/error) and release the playback lock. */
  end: (finalStatus?: "done" | "error", error?: string) => void;
}
