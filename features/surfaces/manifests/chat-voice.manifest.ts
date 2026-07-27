/**
 * Surface manifest — Voice Chat (`matrx-user/chat-voice`).
 *
 * The full-screen realtime voice conversation at `/chat/voice` (built-in
 * introduction agent) and `/chat/voice/playground` (ad-hoc voice/tool/prompt
 * config). Rendered by `features/voice-agent/components/VoiceAgentSurface.tsx`.
 *
 * This surface name has been LOAD-BEARING since 2026-05 with no manifest: it
 * is passed to `useRealtimeAgentConfig` / `useXaiVoiceSession` as the
 * tool-resolution key (`POST /ai/agents/{id}/realtime-tools`), and the
 * `ui_surface` row (migrations/voice_intro_agent_and_surface.sql) carries
 * `execution_mode = 'browser-realtime'`. This manifest makes it code-first and
 * gives it a real value vocabulary.
 *
 * NOT a normal launch surface. There is no `launchAgentExecution` here — the
 * agent runs inside a browser-owned xAI Realtime WebSocket. The scope this
 * surface emits therefore serves the header Agents chrome (Run a *different*
 * agent against the live voice session) and agent↔surface bindings, not the
 * voice agent's own turn loop.
 *
 * Deliberately NOT `inheritsFrom: "matrx-user/chat"`, despite the DB row's
 * `parent_surface_name = 'matrx-user/chat'` (voice_surface_tool_parity.sql —
 * a mirror column, never read for hierarchy). The chat manifest's vocabulary
 * is only ~60% true here: there is no text composer at all (the mic IS the
 * composer), so `input_draft`, `attached_resources`, `variable_values`,
 * `working_document`, `scratchpad`, and `conversation_title` are values this
 * surface can never supply. Inheriting would advertise six lies to every
 * binding editor. The genuinely-shared concepts are re-declared here with
 * voice-accurate semantics ("turns", audio-gated, interruptible) instead.
 *
 * Curated groups (band 0-899):
 *
 *   voice_session   Which agent/voice/preset is running, and its durable
 *                   conversation handle
 *   connection      Live WebSocket + microphone state
 *   transcript      What has been said (see voiceTranscriptScope.ts — durable
 *                   arrived text, never the audio-gated render buffer)
 *   realtime_tools  The resolved realtime tool set the agent may call
 *
 * Emitter: `VoiceAgentSurface.tsx` mounts `<SurfaceRuntimeProvider>` and
 * builds the payload at trigger time via `createChatVoiceScope`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import type {
  VoiceActiveTurnScope,
  VoiceTurnScopeEntry,
} from "@/features/voice-agent/agent-context/voiceTranscriptScope";

/** Canonical surface name for the realtime voice chat route. */
export const CHAT_VOICE_SURFACE = "matrx-user/chat-voice";

const groups: SurfaceValueGroup[] = [
  {
    key: "voice_session",
    label: "Voice session",
    sortOrder: 100,
    description:
      "Which agent, voice, and preset are running, plus the durable conversation the transcript is written to.",
  },
  {
    key: "connection",
    label: "Connection & microphone",
    sortOrder: 200,
    description:
      "Live realtime-transport and microphone state — whether the agent is currently listening, thinking, or speaking.",
  },
  {
    key: "transcript",
    label: "Transcript",
    sortOrder: 300,
    description:
      "What has been said so far this session. Reports the full arrived transcript, not the audio-gated text currently painted on screen.",
  },
  {
    key: "realtime_tools",
    label: "Realtime tools",
    sortOrder: 400,
    description:
      "The tool set resolved for this surface + agent, as declared to the realtime model.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Voice session ─────────────────────────────────────────────────────
  {
    name: "session_preset",
    label: "Session preset",
    description:
      '"intro" on /chat/voice (the built-in introduction agent, fixed config) or "playground" on /chat/voice/playground (voice, instructions, and tools editable in the settings sheet). Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 300,
    group: "voice_session",
  },
  {
    name: "voice_agent_id",
    label: "Voice agent ID",
    description:
      "UUID of the `agx_agent` row driving this voice session (the built-in introduction agent on /chat/voice). Empty on the playground when the user is running ad-hoc constants-based config with no agent row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "voice_session",
  },
  {
    name: "voice_id",
    label: "Voice",
    description:
      'The xAI Realtime voice currently configured for the session ("ara", "eve", "leo", "rex", "sal"). Always populated — the slice seeds a default before the first connect.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 320,
    group: "voice_session",
  },
  {
    name: "voice_instructions",
    label: "Voice instructions",
    description:
      "The system instructions the realtime session was started with (from the agent record on /chat/voice, or the playground settings sheet). Always populated — empty string before config resolves. Bindable-only: an agent rarely needs another agent's prompt as automatic context.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 330,
    group: "voice_session",
  },
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the `cx_conversation` row this voice transcript is persisted into — the DURABLE handle for the session. Empty until the first turn completes and is written (the transcript writer creates the row lazily), and always empty for non-persisting presets.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
    group: "voice_session",
  },
  {
    name: "session_started_at_ms",
    label: "Session start time",
    description:
      "Epoch milliseconds at which the current realtime session connected. Absent before the user first taps the mic.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 13,
    sortOrder: 350,
    group: "voice_session",
  },

  // ── Connection & microphone ───────────────────────────────────────────
  {
    name: "connection_status",
    label: "Connection status",
    description:
      'Live session state: "idle" (not connected), "requesting-mic", "connecting", "listening", "thinking", "speaking", "interrupting", or "error". Always populated. This is the single value that tells an agent whether a voice conversation is actually in progress.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 400,
    group: "connection",
  },
  {
    name: "mic_muted",
    label: "Microphone muted",
    description:
      "True when the session is connected but microphone audio is being withheld from the model. Always populated — false when unmuted or idle.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 410,
    group: "connection",
  },
  {
    name: "connection_error",
    label: "Connection error",
    description:
      "The last transport/token/microphone failure as { code, message } (e.g. mic-permission-denied, connect-timeout, token-unauthorized). Absent when there is no outstanding error.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 140,
    sortOrder: 420,
    group: "connection",
  },
  {
    name: "total_interruptions",
    label: "Interruption count",
    description:
      "How many times this session the user talked over the assistant and cut its audio short. Always populated — zero before any interruption.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 430,
    group: "connection",
  },
  {
    name: "latency_summary",
    label: "Latency summary",
    description:
      "Response-latency rollup for the session as { p50_ms, p95_ms, count } — milliseconds from user speech-end to the first assistant audio byte. Always populated; nulls with count 0 before any sample. Bindable-only telemetry.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 60,
    autoContext: false,
    sortOrder: 440,
    group: "connection",
  },

  // ── Transcript ────────────────────────────────────────────────────────
  {
    name: "turn_count",
    label: "Turn count",
    description:
      "Number of conversational turns (user + assistant) recorded this session. Always populated — zero before the conversation starts.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 500,
    group: "transcript",
  },
  {
    name: "transcript_text",
    label: "Full transcript",
    description:
      'The whole session transcript as speaker-labelled plain text ("User: …" / "Assistant: …", blank-line separated), built from the full arrived text of every turn — NOT the audio-gated text currently visible on screen. Absent before anything has been said. Also emitted as the baseline `content` so surface-agnostic agents reach it.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 510,
    group: "transcript",
  },
  {
    name: "last_user_utterance",
    label: "Last user utterance",
    description:
      "Complete transcribed text of the most recent non-empty user turn. Absent before the user has spoken. This is what to bind for 'act on what I just said'.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 520,
    group: "transcript",
  },
  {
    name: "last_assistant_utterance",
    label: "Last assistant utterance",
    description:
      "Complete transcribed text of the most recent non-empty assistant turn, including any part that was cut off by an interruption but had already arrived. Absent before the assistant has spoken.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 530,
    group: "transcript",
  },
  {
    name: "active_turn",
    label: "In-flight turn",
    description:
      "The turn still being spoken/streamed right now as { id, role, text, started_at_ms }. Absent whenever no turn is pending — i.e. between turns and while idle. Its `text` is partial by nature and grows as deltas arrive.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 540,
    group: "transcript",
  },
  {
    name: "transcript_turns",
    label: "Transcript turns",
    description:
      "Every turn in order as { id, role, text, status, started_at_ms, ended_at_ms }, where status is pending | completed | interrupted. Always populated — empty array before the conversation starts. Bindable-only; bind `transcript_text` for prose or this for turn-level reasoning.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 7000,
    autoContext: false,
    sortOrder: 550,
    group: "transcript",
  },

  // ── Realtime tools ────────────────────────────────────────────────────
  {
    name: "realtime_tool_names",
    label: "Realtime tool names",
    description:
      "Names of the tools declared to the realtime model for this surface + agent (server-executed, client-executed, and xAI builtins alike). Always populated — empty array before the tool set resolves or when the agent has none.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 160,
    sortOrder: 600,
    group: "realtime_tools",
  },
  {
    name: "realtime_tools",
    label: "Realtime tool set",
    description:
      'The resolved tool set as { name, description, execution } per tool, where execution is "server" | "client" | "builtin". Always populated — empty array before resolution. Bindable-only; bind `realtime_tool_names` for the cheap version.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1800,
    autoContext: false,
    sortOrder: 610,
    group: "realtime_tools",
  },
];

export const chatVoiceManifest: SurfaceManifest = {
  surfaceName: CHAT_VOICE_SURFACE,
  readiness: "partial",
  readinessNote:
    "Manifest + SurfaceRuntimeProvider emitter landed; registry.ts entry, the /chat/voice route mapping (must sit ABOVE the /chat prefix), and the DB manifest sync are still pending.",
  label: "Voice Chat",
  urlPattern: "/chat/voice",
  intro: `<surface_intro>
You are on the Voice Chat surface: a full-screen, hands-free realtime voice conversation. The user is TALKING, not typing — there is no text composer, no attachments, and no document on this surface. The microphone is the only input, and the agent's reply is spoken aloud.
Read the values in tiers. Connection & microphone tells you whether a conversation is actually happening right now: connection_status "idle" means nothing is live, "listening"/"thinking"/"speaking" mean it is. Voice session identifies which agent and voice are running and, once conversation_id is set, where the transcript is durably stored. Transcript is what has been said: transcript_text is the whole conversation as speaker-labelled prose, last_user_utterance is the thing to act on for "do this with what I just said", and active_turn is a partial, still-arriving turn — never treat its text as final.
Turn status matters here in a way it does not in typed chat: a turn marked "interrupted" was cut off because the user spoke over the assistant, so its text is genuine but unfinished. Because the transcript comes from speech recognition, expect disfluencies, homophones, and missing punctuation; interpret generously and never quote it back as if it were written text.
</surface_intro>`,
  groups,
  // Baselines: `content` carries the full transcript so surface-agnostic
  // agents ("summarize this", "clean this up") work here with no remapping;
  // `context` is the standard escape valve. The selection triad is injected by
  // the registry but is never populated — this surface has no editable text.
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper for `matrx-user/chat-voice`.
 *
 * Required keys (no `?`) mirror every `alwaysAvailable: true` value above;
 * optional keys (`?`) mirror `alwaysAvailable: false`. Called at trigger time
 * by `VoiceAgentSurface`'s `<SurfaceRuntimeProvider getScope>`.
 */
export function createChatVoiceScope(values: {
  // alwaysAvailable: true → required
  session_preset: "intro" | "playground";
  voice_id: string;
  voice_instructions: string;
  connection_status: string;
  mic_muted: boolean;
  total_interruptions: number;
  latency_summary: { p50_ms: number | null; p95_ms: number | null; count: number };
  turn_count: number;
  transcript_turns: VoiceTurnScopeEntry[];
  realtime_tool_names: string[];
  realtime_tools: { name: string; description: string; execution: string }[];
  // alwaysAvailable: false → optional
  content?: string;
  context?: Record<string, unknown>;
  voice_agent_id?: string;
  conversation_id?: string;
  session_started_at_ms?: number;
  connection_error?: { code: string; message: string };
  transcript_text?: string;
  last_user_utterance?: string;
  last_assistant_utterance?: string;
  active_turn?: VoiceActiveTurnScope;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
