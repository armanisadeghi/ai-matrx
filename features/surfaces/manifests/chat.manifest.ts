/**
 * Surface manifest — Chat / conversation (`matrx-user/chat`).
 *
 * AI chat / conversation surfaces. The user sees a thread of messages with
 * an active agent, composes user messages, gets assistant responses (often
 * streaming), and can take actions against any message in the thread.
 *
 * Agents bound here typically operate on the last message, the user's
 * draft input, or the full conversation history. The `current_message_*`
 * family targets a specific message (e.g. the one the user right-clicked);
 * the `last_*` family auto-points at the most recent of each role.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

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
      "All messages in the active conversation joined into a single text block with role prefixes (e.g. `User: ...\\n\\nAssistant: ...`). Can be very large — bind with care.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 370,
    group: "thread",
  },
  {
    name: "all_messages",
    label: "All messages",
    description:
      "Array of `{ id, role, text, created_at }` for every message in the active conversation, in order. Empty array when the conversation has no messages.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 375,
    group: "thread",
  },

  // ── Composer / runtime state (400-449) ────────────────────────────────
  {
    name: "input_draft",
    label: "Input draft",
    description:
      "Current text in the chat composer (what the user has typed but not yet sent). Empty when the composer is empty or no conversation is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
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
// Write targets (2026-08-10) — the judgment bar, written down.
//
// Chat is a RECORD of a conversation wrapped around ONE authored field. That
// asymmetry decides the whole list:
//
//   YES — `input_draft`: the message the user has not sent yet. This is the
//   textbook "authored content an agent drafts better/faster" case: help me
//   phrase this, turn my notes into a question, extend what I started. The
//   user still presses send, so the draft target is fully reversible.
//
//   YES — `conversation_title`: an authored label, trivially derivable from
//   the transcript the agent can already read, and the one field on this
//   surface a user routinely leaves at its auto-generated default.
//
//   NO — SENDING the message. The send is the outward-facing act: it spends a
//   turn, bills a model, and (with the inbox modes) can steer or interrupt a
//   run in flight. The human press is the gate, exactly as `podcast-studio`
//   and `image-generate` kept Generate human.
//
//   NO — editing what was already said (`all_messages`, `last_user_message`,
//   `current_message_text`, `full_conversation_text`). Those are the RECORD of
//   what was actually said by whom. An agent rewriting them does not edit a
//   draft, it fabricates history — the captured-evidence line. Note the route
//   HAS a user-driven edit path ("Edit & resubmit" → fork / overwriteAndResend);
//   it stays a human affordance because the value of the record is that a human
//   wrote it.
//
//   NO — the run configuration (`added_tools`, `added_skills`, `model`,
//   `sandbox_binding`). Following `agent-builder`: changing what an agent may
//   REACH is a capability change, not a copy edit.
//
//   NO — `attached_resources`. The read half publishes lean `{id, block_type,
//   status}` refs of what is ALREADY attached, never the user's library, so an
//   agent could only guess UUIDs — the same reason `education-fastfire` left
//   its set picker and `education-assessment` its deck picker out.
//
//   NO — switching the bound agent (identity/provenance: `initial_agent_id` is
//   read-only by this feature's own model), and deleting/archiving a
//   conversation (destructive stays human).
//
//   NO — `working_document` / `scratchpad`. Lean refs here; their bodies ride
//   their own surfaces and belong to those surfaces' write targets.
//
//   NO — `variable_values` (added to this list 2026-08-11). It reads as the
//   tempting case — resolved agent-variable values look like fill-in-the-blank
//   authored content, and they are NOT capability governance (a variable is
//   substituted into a prompt; it does not change what a run may REACH). It
//   still fails an earlier test: THIS surface owns no editor for it. Every
//   component that dispatches `setUserVariableValue` (`AgentVariablesInline`,
//   `BoundVariableChips`, the `variable-input-variations/*` family,
//   `ChatAssistantVariableInputs`) lives outside `components/chat/`, and
//   `ChatRoomClient` only ever READS the value via `selectResolvedVariables`
//   to publish it — the read half even marks it bindable-only. A target here
//   would stage into state no one on this page can see or correct, which is
//   the "declared target with no canonical write path on this mount" trap.
//   It earns a target on whichever surface actually mounts a variable editor,
//   not on this one.
//
// PER-MOUNT POSTURE: `matrx-user/chat` has exactly ONE `SurfaceRuntimeProvider`
// — `ChatRoomClient`, which backs all three routes (/chat/new via
// ChatNewClient's landingContent, /chat/a/[agentId], /chat/[conversationId])
// and owns the conversation id both handlers key off. The surface name appears
// in three OTHER places, none of which mount a runtime and none of which
// therefore offer an agent anything: `RunSettingsEditor` and
// `RunControlsTabPanel` pass it to a v3 context menu over Chat Options (whose
// fields are run capability — see the NO above), and `NewChatLandingInput`
// passes it to its `EditableContextMenu`, and that composer already sits
// INSIDE ChatRoomClient's provider, so its draft is covered by `input_draft`
// through the same Redux key.
// ---------------------------------------------------------------------------

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "conversation_title",
    label: "Conversation title",
    description: `Renames the open conversation — the label it carries in the chat history sidebar. Value: a plain non-empty string, trimmed, at most ${CHAT_CONVERSATION_TITLE_MAX} characters; an empty or blank title is REFUSED, because clearing a conversation's name back to "Untitled" is a human decision. Saved IMMEDIATELY through the canonical rename path. Refused when the conversation has not been persisted yet — a brand-new chat on /chat/new or /chat/a/[agentId] holds a client-minted id and has no row to rename until its first turn finishes; read \`conversation_message_count\` first. This changes the label only and never touches a message.`,
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
    description: `Types text into THIS conversation's composer for the user to review and send. Value: { "text": string (1-${CHAT_INPUT_DRAFT_MAX} characters), "mode"?: ${CHAT_DRAFT_WRITE_MODES.map((m) => `"${m}"`).join(" | ")} } — "${CHAT_DRAFT_WRITE_MODES[0]}" (the default) swaps whatever is in the composer, "${CHAT_DRAFT_WRITE_MODES[1]}" adds after it on a new line, so read the \`input_draft\` value first if you mean to extend what the user already typed rather than discard it. This ONLY stages text: nothing is sent, no turn is spent, no run is steered or interrupted, and the user still presses send. It lands in the CONVERSATION's composer on the page — never in the message box of whatever agent run you are executing inside.`,
    valueType: "object",
    updatesValue: "input_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "composer",
    sortOrder: 400,
  },
];

export const chatManifest: SurfaceManifest = {
  surfaceName: "matrx-user/chat",
  readiness: "verified",
  label: "Chat",
  urlPattern: "/chat",
  intro: `<surface_intro>
You are on the live chat route — a threaded conversation between the user and an agent, with a composer for the user's next message.
Values arrive in seven families: the conversation identity (id, title, driving agent), the active message the user explicitly targeted (current_message_*), the thread history (last turns + full transcript), the composer (draft text, attached resources, variable values), session state (streaming flag, status, effective model), lean references to the conversation's working document and scratchpad, and the run configuration (how the user customized this run via Chat Options: added tools/skills, setting overrides, sandbox binding).
Baselines mirror the composer: content/selection/text_before/text_after are the user's DRAFT, not the transcript — the transcript rides full_conversation_text / all_messages.
No value is guaranteed: launches also happen from the pre-conversation hero composer on /chat/new, where only the draft and agent exist. The working_document and scratchpad values are references only — their bodies belong to their own surfaces.
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
