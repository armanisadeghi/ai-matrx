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
 * Item lifecycle by mode:
 *
 *   queue:  queued → dispatching → (removed — it became a normal turn) | failed
 *   steer:  sending → pending → (removed on `injection_consumed` — the
 *           transcript owns it) | failed
 *
 * Retract/edit act on `queued` and `pending` items; a 409 on a steer item
 * means it drained first (treat as delivered).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { destroyInstance } from "../conversations/conversations.slice";

export type InboxItemMode = "queue" | "steer";

export type InboxItemStatus =
  | "queued" // queue: waiting for the run to end
  | "dispatching" // queue: being sent as a normal turn right now
  | "sending" // steer: POST in flight
  | "pending" // steer: server accepted, waiting for the next pause
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
    /**
     * Add an item. `front` re-inserts at the head — used when a QUEUE drain
     * loses a race to a just-started run and the head item must keep its
     * FIFO position.
     */
    addInboxItem(
      state,
      action: PayloadAction<ConversationInboxItem & { front?: boolean }>,
    ) {
      const { front, ...item } = action.payload;
      const items = bucket(state, item.conversationId);
      if (items.some((i) => i.injectionId === item.injectionId)) {
        return; // idempotent
      }
      if (front) items.unshift(item);
      else items.push(item);
    },

    /** Flip a queue item's status (queued ↔ dispatching). */
    setInboxItemStatus(
      state,
      action: PayloadAction<{
        conversationId: string;
        injectionId: string;
        status: InboxItemStatus;
      }>,
    ) {
      const items = state.byConversationId[action.payload.conversationId];
      const item = items?.find(
        (i) => i.injectionId === action.payload.injectionId,
      );
      if (item) item.status = action.payload.status;
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
      // Server truth replaces only the server-held (steer/pending) view.
      // Client-held state survives: queue items, in-flight steer POSTs,
      // failed cards.
      const local = (state.byConversationId[conversationId] ?? []).filter(
        (i) =>
          i.mode === "queue" ||
          i.status === "sending" ||
          i.status === "failed",
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
  setInboxItemStatus,
  confirmInboxItem,
  failInboxItem,
  setInboxItemText,
  removeInboxItem,
  hydrateInboxItems,
} = conversationInboxSlice.actions;

export default conversationInboxSlice.reducer;
