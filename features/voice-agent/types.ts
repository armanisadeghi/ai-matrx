// features/voice-agent/types.ts
//
// Shared types for the xAI Realtime voice agent feature.

/** Voices supported by xAI Realtime as of 2026-05. */
export type VoiceId = "ara" | "eve" | "leo" | "rex" | "sal";

/** Tool families exposed in the playground. Function tools live in a future iteration. */
export type ToolName = "web_search" | "x_search";

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

/** One conversational turn. `id` is the idempotency key for Supabase writes. */
export interface VoiceTurn {
  /** Client-generated UUID; mirrored into `cx_message.metadata.voice.turn_id`. */
  id: string;
  role: "user" | "assistant";
  /** Running text — mutated as transcript deltas arrive. */
  text: string;
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
  tools: ToolName[];
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
