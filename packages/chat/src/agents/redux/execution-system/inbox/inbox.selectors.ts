/**
 * conversationInbox selectors — queued-while-running message cards.
 */

import type { RootState } from "@host/lib/redux/store";
import type { ConversationInboxItem } from "./inbox.slice";

const EMPTY_ITEMS: ConversationInboxItem[] = [];

/** All queued items for a conversation, FIFO. Stable empty reference. */
export const selectInboxItems = (conversationId: string) =>
  (state: RootState): ConversationInboxItem[] =>
    state.conversationInbox?.byConversationId[conversationId] ?? EMPTY_ITEMS;

/** Count of items still waiting (sending + pending). Primitive — no memo needed. */
export const selectInboxWaitingCount =
  (conversationId: string) =>
  (state: RootState): number => {
    const items = state.conversationInbox?.byConversationId[conversationId];
    if (!items) return 0;
    let n = 0;
    for (const i of items) {
      if (i.status === "sending" || i.status === "pending") n++;
    }
    return n;
  };

/**
 * Status of ONE queued item, or `null` once it is gone. An item leaves the
 * slice exactly when the stream's `injection_consumed` names it — so `null` is
 * the delivery ack a caller can wait on (the Cloud Browser takeover uses it to
 * know the agent has been told, at its own turn boundary).
 * Primitive result — no memo needed.
 */
export const selectInboxItemStatus =
  (conversationId: string, injectionId: string) =>
  (state: RootState): ConversationInboxItem["status"] | null =>
    state.conversationInbox?.byConversationId[conversationId]?.find(
      (i) => i.injectionId === injectionId,
    )?.status ?? null;

/**
 * The person's own line, accepted by the server and still waiting. What a
 * completed turn must not leave behind (deliver-stranded-queue.thunk.ts).
 * Server producers (agent_collab notes, deferred-tool answers) write
 * `system_message` rows — never sent as the person's words.
 */
export function isStrandablePersonLine(item: ConversationInboxItem): boolean {
  return (
    item.kind === "user_message" &&
    item.status === "pending" &&
    item.isVisibleToUser
  );
}
