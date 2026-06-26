/**
 * pendingAsks slice — the inline-ask inbox for the `user` /
 * `request_user_takeover` / `update_plan` tools.
 *
 * Each pending ask carries the callId from the original `tool_delegated`
 * event, the question/options to render, and (once the user submits) the
 * resolved response envelope. The handler awaits the resolution via a
 * sync-side promise (see `pending-asks.thunks.ts`); the UI dispatches
 * `resolvePendingAsk` (or `cancelPendingAsk`/`expirePendingAsk`) which
 * triggers that resolution.
 *
 * The reducers stay pure — only state shape changes. The handler-side
 * promise wiring lives in `pending-asks.thunks.ts` to avoid storing
 * non-serializable callbacks in Redux.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AskUserResponse, UserAskOption } from "../tools/schemas";
import type { ApprovalChange } from "../ui/approval-types";

export type PendingAskKind =
  | "confirm"
  | "choice"
  | "choice_many"
  | "text"
  | "secret"
  | "notify"
  | "plan_approval"
  | "takeover"
  // Structured agent-edit approval rendered by <ApprovalCard> (not <AskCard>).
  | "approval";

export type PendingAskStatus = "pending" | "resolved" | "cancelled" | "expired";

/**
 * Minimal "level" hint (info / success / warning / error) for `notify`-kind
 * cards. UI uses this for styling only.
 */
export type PendingAskLevel = "info" | "success" | "warning" | "error";

export interface PendingAsk {
  callId: string;
  conversationId: string;
  toolName: string; // 'user' | 'update_plan' | 'request_user_takeover'
  kind: PendingAskKind;
  question?: string;
  /** Short uppercase chip rendered in the card header (≤12 chars). */
  header?: string;
  /** Free-form supporting context shown above/below the question. */
  context?: string;
  /** Choice / choice_many options — already normalized to the rich shape. */
  options?: UserAskOption[];
  /** When true, render a dashed-border "Other" option with a freeform textarea. */
  allowOther?: boolean;
  /** Notify-kind: the message body. */
  message?: string;
  /** Notify-kind: action button labels. */
  actions?: string[];
  level?: PendingAskLevel;
  /** Plan approval: the proposed plan body (renders inline). */
  plan?: {
    title: string;
    steps: string[];
    reasoning?: string;
    estimated_minutes?: number;
  };
  /** kind:"approval" — the structured change descriptor rendered by <ApprovalCard>. */
  approval?: ApprovalChange;
  /** kind:"approval" — the tile this change acts on (drives "always approve"). */
  threadId?: string;
  /** Batched-question metadata (0-based). When set, the card shows "N of M". */
  batchIndex?: number;
  batchTotal?: number;
  /** Wall-clock timeout. Null = no timeout. */
  expiresAtMs?: number;
  status: PendingAskStatus;
  createdAtMs: number;
}

export interface PendingAsksState {
  byConversationId: Record<string, PendingAsk[]>;
}

const initialState: PendingAsksState = {
  byConversationId: {},
};

const slice = createSlice({
  name: "pendingAsks",
  initialState,
  reducers: {
    enqueuePendingAsk(state, action: PayloadAction<PendingAsk>) {
      const ask = action.payload;
      const list = state.byConversationId[ask.conversationId] ?? [];
      // Dedupe by callId — server retries shouldn't pile up duplicate cards.
      if (list.some((x) => x.callId === ask.callId)) return;
      state.byConversationId[ask.conversationId] = [...list, ask];
    },

    /**
     * Mark a pending ask as resolved. The dispatcher's promise wiring
     * actually delivers the response — this is just bookkeeping so the UI
     * can fade the card out.
     */
    resolvePendingAsk(
      state,
      action: PayloadAction<{ callId: string; conversationId: string }>,
    ) {
      const { callId, conversationId } = action.payload;
      const list = state.byConversationId[conversationId];
      if (!list) return;
      const idx = list.findIndex((x) => x.callId === callId);
      if (idx === -1) return;
      list[idx].status = "resolved";
    },

    cancelPendingAsk(
      state,
      action: PayloadAction<{ callId: string; conversationId: string }>,
    ) {
      const { callId, conversationId } = action.payload;
      const list = state.byConversationId[conversationId];
      if (!list) return;
      const idx = list.findIndex((x) => x.callId === callId);
      if (idx === -1) return;
      list[idx].status = "cancelled";
    },

    expirePendingAsk(
      state,
      action: PayloadAction<{ callId: string; conversationId: string }>,
    ) {
      const { callId, conversationId } = action.payload;
      const list = state.byConversationId[conversationId];
      if (!list) return;
      const idx = list.findIndex((x) => x.callId === callId);
      if (idx === -1) return;
      list[idx].status = "expired";
    },

    /** Remove resolved/cancelled/expired cards (UI calls this after fade-out). */
    sweepPendingAsks(state, action: PayloadAction<string>) {
      const conversationId = action.payload;
      const list = state.byConversationId[conversationId];
      if (!list) return;
      state.byConversationId[conversationId] = list.filter(
        (x) => x.status === "pending",
      );
    },

    clearPendingAsksForConversation(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },
});

export const {
  enqueuePendingAsk,
  resolvePendingAsk,
  cancelPendingAsk,
  expirePendingAsk,
  sweepPendingAsks,
  clearPendingAsksForConversation,
} = slice.actions;

export default slice.reducer;

// ─── Selectors ──────────────────────────────────────────────────────────────

import type { RootState } from "@/lib/redux/store";

const EMPTY_ASKS: PendingAsk[] = [];

export const selectPendingAsksForConversation =
  (conversationId: string) =>
  (state: RootState): PendingAsk[] =>
    state.pendingAsks?.byConversationId[conversationId] ?? EMPTY_ASKS;

export const selectActivePendingAsksForConversation =
  (conversationId: string) =>
  (state: RootState): PendingAsk[] => {
    const all = state.pendingAsks?.byConversationId[conversationId];
    if (!all || all.length === 0) return EMPTY_ASKS;
    return all.filter((x) => x.status === "pending");
  };

// Re-export the wire envelope so consumers can import from one place.
export type { AskUserResponse };
