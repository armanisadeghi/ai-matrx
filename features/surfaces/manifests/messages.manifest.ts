/**
 * Surface manifest — Messages inbox (`matrx-user/messages`).
 *
 * Cross-conversation message inbox (route `/messages`). The user browses
 * conversations and reads messages across them.
 *
 * Agents bound here operate on the open conversation (summarize the thread,
 * draft a reply) or a specific message (translate, extract action items).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "current_conversation_id",
    label: "Current conversation ID",
    description:
      "UUID of the open conversation. Empty when no conversation is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "current_conversation_title",
    label: "Current conversation title",
    description:
      "Title / participant label of the open conversation. Empty when no conversation is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
  },
  {
    name: "current_conversation_message_count",
    label: "Message count",
    description:
      "Number of messages in the open conversation. Zero when none or no conversation is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 320,
  },
  {
    name: "current_sender_id",
    label: "Current sender ID",
    description:
      "User id of the sender of the focused message. Empty when no message is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 330,
  },
  {
    name: "current_sender_name",
    label: "Current sender name",
    description:
      "Display name of the sender of the focused message. Empty when no message is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 335,
  },
  {
    name: "last_message_text",
    label: "Last message text",
    description:
      "Body of the most recent message in the open conversation. Empty when no conversation is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 340,
  },
  {
    name: "last_message_timestamp",
    label: "Last message timestamp",
    description:
      "ISO 8601 timestamp of the most recent message. Empty when no conversation is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 345,
  },
  {
    name: "total_unread_count",
    label: "Total unread count",
    description:
      "Total number of unread messages across all conversations. Zero when all read.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 360,
  },
  {
    name: "all_conversations",
    label: "All conversations",
    description:
      "Array of `{ id, title, unread_count, last_message_at }` for every conversation in the inbox. Empty array when none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 370,
  },
];

export const messagesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/messages",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createMessagesScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  current_conversation_id?: string;
  current_conversation_title?: string;
  current_conversation_message_count?: number;
  current_sender_id?: string;
  current_sender_name?: string;
  last_message_text?: string;
  last_message_timestamp?: string;
  total_unread_count?: number;
  all_conversations?: unknown[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
