/**
 * replaceMessages — user-initiated compaction. Soft-delete a range and
 * insert a single visible summary message in its place. Reversible.
 *
 * Endpoint: `POST /cx/conversations/{id}/messages/replace`.
 *
 * Semantics:
 *   • The selected rows get `deleted_at = now()`, `status = "compacted_hidden"`,
 *     visibility flags off — they vanish from both user and model.
 *   • A new `assistant` message at the original first-replaced position
 *     carries the caller-supplied summary content. The UI should render
 *     this as "[N messages compacted — view originals]".
 *   • The `compaction_group_id` returned is the key for
 *     `restoreCompaction(...)` if the user wants to undo.
 *   • Tool pairs cascade by default (`cascade_tool_pairs: true`) so the
 *     compacted block never strands an orphan tool_use without its
 *     tool_result.
 *
 * No existing thunk equivalent — this is a brand new capability the
 * server team built. Wire it into UI surfaces that need long-conversation
 * compaction.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  callReplaceMessages,
  type MessageSelector,
  type ReplaceMessagesResult,
} from "@/lib/api/call-api";
import { loadConversation } from "../../thunks/load-conversation.thunk";
import { markCacheBypass } from "../cache-bypass.slice";
import { invalidateConversationCache } from "../invalidate-conversation-cache.thunk";

interface ReplaceMessagesArgs {
  conversationId: string;
  selector: MessageSelector;
  /**
   * Structured content blocks for the inserted summary, same shape the
   * server would have written for an assistant message
   * (e.g. `[{ type: "text", text: "..." }]`).
   */
  summaryContent: Array<{ [key: string]: unknown }>;
  /** Arbitrary metadata copied onto the summary row. */
  summaryMetadata?: Record<string, unknown>;
  /** Default true. Keeps tool_use ↔ tool_result pairs adjacent. */
  cascadeToolPairs?: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const replaceMessages = createAsyncThunk<
  ReplaceMessagesResult,
  ReplaceMessagesArgs,
  ThunkApi
>(
  "messages/replaceServer",
  async (
    {
      conversationId,
      selector,
      summaryContent,
      summaryMetadata,
      cascadeToolPairs,
    },
    { dispatch, rejectWithValue },
  ) => {
    const result = await dispatch(
      callReplaceMessages({
        conversationId,
        body: {
          selector,
          summary_content: summaryContent,
          summary_metadata: summaryMetadata ?? null,
          cascade_tool_pairs: cascadeToolPairs ?? true,
        },
      }),
    );

    if (result.error) {
      return rejectWithValue({
        message:
          result.error.message ??
          `Replace failed: HTTP ${result.error.status ?? "unknown"}`,
      });
    }
    if (!result.data) {
      return rejectWithValue({
        message: "Replace returned no payload",
      });
    }

    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));
    void dispatch(loadConversation({ conversationId }));

    return result.data;
  },
);
