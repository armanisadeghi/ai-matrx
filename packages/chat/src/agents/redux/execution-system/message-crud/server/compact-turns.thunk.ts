/**
 * compactTurns — compact one or more **whole turns** at once.
 *
 * Endpoint: `POST /cx/conversations/{id}/turns/compact`.
 *
 * A turn = one `role: "user"` message → the next `role: "user"` message
 * (exclusive). The server resolves the turn boundary from the live
 * conversation, then delegates to `/messages/replace` (`mode: "user"`)
 * or `/messages/hide` (`mode: "system"`) under the hood.
 *
 * The caller supplies the summary content directly — this endpoint does
 * NOT run an LLM. Use whatever summarization agent you like upstream, or
 * invoke a chat endpoint separately and pass the result here.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { callCompactTurns, type CompactTurnsResult } from "@/lib/api/call-api";
import { loadConversation } from "../../thunks/load-conversation.thunk";
import { markCacheBypass } from "../cache-bypass.slice";
import { invalidateConversationCache } from "../invalidate-conversation-cache.thunk";

interface CompactTurnsArgs {
  conversationId: string;
  /** Inclusive start — must be a live `role: "user"` message id. */
  fromUserMessageId: string;
  /**
   * Exclusive end — also a `role: "user"` message id. The compaction
   * range ends BEFORE this message. Omit to compact all the way to the
   * end of the conversation.
   */
  toUserMessageId?: string;
  summaryContent: Array<{ [key: string]: unknown }>;
  /**
   * Default `"user"` — soft-delete + insert a visible summary (same
   * semantics as `replaceMessages`). `"system"` hides from the model
   * only (no summary row inserted, user view unchanged).
   */
  mode?: "user" | "system";
  /** Default true. Keeps tool_use ↔ tool_result pairs adjacent. */
  cascadeToolPairs?: boolean;
  /** Arbitrary metadata copied onto the summary row (user mode only). */
  summaryMetadata?: Record<string, unknown>;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const compactTurns = createAsyncThunk<
  CompactTurnsResult,
  CompactTurnsArgs,
  ThunkApi
>(
  "messages/compactTurnsServer",
  async (
    {
      conversationId,
      fromUserMessageId,
      toUserMessageId,
      summaryContent,
      mode,
      cascadeToolPairs,
      summaryMetadata,
    },
    { dispatch, rejectWithValue },
  ) => {
    const result = await dispatch(
      callCompactTurns({
        conversationId,
        body: {
          range: {
            from_user_message_id: fromUserMessageId,
            to_user_message_id: toUserMessageId ?? null,
          },
          summary_content: summaryContent,
          mode: mode ?? "user",
          cascade_tool_pairs: cascadeToolPairs ?? true,
          summary_metadata: summaryMetadata ?? null,
        },
      }),
    );

    if (result.error) {
      return rejectWithValue({
        message:
          result.error.message ??
          `Compact turns failed: HTTP ${result.error.status ?? "unknown"}`,
      });
    }
    if (!result.data) {
      return rejectWithValue({
        message: "Compact turns returned no payload",
      });
    }

    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));
    void dispatch(loadConversation({ conversationId }));

    return result.data;
  },
);
