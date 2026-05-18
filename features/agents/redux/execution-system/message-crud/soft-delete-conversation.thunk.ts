/**
 * softDeleteConversation — archive a conversation and cascade the delete.
 *
 * The `cx_soft_delete_conversation` RPC sets `deleted_at` on the conversation
 * row AND on every child (messages, tool_calls, artifacts, media,
 * user_requests, requests). Returns `false` when the row is not found.
 *
 * This thunk:
 *   1. Calls the RPC.
 *   2. On success, removes the conversation from every client slice that
 *      holds its state (conversationList, messages via `clearMessages`,
 *      the conversations entity via `destroyInstance`, and observability).
 *   3. Rejects when the RPC returns false so the caller can surface "not found".
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { destroyInstance } from "../conversations/conversations.slice";
import { clearMessages } from "../messages/messages.slice";
import { clearForConversation as clearObservabilityForConversation } from "../observability/observability.slice";
import { removeConversation as removeFromConversationList } from "../../conversation-list/conversation-list.slice";
import { removeConversationFromScopes } from "../../conversation-history/slice";
import { clearCacheBypass } from "./cache-bypass.slice";
import { invalidateConversationCache } from "./invalidate-conversation-cache.thunk";

interface SoftDeleteArgs {
  conversationId: string;
}

interface SoftDeleteResult {
  conversationId: string;
  deleted: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const softDeleteConversation = createAsyncThunk<
  SoftDeleteResult,
  SoftDeleteArgs,
  ThunkApi
>(
  "conversations/softDelete",
  async ({ conversationId }, { dispatch, rejectWithValue }) => {
    const { data, error } = await supabase.rpc("cx_soft_delete_conversation", {
      p_conversation_id: conversationId,
    });

    if (error) {
      return rejectWithValue({ message: error.message });
    }

    // RPC returns a boolean. `false` ⇒ the row wasn't found.
    const deleted = data === true;
    if (!deleted) {
      return rejectWithValue({
        message: `Conversation ${conversationId} not found or already deleted`,
      });
    }

    // Fire the server-side cache invalidation BEFORE purging client state.
    // Fire-and-forget: even if the endpoint fails, the deletion is already
    // in the DB. Clear any pending cache-bypass flag afterwards since the
    // conversation won't be resurrected from a stale flag later.
    void dispatch(invalidateConversationCache({ conversationId }));
    dispatch(clearCacheBypass(conversationId));

    // Purge from every slice that holds this conversation's state. Each
    // action is a no-op if the slice has no entry for this id.
    //
    // `removeFromConversationList` drops the entity + every per-agent cache
    // reference; `removeConversationFromScopes` drops the row from every
    // mounted `conversation-history` scope (the data source for the
    // ConversationHistorySidebar across /chat, /code, builder panels, and
    // floating windows). Without the scope removal, deletions would leave
    // ghost rows in those surfaces until the user navigated or refreshed.
    dispatch(removeFromConversationList(conversationId));
    dispatch(removeConversationFromScopes({ conversationId }));
    dispatch(clearMessages(conversationId));
    dispatch(clearObservabilityForConversation(conversationId));
    dispatch(destroyInstance(conversationId));

    return { conversationId, deleted: true };
  },
);
