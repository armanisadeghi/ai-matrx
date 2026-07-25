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
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

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
];

export const chatManifest: SurfaceManifest = {
  surfaceName: "matrx-user/chat",
  label: "Chat",
  urlPattern: "/chat",
  intro: `<surface_intro>
You are on the live chat route — a threaded conversation between the user and an agent, with a composer for the user's next message.
Values arrive in six families: the conversation identity (id, title, driving agent), the active message the user explicitly targeted (current_message_*), the thread history (last turns + full transcript), the composer (draft text, attached resources, variable values), session state (streaming flag, status, effective model), and lean references to the conversation's working document and scratchpad.
Baselines mirror the composer: content/selection/text_before/text_after are the user's DRAFT, not the transcript — the transcript rides full_conversation_text / all_messages.
No value is guaranteed: launches also happen from the pre-conversation hero composer on /chat/new, where only the draft and agent exist. The working_document and scratchpad values are references only — their bodies belong to their own surfaces.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
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
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
