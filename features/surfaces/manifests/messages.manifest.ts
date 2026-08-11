/**
 * Surface manifest — Messages inbox (`matrx-user/messages`).
 *
 * Cross-conversation message inbox (route `/messages`). The user browses
 * conversations and reads messages across them.
 *
 * Agents bound here operate on the open conversation (summarize the thread,
 * draft a reply) or a specific message (translate, extract action items).
 *
 * EMITTERS (two, both live — the `readiness: "stub"` / "no runtime emitter"
 * note this file used to carry was stale):
 *   - THREAD  `app/(core)/messages/[conversationId]/page.tsx` — emits 8 of the
 *     9 surface-specific values.
 *   - LIST    `app/(core)/messages/MessagesPageClient.tsx` — emits only
 *     `total_unread_count` + `all_conversations` (there is no open
 *     conversation on the list route).
 * `current_conversation_message_count` is declared but emitted by NEITHER
 * mount; it is the surface's one real remaining read gap.
 *
 * ---------------------------------------------------------------------------
 * WRITE TARGETS: evaluated 2026-08-11 and DELIBERATELY NOT DECLARED.
 * Do not re-assign this surface for `surface-write-targets` — the judgment
 * below is the result, not an omission.
 *
 * This surface has exactly ONE field that clears the judgment bar, which is
 * under the ~2-target floor the skill sets for earning the work:
 *
 *   YES (the only one) — the composer draft in
 *   `features/messaging/components/MessageInput.tsx`. Authored content, fully
 *   reversible because the user still presses send. This is the same field
 *   `matrx-user/chat` ships as `input_draft`, and per that surface's
 *   record-vs-draft ruling it would be handled the same way (ONE target taking
 *   `{text, mode?: "replace" | "append"}`, not a replace/append pair) — so
 *   adopting it here would add one near-duplicate target and nothing else.
 *
 *   NO — `current_conversation_title`. It reads
 *   `display_name ?? group_name`. For a DIRECT conversation that IS the other
 *   participant's name (identity — never writable). For a group, `group_name`
 *   is written ONCE at creation and never again: there is no rename UI, no
 *   service method, and no `conversations` table update ANYWHERE in the repo
 *   (`lib/supabase/messaging.ts` exposes only `sendMessage`,
 *   `sendBridgeMessage`, `markConversationAsRead`). The slice's
 *   `updateConversation` is a local reducer the realtime initializer uses to
 *   MIRROR database rows, not a write path. Declaring a target here would be
 *   the "declared target with no canonical write path" trap.
 *
 *   NO — `last_message_text` / `all_conversations`. The transcript is a
 *   RECORD of what was actually said by whom; an agent rewriting it fabricates
 *   history rather than editing a draft (`matrx-user/chat`, 2026-08-10).
 *
 *   NO — sending. The outward-facing act, and on this surface it is outward to
 *   ANOTHER PERSON under the user's name. The human press stays the gate.
 *
 *   NO — sender identity, read/unread state, timestamps, message deletion.
 *
 *   NO — the composer's attached references. As with chat's
 *   `attached_resources`, the read half never publishes the user's library, so
 *   an agent could only guess ids.
 *
 *   NO — the conversation-list search box. A mechanical filter nobody would
 *   ask an agent to type; `matrx-user/images` earned `search_query` only as
 *   one of three targets on a surface that also had real selection state.
 *
 * If a group-rename affordance is ever built (a service method + a human
 * correction path in the UI), `conversation_title` becomes a genuine second
 * target and this surface should be re-evaluated then.
 * ---------------------------------------------------------------------------
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
  readiness: "partial",
  readinessNote:
    "Audited against the live page 2026-08-11. TWO emitters: the thread route emits 8 of 9 surface-specific values, the list route only total_unread_count + all_conversations. current_conversation_message_count is declared but emitted by neither. Write targets evaluated and deliberately not declared — see the docblock.",
  label: "Messages",
  urlPattern: "/messages",
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
