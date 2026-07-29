/**
 * conversationInbox selectors — queued-while-running message cards.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ConversationInboxItem } from "./inbox.slice";

const EMPTY_ITEMS: ConversationInboxItem[] = [];

/** All queued items for a conversation, FIFO. Stable empty reference. */
export const selectInboxItems = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.conversationInbox?.byConversationId[conversationId],
    (items) => items ?? EMPTY_ITEMS,
  );

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
