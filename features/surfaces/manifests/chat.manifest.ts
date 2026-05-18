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
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Active conversation (300-329) ─────────────────────────────────────
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the conversation the user is viewing. Empty when no conversation is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
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
  },
];

export const chatManifest: SurfaceManifest = {
  surfaceName: "matrx-user/chat",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
};

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
  is_streaming?: boolean;
  conversation_status?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
