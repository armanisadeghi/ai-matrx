/**
 * conversationInbox slice — queued "send while the agent is running" messages.
 *
 * The Turn-Boundary Inbox (docs/TURN_BOUNDARY_INBOX.md) lets a user send a
 * message into a conversation whose run is still streaming: the message is
 * queued server-side (`POST /ai/conversations/{id}/inbox`) and the running
 * agent drains it at its next natural pause, answering on the SAME stream.
 *
 * This slice tracks the client-visible lifecycle of those queued items:
 *
 *   sending   → optimistic card, POST in flight (temp id `inbox_local_*`)
 *   pending   → server accepted; waiting for the agent's next turn boundary
 *   delivered → the stream's `injection_consumed` event named this item;
 *               the message is now part of the conversation transcript
 *   failed    → the POST failed terminally (card carries the error)
 *
 * Retract (DELETE) and edit (PATCH) act only on `pending` items; a 409 from
 * either means the item drained first — the reducer flips it to `delivered`.
 *
 * Delivered/cancelled items are REMOVED from the queue (the transcript owns
 * the delivered message; the queue only shows what is still waiting).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { destroyInstance } from "../conversations/conversations.slice";

export type InboxItemStatus = "sending" | "pending" | "failed";

export type InboxItemKind = "user_message" | "system_message";

export interface ConversationInboxItem {
  /** Server `injection_id` once accepted; `inbox_local_<uuid>` while sending. */
  injectionId: string;
  conversationId: string;
  kind: InboxItemKind;
  text: string;
  status: InboxItemStatus;
  isVisibleToUser: boolean;
  /** ISO timestamp — enqueue time (client clock until hydrated). */
  queuedAt: string;
  /** Terminal POST failure message (status === "failed" only). */
  error?: string | null;
}

interface ConversationInboxState {
  /** FIFO per conversation — order mirrors server `enqueued_seq`. */
  byConversationId: Record<string, ConversationInboxItem[]>;
}

const initialState: ConversationInboxState = {
  byConversationId: {},
};

function bucket(
  state: ConversationInboxState,
  conversationId: string,
): ConversationInboxItem[] {
  if (!state.byConversationId[conversationId]) {
    state.byConversationId[conversationId] = [];
  }
  return state.byConversationId[conversationId];
}

const conversationInboxSlice = createSlice({
  name: "conversationInbox",
  initialState,
  reducers: {
    /** Optimistic add at enqueue time (status "sending", local temp id). */
    addInboxItem(state, action: PayloadAction<ConversationInboxItem>) {
      const items = bucket(state, action.payload.conversationId);
      if (items.some((i) => i.injectionId === action.payload.injectionId)) {
        return; // idempotent
      }
      items.push(action.payload);
    },

    /** POST accepted — swap the local temp id for the server injection_id. */
    confirmInboxItem(
      state,
      action: PayloadAction<{
        conversationId: string;
        localId: string;
        injectionId: string;
      }>,
    ) {
      const { conversationId, localId, injectionId } = action.payload;
      const items = state.byConversationId[conversationId];
      const item = items?.find((i) => i.injectionId === localId);
      if (!item) return;
      item.injectionId = injectionId;
      item.status = "pending";
      item.error = null;
    },

    /** Terminal POST failure — keep the card visible with the error. */
    failInboxItem(
      state,
      action: PayloadAction<{
        conversationId: string;
        injectionId: string;
        error: string;
      }>,
    ) {
      const items = state.byConversationId[action.payload.conversationId];
      const item = items?.find(
        (i) => i.injectionId === action.payload.injectionId,
      );
      if (!item) return;
      item.status = "failed";
      item.error = action.payload.error;
    },

    /** Edit accepted (PATCH 200) — replace the pending text. */
    setInboxItemText(
      state,
      action: PayloadAction<{
        conversationId: string;
        injectionId: string;
        text: string;
      }>,
    ) {
      const items = state.byConversationId[action.payload.conversationId];
      const item = items?.find(
        (i) => i.injectionId === action.payload.injectionId,
      );
      if (!item) return;
      item.text = action.payload.text;
    },

    /**
     * Remove an item from the queue — retract success, delivery
     * (`injection_consumed` — the transcript owns it now), or dismissing a
     * failed card.
     */
    removeInboxItem(
      state,
      action: PayloadAction<{ conversationId: string; injectionId: string }>,
    ) {
      const { conversationId, injectionId } = action.payload;
      const items = state.byConversationId[conversationId];
      if (!items) return;
      state.byConversationId[conversationId] = items.filter(
        (i) => i.injectionId !== injectionId,
      );
    },

    /**
     * Replace the pending set from a server list (`GET …/inbox?status=pending`)
     * — reopen-mid-run rehydration. Local `sending`/`failed` items are kept
     * (the server doesn't know them yet / anymore).
     */
    hydrateInboxItems(
      state,
      action: PayloadAction<{
        conversationId: string;
        items: ConversationInboxItem[];
      }>,
    ) {
      const { conversationId, items } = action.payload;
      const local = (state.byConversationId[conversationId] ?? []).filter(
        (i) => i.status === "sending" || i.status === "failed",
      );
      state.byConversationId[conversationId] = [...items, ...local];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
    });
  },
});

export const {
  addInboxItem,
  confirmInboxItem,
  failInboxItem,
  setInboxItemText,
  removeInboxItem,
  hydrateInboxItems,
} = conversationInboxSlice.actions;

export default conversationInboxSlice.reducer;
