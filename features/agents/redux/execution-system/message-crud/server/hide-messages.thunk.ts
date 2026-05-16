/**
 * hideMessages — system-initiated compaction. Hide messages from the **model
 * only**; the user's UI is unaffected.
 *
 * Endpoint: `POST /cx/conversations/{id}/messages/hide`.
 *
 * Semantics:
 *   • Sets `is_visible_to_model = false` on the selected rows. The user
 *     still sees them; `is_visible_to_user` is unchanged.
 *   • Rows stay at their original positions; nothing is soft-deleted.
 *   • Original visibility is stashed in `metadata.compaction_archive` so
 *     `restoreCompaction(...)` can reverse it with full fidelity.
 *
 * Use case: silent context optimization (background memory, context
 * optimizer) wants to shrink the model's token budget without disrupting
 * the user's chat history. Pair with an out-of-band summary injection
 * (system prompt, recent-context note) if the model needs to know what
 * it can no longer see.
 *
 * No existing thunk equivalent.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  callHideMessages,
  type HideMessagesResult,
  type MessageSelector,
} from "@/lib/api/call-api";
import { loadConversation } from "../../thunks/load-conversation.thunk";
import { markCacheBypass } from "../cache-bypass.slice";
import { invalidateConversationCache } from "../invalidate-conversation-cache.thunk";

interface HideMessagesArgs {
  conversationId: string;
  selector: MessageSelector;
  /** Default true. Keeps tool_use ↔ tool_result pairs adjacent. */
  cascadeToolPairs?: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const hideMessages = createAsyncThunk<
  HideMessagesResult,
  HideMessagesArgs,
  ThunkApi
>(
  "messages/hideServer",
  async (
    { conversationId, selector, cascadeToolPairs },
    { dispatch, rejectWithValue },
  ) => {
    const result = await dispatch(
      callHideMessages({
        conversationId,
        body: {
          selector,
          cascade_tool_pairs: cascadeToolPairs ?? true,
        },
      }),
    );

    if (result.error) {
      return rejectWithValue({
        message:
          result.error.message ??
          `Hide failed: HTTP ${result.error.status ?? "unknown"}`,
      });
    }
    if (!result.data) {
      return rejectWithValue({
        message: "Hide returned no payload",
      });
    }

    // Hide doesn't change anything the user sees, but the agent cache
    // must rebuild on the next turn so the model sees the new visibility
    // set. Reload the bundle so the client mirrors the updated
    // `is_visible_to_model` flags (relevant for any future agent UI that
    // surfaces "hidden from model" affordances).
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));
    void dispatch(loadConversation({ conversationId }));

    return result.data;
  },
);
