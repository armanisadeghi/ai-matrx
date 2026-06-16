// features/voice-agent/types.ts
//
// Shared types for the xAI Realtime voice agent feature.

/** Voices supported by xAI Realtime as of 2026-05. */
export type VoiceId = "ara" | "eve" | "leo" | "rex" | "sal";

/**
 * xAI Realtime's first-party (server-side) tools. These are NOT function
 * tools — xAI runs them itself and the call never reaches the client. They
 * emit `{type: <name>}` in `session.update`, not `{type: "function", ...}`.
 *
 * Keep this union narrow to the actual builtins the realtime model supports.
 * The contract's classification step (`execution === "builtin"`) maps to these.
 */
export type BuiltinToolName = "web_search" | "x_search";

/**
 * One resolved tool as returned by `POST /ai/agents/{id}/realtime-tools`.
 * The shape mirrors the backend `RealtimeTool` model EXACTLY (contract §3):
 *
 *   - `execution: "server"`  → round-tripped through `POST /ai/tools/execute`.
 *   - `execution: "client"`  → run locally via the client-tool registry.
 *   - `execution: "builtin"` → xAI-native; emitted as `{type: name}` and never
 *      executed by us (reaching the client is a backend classification bug).
 *
 * `parameters` is a JSON Schema object passed VERBATIM to xAI as the function
 * tool's parameter schema — we never reshape it.
 */
export interface ResolvedRealtimeTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execution: "server" | "client" | "builtin";
}

/** The full resolved tool set for an instance — replaces the old `ToolName[]`. */
export type RealtimeToolSet = ResolvedRealtimeTool[];

/** Which route is mounting the session — drives slice instance key + persistence preset. */
export type VoiceAgentPreset = "intro" | "playground";

/** UI status surface — the only thing the visualizer and mic button branch on. */
export type VoiceStatus =
  | "idle"
  | "requesting-mic"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupting"
  | "error";

/** One transcript delta and when it arrived from xAI (assistant turns only). */
export interface TranscriptDeltaArrival {
  /** Length of `text` AFTER this delta was applied — i.e. the high-watermark char offset this delta brought us to. */
  char_offset: number;
  /** `Date.now()` at the moment the delta event was received. */
  arrived_at_ms: number;
}

/** One conversational turn. `id` is the idempotency key for Supabase writes. */
export interface VoiceTurn {
  /** Client-generated UUID; mirrored into `cx_message.metadata.voice.turn_id`. */
  id: string;
  role: "user" | "assistant";
  /** Running text — mutated as transcript deltas arrive. */
  text: string;
  /**
   * Char cutoff for what's safe to RENDER on screen — drives the audio-
   * gated reveal. Assistant turns only; user turns are unaffected (their
   * text comes from STT on completed audio, so it's never ahead). On
   * turn end / interrupt the writer floors this to `text.length` so the
   * full transcript is visible afterward.
   */
  text_reveal_index: number;
  /**
   * Per-delta arrival log used to map "audio elapsed" → "chars safe to
   * show". Cleared on turn completion to avoid unbounded growth.
   * Assistant turns only.
   */
  text_delta_arrivals: TranscriptDeltaArrival[];
  /** `Date.now()` at which the FIRST assistant audio chunk was scheduled for playback. Assistant turns only. */
  audio_started_at_ms?: number;
  status: "pending" | "completed" | "interrupted";
  started_at_ms: number;
  ended_at_ms?: number;
  /** xAI server `item.id` once received. */
  item_id?: string;
  /** xAI `response.id` (assistant turns only). */
  response_id?: string;
  /** Total ms of audio that played before the turn ended (assistant only). */
  audio_duration_ms?: number;
  /** Ms from user speech-end to first assistant audio byte (assistant only). */
  speech_ttfb_ms?: number;
}

/** Per-instance session state. One instance per active `instanceId` ("intro" | "playground"). */
export interface VoiceAgentInstance {
  // Config — set once at initInstance, then immutable for the life of the instance.
  voiceId: VoiceId;
  instructions: string;
  tools: RealtimeToolSet;
  preset: VoiceAgentPreset;
  persist: boolean;

  // Connection / UI
  status: VoiceStatus;
  error: { code: string; message: string } | null;

  // Persistence
  /** `cx_conversation.id` once the first turn lands. Null before then. */
  conversationId: string | null;
  /** Turn ids already written to `cx_message`. Used for idempotency. */
  persistedTurnIds: string[];

  // Transcript
  turns: VoiceTurn[];

  // Telemetry
  totalInterruptions: number;
  /** ms samples: user-speech-end → first assistant audio byte. */
  latencySamplesMs: number[];
  sessionStartedAtMs: number | null;
}

export interface VoiceAgentState {
  instances: Record<string, VoiceAgentInstance>;
}

/** Token payload returned by `/api/voice-agent/token`. */
export interface VoiceAgentTokenResponse {
  /** Ephemeral `client_secret` value. Passed as WebSocket subprotocol `xai-client-secret.<value>`. */
  value: string;
  /** Unix-seconds expiry. Used to schedule refresh ~5s before. */
  expires_at: number;
}
