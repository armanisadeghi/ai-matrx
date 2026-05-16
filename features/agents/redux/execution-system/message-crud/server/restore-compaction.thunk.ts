/**
 * restoreCompaction — reverse a previous `/messages/replace` or
 * `/messages/hide` call.
 *
 * Endpoint: `POST /cx/conversations/{id}/messages/restore`.
 *
 * Identify the operation via EITHER `compactionGroupId` OR
 * `summaryMessageId` (replace operations only — hide operations have no
 * summary row). The server restores every archived row's original
 * position, status, deleted_at, and visibility from its
 * `metadata.compaction_archive` snapshot, then hard-deletes the summary
 * row when `deleteSummary` is true (default).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  callRestoreCompaction,
  type RestoreCompactionResult,
} from "@/lib/api/call-api";
import { loadConversation } from "../../thunks/load-conversation.thunk";
import { markCacheBypass } from "../cache-bypass.slice";
import { invalidateConversationCache } from "../invalidate-conversation-cache.thunk";

interface RestoreCompactionArgs {
  conversationId: string;
  /** Provide one — `compactionGroupId` or `summaryMessageId`. */
  compactionGroupId?: string;
  summaryMessageId?: string;
  /** Default true. Drops the inserted summary row after restoring the originals. */
  deleteSummary?: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const restoreCompaction = createAsyncThunk<
  RestoreCompactionResult,
  RestoreCompactionArgs,
  ThunkApi
>(
  "messages/restoreCompactionServer",
  async (
    { conversationId, compactionGroupId, summaryMessageId, deleteSummary },
    { dispatch, rejectWithValue },
  ) => {
    if (!compactionGroupId && !summaryMessageId) {
      return rejectWithValue({
        message:
          "restoreCompaction requires either compactionGroupId or summaryMessageId",
      });
    }

    const result = await dispatch(
      callRestoreCompaction({
        conversationId,
        body: {
          compaction_group_id: compactionGroupId ?? null,
          summary_message_id: summaryMessageId ?? null,
          delete_summary: deleteSummary ?? true,
        },
      }),
    );

    if (result.error) {
      return rejectWithValue({
        message:
          result.error.message ??
          `Restore failed: HTTP ${result.error.status ?? "unknown"}`,
      });
    }
    if (!result.data) {
      return rejectWithValue({
        message: "Restore returned no payload",
      });
    }

    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));
    void dispatch(loadConversation({ conversationId }));

    return result.data;
  },
);
