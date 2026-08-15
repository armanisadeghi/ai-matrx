/**
 * Unified audio playback — shared types.
 *
 * One queue, one output, app-wide. Every "speak this" request becomes a
 * `PlaybackItem` on the single `playbackQueue`. If audio is already playing, the
 * new request is QUEUED (never overlapped — the playback twin of the capture
 * lock's start-always-wins). Providers plug in via `PlaybackAdapter`s so the
 * queue stays engine-agnostic (Cartesia WebSocket, Groq WAV blob, …).
 */

/**
 * Which synthesis engine renders an item. Declared with its capabilities in the
 * AV engine registry (`features/audio/service/engines.ts`) — this union and
 * `SpeakEngineId` are the same set by construction (see the type assertion
 * there). Consumers call `speak()`, never these keys directly.
 */
export type PlaybackProvider = "cartesia" | "catalog";

export type PlaybackItemStatus =
  | "queued" // waiting in line
  | "loading" // synthesizing / buffering (fetching token, generating WAV…)
  | "playing"
  | "paused"
  | "done" // finished naturally or stopped — kept in history until cleared
  | "error";

/** What a consumer asks the queue to speak. */
export interface PlaybackRequest {
  provider: PlaybackProvider;
  /** Raw text; the adapter applies markdown stripping per `processMarkdown`. */
  text: string;
  processMarkdown?: boolean;
  /** Short human label for the queue UI (e.g. "Assistant reply", "Note"). */
  label?: string;
  /** Opt this utterance into Custom Dictionary pronunciation (Cartesia). */
  dictionarySurfaceKey?: string;
  /** Cartesia voice params — resolved by `speak()` from the user's prefs. */
  cartesia?: { voiceId: string; language: string; speed: number };
  /** Catalog speech voice params — resolved by `speak()`; server picks the vendor. */
  catalog?: { voice?: string; model?: string };
}

export interface PlaybackItem extends PlaybackRequest {
  id: string;
  status: PlaybackItemStatus;
  error?: string;
  enqueuedAtMs: number;
}

/** Serializable snapshot the queue pushes to subscribers (→ Redux mirror). */
export interface PlaybackSnapshot {
  items: PlaybackItem[];
  /** Id of the item currently loading/playing/paused, or null when idle. */
  currentId: string | null;
  /** Global playback rate (applies live to rate-capable providers, e.g. Groq). */
  rate: number;
}

/** Callbacks an adapter fires back into the queue as playback progresses. */
export interface PlaybackAdapterCallbacks {
  onLoading: () => void;
  onPlaying: () => void;
  /** Natural end — the queue advances to the next item. */
  onEnded: () => void;
  onError: (message: string) => void;
}

/** Handle for controlling the one active playback an adapter started. */
export interface ActivePlayback {
  pause: () => void | Promise<void>;
  resume: () => void | Promise<void>;
  /** Stop + release all resources. Must be idempotent. */
  stop: () => void | Promise<void>;
  /** Live playback-rate change (rate-capable providers only). */
  setRate?: (rate: number) => void;
}

export interface PlaybackAdapter {
  provider: PlaybackProvider;
  /**
   * Begin playing `item`. Resolves with a control handle as soon as playback is
   * underway (NOT when it finishes). Fire `cb.onPlaying` once audio starts and
   * `cb.onEnded` when it finishes naturally.
   */
  start: (
    item: PlaybackItem,
    cb: PlaybackAdapterCallbacks,
    rate: number,
  ) => Promise<ActivePlayback>;
}
