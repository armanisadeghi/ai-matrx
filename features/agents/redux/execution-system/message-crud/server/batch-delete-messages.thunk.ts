/**
 * batchDeleteMessages — server-side hard delete with smart tool-pair cascade.
 * Parallel to `deleteMessage` (looped soft-delete via the
 * `cx_message_soft_delete` Supabase RPC).
 *
 * Endpoint: `POST /cx/conversations/{id}/messages/delete`. The server
 * resolves the selector to a concrete set of message ids, optionally
 * extends the set to keep `tool_use` / `tool_result` pairs adjacent
 * (`cascade_tool_pairs: true` — default), and hard-deletes them in one
 * transaction. `dry_run: true` returns the resolved set without writing.
 *
 * After a successful delete, reloads the conversation bundle so messages
 * and observability slices mirror the new DB state exactly. Skips
 * reload entirely for `dry_run`.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  callBatchDeleteMessages,
  type BatchDeleteResult,
  type MessageSelector,
} from "@/lib/api/call-api";
import { loadConversation } from "../../thunks/load-conversation.thunk";
import { markCacheBypass } from "../cache-bypass.slice";
import { invalidateConversationCache } from "../invalidate-conversation-cache.thunk";

interface BatchDeleteMessagesArgs {
  conversationId: string;
  selector: MessageSelector;
  /** Default true. Set false to leave orphan tool blocks (unusual). */
  cascadeToolPairs?: boolean;
  /** Default false. When true, the server resolves the set and returns it without deleting. */
  dryRun?: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const batchDeleteMessages = createAsyncThunk<
  BatchDeleteResult,
  BatchDeleteMessagesArgs,
  ThunkApi
>(
  "messages/batchDeleteServer",
  async (
    { conversationId, selector, cascadeToolPairs, dryRun },
    { dispatch, rejectWithValue },
  ) => {
    const result = await dispatch(
      callBatchDeleteMessages({
        conversationId,
        body: {
          selector,
          cascade_tool_pairs: cascadeToolPairs ?? true,
          dry_run: dryRun ?? false,
        },
      }),
    );

    if (result.error) {
      return rejectWithValue({
        message:
          result.error.message ??
          `Batch delete failed: HTTP ${result.error.status ?? "unknown"}`,
      });
    }
    if (!result.data) {
      return rejectWithValue({
        message: "Batch delete returned no payload",
      });
    }

    // Dry runs don't mutate — return the resolved set without touching slices.
    if (result.data.dry_run) {
      return result.data;
    }

    // Cache-bust + rehydrate so messages / observability mirror DB.
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));
    void dispatch(loadConversation({ conversationId }));

    return result.data;
  },
);
