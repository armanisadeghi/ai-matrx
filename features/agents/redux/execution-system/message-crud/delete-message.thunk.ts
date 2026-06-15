/**
 * deleteMessage — soft-delete a single message + cascade its directly
 * attached tool calls.
 *
 * Server contract (RPC `cx_message_soft_delete(p_message_id)`):
 *   • Sets `deleted_at = now()` on the cx_message row.
 *   • Cascades `deleted_at` to every cx_tool_call row with
 *     `message_id = p_message_id` (and any artifacts those calls produced).
 *   • Does NOT renumber positions on remaining messages — gaps in
 *     `position` are intentional and stable for any UI that uses position
 *     as an anchor (e.g. fork-at-position).
 *   • Returns the deleted message id on success.
 *
 * Client flow:
 *   1. Snapshot current message + attached tool-call ids (for rollback).
 *   2. Optimistically remove from messages slice + observability tool-calls.
 *   3. Fire the RPC.
 *   4. On success: mark cache-bypass, fire-and-forget invalidation,
 *      kick a fresh `loadConversation` so the client mirrors any
 *      server-side cascade we didn't predict (e.g. follow-on artifacts).
 *   5. On failure: roll back the optimistic removals, surface the error.
 *
 * NOTE: the plan describes "delete just this message" semantics. Following
 * messages stay in the chain; their `position` values are unchanged. The
 * server is expected to coalesce visibility-to-model on the next agent
 * turn (because the cache-bypass forces it to rebuild from the DB).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  removeMessage,
  updateMessageRecord,
  type MessageRecord,
} from "../messages/messages.slice";
import { markCacheBypass } from "./cache-bypass.slice";
import { invalidateConversationCache } from "./invalidate-conversation-cache.thunk";
import { selectToolCallsForMessage } from "../observability/observability.selectors";
import { patchToolCall } from "../observability/observability.slice";
import { loadConversation } from "../thunks/load-conversation.thunk";

interface DeleteMessageArgs {
  conversationId: string;
  messageId: string;
}

interface DeleteMessageResult {
  conversationId: string;
  messageId: string;
  cascadedToolCallCount: number;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const deleteMessage = createAsyncThunk<
  DeleteMessageResult,
  DeleteMessageArgs,
  ThunkApi
>(
  "messages/deleteMessage",
  async (
    { conversationId, messageId },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState();

    const prevRecord =
      state.messages.byConversationId[conversationId]?.byId?.[messageId];
    if (!prevRecord) {
      return rejectWithValue({
        message: `Message ${messageId} not found in conversation ${conversationId}`,
      });
    }

    const cascadedToolCalls = selectToolCallsForMessage(messageId)(state);
    const cascadedToolCallSnapshots = cascadedToolCalls.map((tc) => ({
      id: tc.id,
      deletedAt: tc.deletedAt,
    }));

    // ── 1. Optimistic removal ─────────────────────────────────────────────
    dispatch(removeMessage({ conversationId, messageId }));
    const cascadeStamp = new Date().toISOString();
    for (const snapshot of cascadedToolCallSnapshots) {
      dispatch(
        patchToolCall({
          id: snapshot.id,
          patch: { deletedAt: cascadeStamp },
        }),
      );
    }

    // ── 2. Fire the RPC ───────────────────────────────────────────────────
    // cx_message_soft_delete soft-deletes the row + cascades deleted_at to its
    // tool calls / artifacts / media. Returns the message id on success.
    const { data, error } = await supabase.rpc("cx_message_soft_delete", {
      p_message_id: messageId,
    });

    if (error) {
      // Roll back: re-insert the message and clear optimistic deletedAt
      // on the tool calls.
      const restored: MessageRecord = {
        ...prevRecord,
        _clientStatus: "error",
      };
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId,
          patch: restored,
        }),
      );
      for (const snapshot of cascadedToolCallSnapshots) {
        dispatch(
          patchToolCall({
            id: snapshot.id,
            patch: { deletedAt: snapshot.deletedAt },
          }),
        );
      }

      const err = error as {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
        status?: number;
      };
      // eslint-disable-next-line no-console
      console.error(
        "[deleteMessage] cx_message_soft_delete RPC failed:",
        JSON.stringify(
          {
            code: err.code ?? null,
            message: err.message ?? null,
            details: err.details ?? null,
            hint: err.hint ?? null,
            status: err.status ?? null,
          },
          null,
          2,
        ),
      );
      return rejectWithValue({
        message:
          err.message ?? err.details ?? err.hint ?? "Failed to delete message",
      });
    }

    // ── 3. Cache invalidation + rehydrate from authoritative DB state ─────
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));
    // Re-pull the bundle so any server-side cascade we didn't predict
    // (e.g. follow-on artifacts) appears in the UI.
    void dispatch(loadConversation({ conversationId }));

    return {
      conversationId,
      messageId: typeof data === "string" ? data : messageId,
      cascadedToolCallCount: cascadedToolCallSnapshots.length,
    };
  },
);
