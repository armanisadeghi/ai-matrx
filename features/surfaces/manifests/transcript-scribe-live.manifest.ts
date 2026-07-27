/**
 * Surface manifest — Scribe Live (`matrx-user/transcript-scribe-live`).
 *
 * The "Live" tab inside a Scribe studio session (`/transcripts/scribe/:sessionId`),
 * rendered by `features/transcript-studio/components/scribe/ScribeLiveScreen.tsx`:
 * a hands-free realtime voice conversation with the built-in Scribe Live agent,
 * scoped to THIS session's working document. The agent can read the document
 * (injected into its instructions) and mutate it through client-executed
 * realtime tools.
 *
 * The surface name was hardcoded in `ScribeLiveScreen` with no manifest since
 * 2026-06; it has been load-bearing as the realtime tool-resolution key
 * (migrations/scribe_live_agent.sql seeds the `ui_surface` row). This manifest
 * makes it code-first.
 *
 * WHY NOT `inheritsFrom: "matrx-user/transcript-scribe"` (the studio):
 *
 *  1. The studio manifest declares NO own values (only registry baselines) and
 *     has no scope emitter — its rich per-recording context reaches the text
 *     assistant through `smartExecute` instance-context entries, never through
 *     a surface scope. Inheriting would import an empty vocabulary.
 *  2. What inheritance WOULD import is the studio's `assistant` agent role
 *     (defaulting to the seeded TEXT audio assistant) and its `dictionary` /
 *     `session_defaults` config namespaces. Live runs a *realtime voice* agent
 *     over a WebSocket; honoring a text-agent role default here would
 *     misresolve, and nothing on this screen reads surface config.
 *  3. `migrations/voice_surface_tool_parity.sql` deliberately set this row's
 *     `parent_surface_name`/`executor_name` for parity with the sibling voice
 *     surface, NOT with the studio.
 *
 * So this is a standalone sibling of the studio that happens to share its
 * route. The two surfaces are distinguished by the active tab, not the URL —
 * which is exactly why `route-to-surface.ts` must keep mapping
 * `/transcripts/scribe` to the studio: route resolution cannot see the tab.
 *
 * Curated groups (band 0-899):
 *
 *   session_identity   Which studio session this live conversation belongs to
 *   working_document   The durable `studio_documents` row the conversation is about
 *   connection         Live WebSocket + microphone state
 *   transcript         What has been said (durable arrived text — see
 *                      voiceTranscriptScope.ts)
 *
 * Emitter: `ScribeLiveScreen.tsx` mounts `<SurfaceRuntimeProvider>` and builds
 * the payload at trigger time via `createTranscriptScribeLiveScope`. Because
 * it is a nested provider inside the studio shell, its scope wins while the
 * Live tab is mounted (deepest provider wins, by design).
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

/** Canonical surface name for the Scribe Live voice tab. */
export const TRANSCRIPT_SCRIBE_LIVE_SURFACE =
  "matrx-user/transcript-scribe-live";

const groups: SurfaceValueGroup[] = [
  {
    key: "session_identity",
    label: "Studio session",
    sortOrder: 100,
    description:
      "The Scribe studio session this live voice conversation is scoped to, and the agent driving it.",
  },
  {
    key: "working_document",
    label: "Working document",
    sortOrder: 200,
    description:
      "The session's single working document — the durable artifact the whole conversation exists to build.",
  },
  {
    key: "connection",
    label: "Connection & microphone",
    sortOrder: 300,
    description:
      "Live realtime-transport and microphone state — whether the agent is currently listening, thinking, or speaking.",
  },
  {
    key: "transcript",
    label: "Transcript",
    sortOrder: 400,
    description:
      "What has been said in this live conversation. Reports the full arrived transcript, not the audio-gated text currently painted on screen.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Studio session ────────────────────────────────────────────────────
  {
    name: "session_id",
    label: "Studio session ID",
    description:
      "UUID of the `studio_sessions` row this Live tab belongs to, taken from the route. Always populated — the Live tab cannot render without a session.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "session_identity",
  },
  {
    name: "live_agent_id",
    label: "Live agent ID",
    description:
      "UUID of the built-in Scribe Live agent whose realtime tool set drives this conversation. Always populated — this surface runs one fixed agent (it is not user-selectable today).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "session_identity",
  },
  {
    name: "voice_conversation_id",
    label: "Voice conversation ID",
    description:
      "UUID of the `cx_conversation` row this live transcript is persisted into. Empty until the first turn completes and is written. Note the studio itself — not this conversation — is the system of record for the session's content.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "session_identity",
  },

  // ── Working document ──────────────────────────────────────────────────
  {
    name: "working_document_id",
    label: "Working document ID",
    description:
      "UUID of the session's `studio_documents` working-document row. Empty until the document is created (a session starts without one).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "working_document",
  },
  {
    name: "working_document_content",
    label: "Working document",
    description:
      "Full markdown body of the session's working document, as persisted in `studio_documents` — the durable source of truth for what the user has built so far. Absent when no document exists yet or it is still empty. This is the same text injected into the live agent's instructions, so it is what the voice agent already knows.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 410,
    group: "working_document",
  },
  {
    name: "working_document_word_count",
    label: "Working document word count",
    description:
      "Word count of the persisted working-document body. Always populated — zero when the document is missing or empty. Lets an agent judge how far along the session is without pulling the whole body.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 420,
    group: "working_document",
  },

  // ── Connection & microphone ───────────────────────────────────────────
  {
    name: "connection_status",
    label: "Connection status",
    description:
      'Live session state: "idle" (not connected), "requesting-mic", "connecting", "listening", "thinking", "speaking", "interrupting", or "error". Always populated. Tells an agent whether a voice conversation is actually in progress on this tab.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 500,
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
    sortOrder: 510,
    group: "connection",
  },
  {
    name: "connection_error",
    label: "Connection error",
    description:
      "The last transport/token/microphone failure as { code, message } (e.g. mic-permission-denied, service-unavailable). Absent when there is no outstanding error.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 140,
    sortOrder: 520,
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
    sortOrder: 530,
    group: "connection",
  },

  // ── Transcript ────────────────────────────────────────────────────────
  {
    name: "turn_count",
    label: "Turn count",
    description:
      "Number of conversational turns (user + assistant) recorded in this live conversation. Always populated — zero before it starts.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 600,
    group: "transcript",
  },
  {
    name: "transcript_text",
    label: "Full transcript",
    description:
      'The whole live conversation as speaker-labelled plain text ("User: …" / "Assistant: …", blank-line separated), built from the full arrived text of every turn — NOT the audio-gated text currently visible on screen. Absent before anything has been said. Distinct from the session\'s RECORDED transcript segments, which the Record tab owns.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 610,
    group: "transcript",
  },
  {
    name: "last_user_utterance",
    label: "Last user utterance",
    description:
      "Complete transcribed text of the most recent non-empty user turn. Absent before the user has spoken. Bind this for 'do that with what I just said'.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 620,
    group: "transcript",
  },
  {
    name: "last_assistant_utterance",
    label: "Last assistant utterance",
    description:
      "Complete transcribed text of the most recent non-empty assistant turn, including any part cut off by an interruption but already arrived. Absent before the assistant has spoken.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 630,
    group: "transcript",
  },
  {
    name: "active_turn",
    label: "In-flight turn",
    description:
      "The turn still being spoken/streamed right now as { id, role, text, started_at_ms }. Absent whenever no turn is pending. Its `text` is partial by nature and grows as deltas arrive.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 640,
    group: "transcript",
  },
  {
    name: "transcript_turns",
    label: "Transcript turns",
    description:
      "Every turn in order as { id, role, text, status, started_at_ms, ended_at_ms }, where status is pending | completed | interrupted. Always populated — empty array before the conversation starts. Bindable-only; bind `transcript_text` for prose.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 7000,
    autoContext: false,
    sortOrder: 650,
    group: "transcript",
  },
];

export const transcriptScribeLiveManifest: SurfaceManifest = {
  surfaceName: TRANSCRIPT_SCRIBE_LIVE_SURFACE,
  readiness: "partial",
  readinessNote:
    "Manifest + SurfaceRuntimeProvider emitter landed; registry.ts entry and DB manifest sync pending. No route mapping is possible — this is a TAB inside /transcripts/scribe/:sessionId, so route resolution correctly keeps returning the studio surface.",
  label: "Scribe Live",
  urlPattern: "/transcripts/scribe/:sessionId",
  intro: `<surface_intro>
You are on Scribe Live: the hands-free voice tab of a transcription studio session. The user is TALKING to a realtime agent about the material they have been capturing, and the entire point of the conversation is to shape ONE artifact — the session's working document.
Treat working_document_content as the durable source of truth for what the user has built so far; it is the persisted studio_documents body, and it is the same text the live voice agent already has in its instructions. working_document_word_count is the cheap way to tell whether the session has barely started or is well along. Do not confuse this document with the session's recorded transcript segments — those belong to the Record tab and are not on this surface.
The Transcript group is the SPOKEN conversation, not the recordings: transcript_text is the whole exchange as prose, last_user_utterance is the thing to act on for "do that with what I just said", and active_turn is partial and still arriving — never treat its text as final. A turn marked "interrupted" was cut off because the user spoke over the assistant, so its text is genuine but unfinished.
Because the transcript comes from speech recognition, expect disfluencies, homophones, and missing punctuation. Interpret generously; never quote it back as if it were written text.
</surface_intro>`,
  groups,
  // Baselines: `content` carries the working document (the artifact a generic
  // "clean this up" / "summarize this" agent should act on here — NOT the
  // chatter about it); `context` is the standard escape valve. The selection
  // triad is registry-injected but never populated — this tab has no editable
  // text of its own.
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper for `matrx-user/transcript-scribe-live`.
 *
 * Required keys (no `?`) mirror every `alwaysAvailable: true` value above;
 * optional keys (`?`) mirror `alwaysAvailable: false`. Called at trigger time
 * by `ScribeLiveScreen`'s `<SurfaceRuntimeProvider getScope>`.
 */
export function createTranscriptScribeLiveScope(values: {
  // alwaysAvailable: true → required
  session_id: string;
  live_agent_id: string;
  working_document_word_count: number;
  connection_status: string;
  mic_muted: boolean;
  total_interruptions: number;
  turn_count: number;
  transcript_turns: VoiceTurnScopeEntry[];
  // alwaysAvailable: false → optional
  content?: string;
  context?: Record<string, unknown>;
  voice_conversation_id?: string;
  working_document_id?: string;
  working_document_content?: string;
  connection_error?: { code: string; message: string };
  transcript_text?: string;
  last_user_utterance?: string;
  last_assistant_utterance?: string;
  active_turn?: VoiceActiveTurnScope;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
