/**
 * Surface manifest — Chat / conversation (`matrx-user/chat`).
 *
 * The live chat route (/chat/new, /chat/a/[agentId], /chat/[conversationId]):
 * a threaded conversation between the person and an agent, with a composer
 * for the person's next message. ONE provider — `ChatRoomClient`.
 *
 * WHO THIS SURFACE SERVES: OUTSIDE agents only — an agent the person runs
 * from the header Agents menu into a window panel, sidebar or overlay while
 * the chat page is open. The page's OWN conversation never receives this
 * surface as context (its launcher passes `runtime: { surfaceName: null }`)
 * and is never offered its tools. So every value here describes SOMEONE
 * ELSE's conversation to the agent reading it, and every target changes it.
 *
 * The open conversation is THE record: `conversation` (identity + state) and
 * `transcript` (every loaded message with its tool calls) are passed whole up
 * front at the `record` tier; the older scalar values stay for bindings.
 * Agent guide: `features/surfaces/guides/chat.md`.
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
  ChatConversationRecord,
  ChatTranscriptEntry,
} from "@/features/agents/components/chat/agent-context/chatTranscriptScope";

// ---------------------------------------------------------------------------
// Write-contract vocabulary — ONE definition, imported by both the manifest
// descriptions below (what an agent is told) and the handlers in
// `ChatRoomClient.tsx` (what is actually accepted), so the advertised
// contract and the enforced contract can never drift apart.
// ---------------------------------------------------------------------------

/** How a composer draft write lands: swap the buffer, or add after it. */
export const CHAT_DRAFT_WRITE_MODES = ["replace", "append"] as const;
export type ChatDraftWriteMode = (typeof CHAT_DRAFT_WRITE_MODES)[number];

/** Value shape the `input_draft` write target accepts. */
export interface ChatInputDraftWrite {
  text: string;
  mode?: ChatDraftWriteMode;
}

/** Enum check for `ChatInputDraftWrite.mode`, against the vocabulary above. */
export function isChatDraftWriteMode(
  value: unknown,
): value is ChatDraftWriteMode {
  return (CHAT_DRAFT_WRITE_MODES as readonly unknown[]).includes(value);
}

/**
 * Upper bound on a staged composer draft. The composer itself has no
 * maxLength (a human can paste anything), so this is a write-path guard
 * against a model dumping a document into a chat box rather than a limit the
 * user shares — generous enough for a long authored message.
 */
export const CHAT_INPUT_DRAFT_MAX = 20_000;

/**
 * Upper bound on an agent-written conversation title. `chat.conversation.title`
 * is an unbounded text column and the sidebar's own rename field sets no
 * maxLength, so this is the write path's own bound: a title is a SIDEBAR LABEL,
 * and past a couple of hundred characters it is prose in the wrong place.
 */
export const CHAT_CONVERSATION_TITLE_MAX = 200;

/** Upper bound on one message's text written by `update_messages`. */
export const CHAT_MESSAGE_TEXT_MAX = 100_000;

/** Most messages one `update_messages` / `delete_messages` write may name. */
export const CHAT_MESSAGES_PER_WRITE = 25;

/** Longest tool-call arguments/result excerpt in `transcript` (characters). */
export const CHAT_TRANSCRIPT_TOOL_EXCERPT_MAX = 300;

const groups: SurfaceValueGroup[] = [
  {
    key: "conversation",
    label: "Conversation",
    sortOrder: 100,
    description: "Which conversation is open and which agent drives it.",
  },
  {
    key: "active_message",
    label: "Active message",
    sortOrder: 200,
    description:
      "The specific message the user is acting on (clicked / right-clicked).",
  },
  {
    key: "thread",
    label: "Thread",
    sortOrder: 300,
    description:
      "The message history: last turns of each role and the full transcript.",
  },
  {
    key: "composer",
    label: "Composer",
    sortOrder: 400,
    description:
      "The user's in-progress next message: draft text, attached resources, variable values.",
  },
  {
    key: "session_state",
    label: "Session state",
    sortOrder: 500,
    description:
      "Runtime execution state of the conversation: streaming, status, effective model.",
  },
  {
    key: "context_documents",
    label: "Context documents",
    sortOrder: 600,
    description:
      "References to the conversation's working document and scratchpad (lean refs, not bodies).",
  },
  {
    key: "run_configuration",
    label: "Run configuration",
    sortOrder: 700,
    description:
      "How the user customized this run via Chat Options: added tools/skills, setting overrides, sandbox binding.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── THE record: the open conversation + its transcript (290-299) ──────
  {
    name: "conversation",
    label: "Conversation",
    description:
      "The open conversation, whole: { id, title, agent_id, agent_name, model, status, is_streaming, message_count, older_messages_not_loaded }. `status` is the run status (\"ready\", \"running\", \"streaming\", \"complete\", \"error\", \"cancelled\"…); `message_count` counts the loaded messages in `transcript`; `older_messages_not_loaded` is true when the page shows only the newest messages and earlier ones exist. message_count 0 means the conversation has not been saved yet (a fresh chat before its first turn completes). Omitted until a conversation is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    inlineUpTo: 1000,
    sortOrder: 290,
    group: "conversation",
  },
  {
    name: "transcript",
    label: "Transcript",
    description: `Every loaded message of the open conversation, oldest first: [{ id, role ("user" | "assistant" | "system"), text, created_at, tool_calls: [{ id, name, arguments_excerpt, status, result_excerpt }], streaming?: true, edited?: true }]. \`text\` is the message as the page shows it — patch it with update_messages. Tool calls sit on the assistant message that made them; \`arguments_excerpt\` and \`result_excerpt\` are the first ${CHAT_TRANSCRIPT_TOOL_EXCERPT_MAX} characters as one line (marked … when cut), so they tell you WHAT was called and roughly what came back, not the full payload. \`streaming: true\` = still being written (cannot be edited). Only the newest messages are loaded on open (see conversation.older_messages_not_loaded). [] for a conversation with no messages; omitted until one is open.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    inlineUpTo: 8000,
    sortOrder: 295,
    group: "thread",
  },

  // ── Conversation (300-329) ────────────────────────────────────────────
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the conversation the user is viewing. On /chat/[conversationId] this is the persisted row id; on /chat/new and /chat/a/[agentId] it is the launcher's client-minted UUID (not yet persisted). Empty when the launch came from the pre-conversation hero composer.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "conversation",
  },
  {
    name: "conversation_title",
    label: "Conversation title",
    description:
      "Auto-generated or user-set title of the conversation. Empty when not set or no conversation is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
    group: "conversation",
  },
  {
    name: "conversation_message_count",
    label: "Message count",
    description:
      "Total number of messages (user + assistant) in the active conversation. Zero when no conversation is active.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "conversation",
  },
  {
    name: "conversation_agent_id",
    label: "Active agent ID",
    description:
      "UUID of the agent driving the active conversation. Empty when no conversation is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 325,
    group: "conversation",
  },
  {
    name: "conversation_agent_name",
    label: "Active agent name",
    description:
      "Display name of the agent driving the conversation. Empty when no conversation is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 328,
    group: "conversation",
  },

  // ── Targeted message (the one the user clicked / right-clicked) (340-359) ──
  {
    name: "current_message_id",
    label: "Current message ID",
    description:
      "ID of the specific message the user is acting on — usually the one a context menu was opened on, or the user clicked. Empty when no message is targeted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
    group: "active_message",
  },
  {
    name: "current_message_role",
    label: "Current message role",
    description:
      '"user", "assistant", "system", or "tool". Empty when no message is targeted.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 345,
    group: "active_message",
  },
  {
    name: "current_message_text",
    label: "Current message text",
    description:
      "Full text body of the targeted message. Empty when no message is targeted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 350,
    group: "active_message",
  },

  // ── Last messages (auto-pointed at the most recent of each role) (360-379) ──
  {
    name: "last_user_message",
    label: "Last user message",
    description:
      "Text of the most recent user message in the active conversation. Empty when the conversation has no user messages yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 360,
    group: "thread",
  },
  {
    name: "last_assistant_message",
    label: "Last assistant message",
    description:
      "Text of the most recent assistant message (excluding system / tool turns). Empty when the agent has not yet replied.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 365,
    group: "thread",
  },
  {
    name: "full_conversation_text",
    label: "Full conversation",
    description:
      "All messages in the active conversation joined into a single text block with role prefixes (e.g. `User: ...\\n\\nAssistant: ...`). Can be very large — bind with care. Bindable-only: `transcript` carries the same messages (with ids and tool calls) up front.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 370,
    group: "thread",
  },
  {
    name: "all_messages",
    label: "All messages",
    description:
      "Array of `{ id, role, text, created_at }` for every loaded message in the active conversation, in order (tool stubs included). Bindable-only: `transcript` is the same list with tool calls, passed up front.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 375,
    group: "thread",
  },

  // ── Composer / runtime state (400-449) ────────────────────────────────
  {
    name: "input_draft",
    label: "Input draft",
    description:
      "Current text in the chat composer (what the person has typed but not yet sent) — what an input_draft patch anchors against. Omitted when the composer is empty or no conversation is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    inlineUpTo: 1000,
    sortOrder: 400,
    group: "composer",
  },
  {
    name: "attached_resources",
    label: "Attached resources",
    description:
      "Lean references to resources attached to the composer for the NEXT message (files, images, notes, tasks, webpages, …): one entry per chip with { id, block_type, status }. Empty when nothing is attached.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 405,
    group: "composer",
  },
  {
    name: "variable_values",
    label: "Variable values",
    description:
      "The instance's fully resolved agent-variable values (user-set > scope-resolved > defaults), keyed by variable name. Empty when the agent declares no variables. Bindable-only — resolvable from the conversation, so not auto-shipped.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 408,
    group: "composer",
  },
  {
    name: "is_streaming",
    label: "Assistant is streaming",
    description:
      "True when the agent is currently producing a streaming response. Lets actions defer or refuse until the response settles.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 410,
    group: "session_state",
  },
  {
    name: "conversation_status",
    label: "Conversation status",
    description:
      'Execution status of the active conversation: "draft", "ready", "running", "streaming", "paused", "complete", "error", "cancelled". Empty when no conversation is active.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 420,
    group: "session_state",
  },
  {
    name: "model",
    label: "Effective model",
    description:
      "The model id currently in effect for this conversation (agent base settings merged with any instance overrides). Empty when the instance's settings haven't hydrated yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 430,
    group: "session_state",
  },

  // ── Context documents (460-479) — lean refs, never the bodies ─────────
  {
    name: "working_document",
    label: "Working document",
    description:
      "Lean reference to the conversation's working document: { enabled, title, materialized, version, char_count }. The body is NOT included — it rides its own surface (matrx-user/working-document). Empty when the conversation has no working-document entry.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 460,
    group: "context_documents",
  },
  {
    name: "scratchpad",
    label: "Scratchpad",
    description:
      "Lean reference to the user's scratchpad on this conversation: { enabled, title, char_count, active_scratchpad_id, attached_scratchpad_ids }. The body is NOT included — it rides its own surface (matrx-user/scratchpad). Empty when no scratchpad is loaded for the conversation.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 470,
    group: "context_documents",
  },

  // ── Run configuration (500-539) — Chat Options customization ──────────
  {
    name: "added_tools",
    label: "Added tools",
    description:
      "Names of tools the user added to this run via Chat Options, on top of the agent's own tools. Empty array when none were added. Bindable-only — the composite run_configuration ships automatically.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 500,
    group: "run_configuration",
  },
  {
    name: "added_skills",
    label: "Added skills",
    description:
      "Names of skills the user added to this run via Chat Options, merged on top of the agent's skill tiers. Empty array when none were added. Bindable-only — the composite run_configuration ships automatically.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 505,
    group: "run_configuration",
  },
  {
    name: "sandbox_binding",
    label: "Sandbox binding",
    description:
      "Lean reference to the sandbox this conversation would route into: { row_id, kind, name, source }. Reflects the stored binding/seed, NOT a liveness check. Empty when no sandbox is bound. Bindable-only — the composite run_configuration ships automatically.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    autoContext: false,
    sortOrder: 510,
    group: "run_configuration",
  },
  {
    name: "run_configuration",
    label: "Run configuration",
    description:
      "Composite of the user's Chat Options customization for this run: { added_tools, added_skills, disable_tool_injection, surface_override, overridden_settings, model_override, sandbox, debug }. Empty when the run has no customization (all defaults).",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 350,
    sortOrder: 520,
    group: "run_configuration",
  },
];

// ---------------------------------------------------------------------------
// Write targets — the judgment bar, written down (rewritten 2026-09-27).
//
// ARMAN'S RULING (2026-09-27), which replaces the 2026-08-10 "NO — editing
// what was already said" line: "Any agent who runs on the page in a window
// panel or something else must have full context of it, including the
// conversation id, the messages, tool calls and all of that. Provide really
// great tools for the agent to be able to modify the assistant messages using
// patch and also the user message, or to take various actions, and also update
// things in the user message input."
//
// The agents these serve are OUTSIDE agents. The page's own conversation is
// never offered them (launcher `surfaceName: null` + the provider's
// `ownConversationId`), so no run edits its own history. Every target is
// `ask`: the person approves each write on a card, and every one goes through
// the SAME canonical function the page's own button calls — never a parallel
// write:
//
//   update_messages   — user message: `editMessageText` (the "Save only" edit);
//                       assistant message: `saveAnswerEdit` (the in-place answer
//                       editor's save). Both end in `cx_message_edit`, which
//                       archives the prior text into `content_history`, marks
//                       the row edited and busts the conversation cache.
//   delete_messages   — `deleteMessage` (the message menu's "Delete here").
//   regenerate_last_answer — `regenerateAnswer` (the answer menu's Regenerate).
//   fork_conversation — `forkConversation` + `promptForkOutcome` (Fork here).
//   stop_response     — `cancelExecution` (the composer's Stop button).
//   send_draft        — `smartExecute` (the composer's Send button).
//   input_draft       — `setUserInputText` (the composer's own keystrokes).
//   conversation_title — `renameConversation` (the sidebar's rename).
//
// STILL NO targets for: the run configuration (added tools/skills, model,
// sandbox — capability, not content); attaching resources or setting variable
// values (the agent can see no library ids to name, and this page mounts no
// variable editor); switching the bound agent; deleting the conversation;
// Edit & resubmit (a composition of update_messages + regenerate the agent can
// do in two approved steps).
// ---------------------------------------------------------------------------

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "update_messages",
    label: "Edit messages",
    description: `Changes the text of past messages in this conversation, user or assistant, SAVED IMMEDIATELY after the person approves. Value: a JSON ARRAY (1-${CHAT_MESSAGES_PER_WRITE}) of { "message_id": string, "text": string } (the whole new text) OR { "message_id": string, "patch": { "old_str": string, "new_str": string } } (replace exactly one occurrence of old_str in the message's current text; new_str "" deletes it). Ids and current text come from the \`transcript\` value. Prefer patch for any change smaller than the whole message. Refused before the card, with EVERY problem listed: an id not in the transcript, a message still streaming, a system/tool message, an old_str that is missing or matches more than once, an empty result, a repeated id. What it changes: the message's text for everyone who views this conversation (the previous text is kept in the message's edit history). A user-message edit is what the model sees from the next turn on; an assistant-message edit is too, unless the organization turned off "The model sees edited answers". Nothing is re-run and no turn is spent. Returns the edited ids.`,
    valueType: "array",
    updatesValue: "transcript",
    mode: "entity",
    applyPolicy: "ask",
    group: "thread",
    sortOrder: 295,
  },
  {
    name: "delete_messages",
    label: "Delete messages",
    description: `Deletes messages from this conversation, SAVED IMMEDIATELY after approval. Value: a JSON ARRAY (1-${CHAT_MESSAGES_PER_WRITE}) of message ids, or of { "message_id": string }, from the \`transcript\` value. What is lost: each message disappears from the conversation for everyone, together with the tool calls it made and what they produced, and the model no longer sees it on later turns; the page offers no undo. Later messages keep their places. Refused before the card: an unknown id, a message still streaming, a repeated id. Prefer update_messages when the text only needs fixing.`,
    valueType: "array",
    updatesValue: "transcript",
    mode: "entity",
    applyPolicy: "ask",
    group: "thread",
    sortOrder: 296,
  },
  {
    name: "regenerate_last_answer",
    label: "Regenerate last answer",
    description: `Asks this conversation's agent to answer its LAST question again. Value: { "message_id": "<id of the latest assistant message in transcript>" }. The current answer (and anything after that question) is archived, not deleted, and the conversation's agent runs again: this SPENDS A TURN (model cost) and the new answer streams into the page. Only the latest answer can be regenerated; refused while a response is streaming.`,
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    group: "thread",
    sortOrder: 297,
  },
  {
    name: "fork_conversation",
    label: "Fork conversation",
    description: `Branches this conversation at a message: a NEW conversation is created holding every message up to and including that one (with their tool calls); the original is untouched. Value: { "message_id": "<id from transcript>" }. Nothing is run and no turn is spent. After it lands the person is asked whether to open the new branch. Returns the new conversation's id.`,
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
    group: "thread",
    sortOrder: 298,
  },
  {
    name: "stop_response",
    label: "Stop response",
    description: `Stops the response this conversation's agent is writing right now — the same as the person pressing Stop. Value: true. What was already written stays; the rest of that answer is never produced. Refused when nothing is running (read conversation.is_streaming).`,
    valueType: "boolean",
    mode: "entity",
    applyPolicy: "ask",
    group: "session_state",
    sortOrder: 410,
  },
  {
    name: "conversation_title",
    label: "Conversation title",
    description: `Renames the open conversation — the label it carries in the chat history sidebar. Value: a plain non-empty string, trimmed, at most ${CHAT_CONVERSATION_TITLE_MAX} characters; an empty or blank title is REFUSED, because clearing a conversation's name back to "Untitled" is a human decision. Saved IMMEDIATELY through the canonical rename path. Refused when the conversation has not been saved yet — a brand-new chat holds a client-minted id and has no row to rename until its first turn finishes (conversation.message_count 0). This changes the label only and never touches a message.`,
    valueType: "string",
    updatesValue: "conversation_title",
    mode: "entity",
    applyPolicy: "ask",
    group: "conversation",
    sortOrder: 310,
  },
  {
    name: "input_draft",
    label: "Composer draft",
    description: `Writes into THIS conversation's composer (the person's next, unsent message) for them to review. Value: { "text": string, "mode"?: ${CHAT_DRAFT_WRITE_MODES.map((m) => `"${m}"`).join(" | ")} } — "replace" (the default) swaps the whole draft, "append" adds after it on a new line — OR { "patch": { "old_str": string, "new_str": string } } to change one exact occurrence inside the current draft (read the \`input_draft\` value first; refused when the draft is empty or old_str is missing or ambiguous). Result at most ${CHAT_INPUT_DRAFT_MAX} characters. NOTHING is sent and no turn is spent: the person still presses Send (or approves send_draft). It lands in the page's composer, never in the message box of the run you are executing inside.`,
    valueType: "object",
    updatesValue: "input_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "composer",
    sortOrder: 400,
  },
  {
    name: "send_draft",
    label: "Send the draft",
    description: `Sends what is in the composer now as the person's next message, exactly as pressing Send does — this SPENDS A TURN: the conversation's agent answers it (model cost). Value: true. Refused when the draft is empty or a response is still streaming. Stage the text with input_draft first; the person approves the send on its own card.`,
    valueType: "boolean",
    mode: "entity",
    applyPolicy: "ask",
    group: "composer",
    sortOrder: 402,
  },
];

export const chatManifest: SurfaceManifest = {
  surfaceName: "matrx-user/chat",
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "The live chat route: one conversation between the person and an agent, its full transcript with tool calls, and the composer for the next message. Outside agents can read all of it and edit messages, the draft and the run.",
  // Chat is the universal conversation host: every agent may be selected here,
  // so defaults and surface bindings must never masquerade as a page roster.
  agentRosterMode: "universal",
  readiness: "partial",
  readinessNote:
    "Proven on production 2026-09-27 (conversation 5058f5aa…): the read probe on /chat/<id> supplies conversation and transcript with no undeclared keys; an outside agent in a Chat window patched an assistant message through update_messages (row edited, prior text in content_history), wrote and then patched input_draft, and ran input_draft + send_draft (one new turn); a list with a missing old_str and an unknown id was refused before the card with both problems; the chat's own turns were offered no surface tool. The read gap is closed (2026-09-27, lead): the Agents menu on this universal page now offers "Run an agent on this page"; an agent run from it answered "what is this conversation about, which tools were called" for all 12 messages with ZERO context lookups, and patched an assistant message (one approval; DB row edited, prior text in content_history). NOT proven live yet: delete_messages, regenerate_last_answer, fork_conversation, stop_response and conversation_title (new contract).",
  guide: "features/surfaces/guides/chat.md",
  label: "Chat",
  urlPattern: "/chat",
  intro: `<surface_intro>
You are an OUTSIDE agent looking at someone else's live chat: a conversation between the person and another agent. You are not that agent and this is not your conversation.
Everything is up front: \`conversation\` (id, title, agent, model, status, streaming, message count) and \`transcript\` (every loaded message with id, role, text and its tool calls). Do not look them up again.
To fix or rewrite past messages use update_messages (prefer a patch); to remove them delete_messages. To help with the person's next message use input_draft (text, append, or patch) — it sends nothing. Actions: regenerate_last_answer and send_draft each spend a turn; stop_response stops a running answer; fork_conversation branches; conversation_title renames.
Every write asks the person first. Do not use generic context or scope tools for this conversation's messages.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** Lean composer-attachment entry emitted in `attached_resources`. */
export interface ChatAttachedResourceEntry {
  id: string;
  block_type: string;
  status: string;
}

/** Lean working-document reference emitted in `working_document`. */
export interface ChatWorkingDocumentRef {
  enabled: boolean;
  title: string;
  materialized: boolean;
  version: number;
  char_count: number;
}

/** Lean scratchpad reference emitted in `scratchpad`. */
export interface ChatScratchpadRef {
  enabled: boolean;
  title: string;
  char_count: number;
  active_scratchpad_id: string | null;
  attached_scratchpad_ids: string[];
}

/** Lean sandbox-binding reference emitted in `sandbox_binding` (stored ref, not liveness-checked). */
export interface ChatSandboxBindingRef {
  row_id: string;
  kind: string | null;
  name: string | null;
  source: "conversation" | "surface-seed" | "editor-seed";
}

/** Composite Chat Options customization emitted in `run_configuration`. */
export interface ChatRunConfigurationRef {
  added_tools: string[];
  added_skills: string[];
  disable_tool_injection: boolean;
  surface_override: string | null;
  /** Keys of instance-level LLM setting overrides (e.g. ["model", "temperature"]). */
  overridden_settings: string[];
  model_override: string | null;
  sandbox: ChatSandboxBindingRef | null;
  debug: boolean;
}

export function createChatScope(values: {
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
  conversation?: ChatConversationRecord;
  transcript?: ChatTranscriptEntry[];
  conversation_id?: string;
  conversation_title?: string;
  conversation_message_count?: number;
  conversation_agent_id?: string;
  conversation_agent_name?: string;
  current_message_id?: string;
  current_message_role?: string;
  current_message_text?: string;
  last_user_message?: string;
  last_assistant_message?: string;
  full_conversation_text?: string;
  all_messages?: Array<{ id: string; role: string; text: string; created_at?: string }>;
  input_draft?: string;
  attached_resources?: ChatAttachedResourceEntry[];
  variable_values?: Record<string, unknown>;
  is_streaming?: boolean;
  conversation_status?: string;
  model?: string;
  working_document?: ChatWorkingDocumentRef;
  scratchpad?: ChatScratchpadRef;
  added_tools?: string[];
  added_skills?: string[];
  sandbox_binding?: ChatSandboxBindingRef;
  run_configuration?: ChatRunConfigurationRef;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
