/**
 * conversationInbox slice — messages sent while the agent is running.
 *
 * THE THREE SEND MODES (Arman's ruling 2026-07-29 — full statement in
 * docs/TURN_BOUNDARY_INBOX.md; never re-litigate these semantics):
 *
 *   QUEUE (default) — the message waits until the run FULLY ends, then sends
 *     as the next normal turn. A real FIFO queue, client-held, editable until
 *     it officially sends. mode: "queue".
 *   STEER — deliver at the agent's NEXT natural pause mid-run (rides with a
 *     tool result); server-held (`POST /ai/conversations/{id}/inbox`, the
 *     Turn-Boundary Inbox), answered on the already-open stream, editable
 *     until drained. mode: "steer".
 *   INTERRUPT — stop now, fork clean, message becomes the reply. Lives in
 *     smart-execute (`interruptAndSend`), not in this queue.
 *
 * BOTH modes are SERVER-HELD (2026-07-30 — `chat.pending_injection.delivery`:
 * queue = 'turn_end', steer = 'next_boundary'), so queued messages survive
 * reloads, crashed tabs, and phones turned off — the running agent works
 * through them without any client. Item lifecycle (both modes):
 *
 *   sending → pending → (removed on `injection_consumed` — the transcript
 *   owns it) | failed
 *
 * Retract/edit act on `pending` items; a 409 means it drained first (treat
 * as delivered).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { destroyInstance } from "../conversations/conversations.slice";

export type InboxItemMode = "queue" | "steer";

export type InboxItemStatus =
  | "sending" // POST in flight
  | "pending" // server accepted; waiting its delivery point
  | "failed";

export type InboxItemKind = "user_message" | "system_message";

export interface ConversationInboxItem {
  /** Server `injection_id` (steer, once accepted); `inbox_local_<uuid>` otherwise. */
  injectionId: string;
  conversationId: string;
  mode: InboxItemMode;
  kind: InboxItemKind;
  text: string;
  status: InboxItemStatus;
  isVisibleToUser: boolean;
  /** ISO timestamp — enqueue time (client clock until hydrated). */
  queuedAt: string;
  /** Terminal failure message (status === "failed" only). */
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
      const item = action.payload;
      const items = bucket(state, item.conversationId);
      if (items.some((i) => i.injectionId === item.injectionId)) {
        return; // idempotent
      }
      items.push(item);
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
      // Server truth replaces the pending view; in-flight POSTs and failed
      // cards (client-only states) survive.
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
