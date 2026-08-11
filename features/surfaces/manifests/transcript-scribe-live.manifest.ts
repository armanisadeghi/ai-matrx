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
  SurfaceWriteTarget,
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

/**
 * Write half of the 360 loop — what an agent may WRITE into a Scribe Live tab.
 *
 * THE BAR. This surface holds exactly ONE artifact a person authors: the
 * session's working document. Everything else it declares is identity, live
 * connection state, or the record of what was said. So the target list is the
 * document and nothing else, in the replace/append pair `agent-builder`
 * established for prose that is expensive to re-send.
 *
 * WHAT THESE ADD, given the realtime tools that already exist. The Live tab
 * ALREADY lets the client-side VOICE agent mutate this document
 * (`scribe_working_doc_append` / `_append_heading`, registered in
 * `../../transcript-studio/components/scribe/realtimeWorkingDocTools.ts`). Those
 * run inside the xAI realtime turn loop and are reachable only by the agent the
 * user is TALKING to. An agent launched from the header Agents popover is an
 * ordinary turn-based run with no realtime socket: it could already READ
 * `working_document_content` and had no way to write a word of it back. These
 * targets close that half of the loop for that second agent population, through
 * the same canonical thunk — and they add full REPLACEMENT, which the realtime
 * mutators deliberately never offered.
 *
 * What is deliberately NOT here:
 *   • `working_document_id`, `session_id`, `live_agent_id`,
 *     `voice_conversation_id` — identity and lineage.
 *   • `working_document_word_count` — derived from the body; writing it would
 *     be asserting a fact rather than changing one.
 *   • Everything in `connection` and `transcript`. Connection status, mic mute
 *     and the connection error are live DEVICE and session state — muting
 *     someone's microphone is not a copy edit, and starting or ending the
 *     conversation is not a value. The transcript, its per-turn record, the
 *     interruption count and the utterance values are the RECORD of what was
 *     actually said; writing them would forge it, the same input-vs-output line
 *     `voice-pad` drew around `transcript_entries`.
 *
 * NO PHASE GUARD, and that is the interesting contrast with the sibling voice
 * surface. `matrx-user/chat-voice` REFUSES its writes while a session is live,
 * because the voice and instructions there are consumed once, at connect. Here
 * the opposite is true: the working document is meant to change mid-session —
 * that IS the collaboration loop. `useWorkingDocumentDraft` merges remote edits
 * in whenever the user is not actively typing, and the live agent re-reads the
 * document into its instructions on the next session. A live-session guard
 * would break the feature rather than protect it.
 *
 * MODE + POLICY. `entity` + `ask`: the working document has no draft/save bar
 * of its own — only an autosaving editor — so there is no staging layer to land
 * in and `draft` would be a lie. Both handlers persist through
 * `updateWorkingDocumentContentThunk`, the same thunk the editor's debounced
 * autosave and the realtime mutators already call, and the confirm dialog names
 * the document before anything is written. Handlers in
 * `features/transcript-studio/hooks/useScribeLiveWriteHandlers.ts`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "working_document_content",
    label: "Working document",
    description:
      "REPLACES the entire body of this session's working document with the markdown you pass. This is a full replacement, not a merge: read `working_document_content` first and include everything you want kept, or use `append_working_document` when you only mean to add. Pass plain multi-line markdown with real line breaks — do not JSON-encode it or escape the newlines. Saved immediately through the same path the document editor's autosave uses, and it appears in the editor as soon as the user is not mid-keystroke. Refused when the session has no working document yet. Prefer appending unless the user actually asked for a rewrite — this one overwrites work.",
    valueType: "string",
    updatesValue: "working_document_content",
    mode: "entity",
    applyPolicy: "ask",
    group: "working_document",
    sortOrder: 100,
  },
  {
    name: "append_working_document",
    label: "Added to working document",
    description:
      "APPENDS the markdown you pass to the end of this session's working document, separated by a blank line. Nothing already in the document is touched or re-sent — pass only the new text, headings included if you want them. This is the safe default for 'write that down', 'add a section on X', or capturing something the user just said; use `working_document_content` only when the whole document is being rewritten. Plain multi-line markdown, not JSON. Saved immediately through the document's canonical save path. Refused when the session has no working document yet.",
    valueType: "string",
    updatesValue: "working_document_content",
    mode: "entity",
    applyPolicy: "ask",
    group: "working_document",
    sortOrder: 110,
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

You can also WRITE the working document — and only the working document. append_working_document adds a block to the end and is the right choice for almost everything ("write that down", "add a section on X", capturing what the user just said); working_document_content replaces the whole body and should be reserved for an actual rewrite the user asked for, because it overwrites their work. Read the document before you replace it. Both save immediately through the same path the editor's autosave uses, so the user sees the change in place — there is no staging step, which is why you are asked to confirm first. Writing while the conversation is live is expected here, not a problem. Everything else is read-only to you: the microphone and connection state are the user's device, and the spoken transcript is the record of what was said — do not try to write either.
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
  writeTargets,
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
