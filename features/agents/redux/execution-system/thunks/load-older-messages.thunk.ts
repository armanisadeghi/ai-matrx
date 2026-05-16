/**
 * loadOlderMessages — paginated history fetch for an already-hydrated
 * conversation.
 *
 * Uses the cursor stored on `messages.byConversationId[cid].oldestPosition`
 * as `p_before_position` against the canonical `get_cx_conversation_bundle`
 * RPC. The RPC returns the older page's `messages` plus the `tool_calls` /
 * `artifacts` / `media` joined to those exact message_ids — so a single
 * round-trip covers every dimension the renderer needs.
 *
 * ============================================================================
 * Stream-safety invariants — read before changing this thunk
 * ============================================================================
 *
 *   1. **Strict re-entry guard.** `isLoadingOlder` is set BEFORE the fetch
 *      and cleared inside the slice reducers (`prependMessages` or, on
 *      error, `setOlderLoading({ loading: false })`). The sentinel checks
 *      both `hasMoreOlder` and `isLoadingOlder` before dispatching.
 *
 *   2. **Additive writes only.** The two reducers we dispatch
 *      (`prependMessages`, `mergeToolCalls`) are strictly additive — they
 *      never overwrite a record already in state. This is the contract that
 *      keeps streaming bubbles and previously-rendered messages from
 *      flickering when the user pages older history in.
 *
 *   3. **No conversation-row write.** The bundle includes the full
 *      `cx_conversation` row but we DROP it here. The conversation has
 *      already been hydrated by `loadConversation`; re-dispatching it
 *      would needlessly bump references on slices the column doesn't
 *      subscribe to but other components may.
 *
 *   4. **No user/request observability write.** The RPC does not return
 *      `cx_user_request` or `cx_request` rows on the paged path (they're
 *      not joined to message_ids). Older tool_calls render correctly using
 *      only the `toolCalls` map + the message content blocks — they don't
 *      need a parent userRequest entry on screen.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";

import { prependMessages, setOlderLoading } from "../messages/messages.slice";
import { mergeToolCalls } from "../observability/observability.slice";
import {
  fetchConversationBundle,
  extractBundleToolCalls,
  messageRowToRecord,
  toolCallRowToRecord,
} from "./conversation-bundle";

export interface LoadOlderMessagesArgs {
  conversationId: string;
  /** Page size. Defaults to 50; the RPC clamps to [1, 200]. */
  pageSize?: number;
}

interface LoadOlderMessagesResult {
  conversationId: string;
  /** How many NEW messages were prepended (post-dedupe). */
  prependedCount: number;
  /** Whether the server thinks more older history exists. */
  hasMoreOlder: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { reason: string };
}

export const loadOlderMessages = createAsyncThunk<
  LoadOlderMessagesResult,
  LoadOlderMessagesArgs,
  ThunkApi
>(
  "conversations/loadOlder",
  async (
    { conversationId, pageSize = 50 },
    { dispatch, getState, rejectWithValue },
  ) => {
    const entry = getState().messages.byConversationId[conversationId];
    if (!entry) {
      return rejectWithValue({ reason: "no-entry" });
    }
    if (entry.isLoadingOlder) {
      return rejectWithValue({ reason: "already-loading" });
    }
    if (!entry.hasMoreOlder) {
      return rejectWithValue({ reason: "no-more" });
    }
    if (entry.oldestPosition == null) {
      return rejectWithValue({ reason: "no-cursor" });
    }

    const cursor = entry.oldestPosition;
    dispatch(setOlderLoading({ conversationId, loading: true }));

    try {
      const bundle = await fetchConversationBundle(conversationId, {
        messageLimit: pageSize,
        beforePosition: cursor,
        skipObservabilityFallback: true,
      });

      const messageRecords = bundle.messages.map(messageRowToRecord);
      const toolCallRecords =
        extractBundleToolCalls(bundle).map(toolCallRowToRecord);

      const pagination = bundle.pagination ?? {
        limit: pageSize,
        returned_count: messageRecords.length,
        oldest_position: messageRecords[0]?.position ?? cursor,
        has_more: false,
      };

      // Tool calls first so that the message renderer has its callId →
      // tool_call mapping ready the moment the new message rows appear.
      if (toolCallRecords.length > 0) {
        dispatch(mergeToolCalls({ toolCalls: toolCallRecords }));
      }

      dispatch(
        prependMessages({
          conversationId,
          messages: messageRecords,
          pagination: {
            oldestPosition: pagination.oldest_position,
            hasMoreOlder: pagination.has_more,
          },
        }),
      );

      return {
        conversationId,
        prependedCount: messageRecords.length,
        hasMoreOlder: pagination.has_more,
      };
    } catch (err) {
      dispatch(setOlderLoading({ conversationId, loading: false }));
      // eslint-disable-next-line no-console
      console.error("[loadOlderMessages] failed:", err);
      throw err;
    }
  },
);
