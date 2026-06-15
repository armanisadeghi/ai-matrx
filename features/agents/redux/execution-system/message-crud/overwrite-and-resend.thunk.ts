/**
 * overwriteAndResend — "Edit & Resubmit / Overwrite this turn" path.
 *
 * The user has edited a previous user message and chosen to overwrite (not
 * fork). This means: the message is rewritten in-place, every message after
 * it is soft-deleted, the cache is busted, and a fresh agent turn fires
 * with the edited text as the new user input. The user "watches the new
 * response come in" without any extra clicks.
 *
 * Server contract (RPC `cx_truncate_conversation_after`):
 *   p_conversation_id, p_after_position → soft-deletes every cx_message,
 *   cx_tool_call, and artifact row whose owning message has
 *   `position > p_after_position`. Atomic: a single transaction so we
 *   never see a half-truncated transcript on a network blip.
 *
 * Until that RPC ships on the Python side, this thunk falls back to a
 * client-side multi-call sequence (delete each message in turn). That's
 * documented in PYTHON_RESUME_SPEC.md as a server task.
 *
 * Flow:
 *   1. Read the message position. Sanity-check role==='user'.
 *   2. Edit the user message via the existing `editMessage` thunk (server
 *      auto-archives prior content into content_history).
 *   3. Soft-delete every message at position > N. Server-side RPC if
 *      available, client-side fallback otherwise.
 *   4. Mark cache-bypass + invalidate server cache.
 *   5. Reload the conversation so the messages slice mirrors the truncated
 *      DB state exactly (no orphan ids, no stale tool calls).
 *   6. Set the input bar text to the edited content and dispatch
 *      `executeInstance`. Stream begins.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { editMessage } from "./edit-message.thunk";
import { mergeEditedText } from "./content-blocks.util";
import { markCacheBypass } from "./cache-bypass.slice";
import { invalidateConversationCache } from "./invalidate-conversation-cache.thunk";
import { setUserInputText } from "../instance-user-input/instance-user-input.slice";
import { executeInstance } from "../thunks/execute-instance.thunk";
import { loadConversation } from "../thunks/load-conversation.thunk";

interface OverwriteAndResendArgs {
  conversationId: string;
  /** The user message being overwritten — must be role: 'user'. */
  messageId: string;
  /** New plain-text content. The thunk wraps it as `[{type:'text',text}]`. */
  newContent: string;
}

interface OverwriteAndResendResult {
  conversationId: string;
  truncatedMessageIds: string[];
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const overwriteAndResend = createAsyncThunk<
  OverwriteAndResendResult,
  OverwriteAndResendArgs,
  ThunkApi
>(
  "messages/overwriteAndResend",
  async (
    { conversationId, messageId, newContent },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState();
    const messagesEntry = state.messages.byConversationId[conversationId];
    const userMessage = messagesEntry?.byId?.[messageId];

    if (!userMessage) {
      return rejectWithValue({
        message: `Message ${messageId} not found in conversation ${conversationId}`,
      });
    }

    if (userMessage.role !== "user") {
      return rejectWithValue({
        message: "overwriteAndResend can only target user messages",
      });
    }

    const anchorPosition = userMessage.position;
    const downstreamIds = Object.values(messagesEntry?.byId ?? {})
      .filter((m) => m.position > anchorPosition && !m.deletedAt)
      .map((m) => m.id);

    // ── 1. Edit the user message in place ─────────────────────────────────
    try {
      await dispatch(
        editMessage({
          conversationId,
          messageId,
          newContent: mergeEditedText(userMessage.content, newContent),
        }),
      ).unwrap();
    } catch (err) {
      return rejectWithValue({
        message:
          err instanceof Error
            ? err.message
            : "Failed to write the edited message",
      });
    }

    // ── 2. Truncate everything after the edited message ───────────────────
    // Atomic single-RPC: soft-deletes every cx_message at position > anchor
    // plus its tool calls / artifacts / media, in one transaction.
    const { error: truncErr } = await supabase.rpc(
      "cx_truncate_conversation_after",
      {
        p_conversation_id: conversationId,
        p_after_position: anchorPosition,
      },
    );

    if (truncErr) {
      // eslint-disable-next-line no-console
      console.error(
        "[overwriteAndResend] cx_truncate_conversation_after failed:",
        truncErr,
      );
      return rejectWithValue({
        message:
          truncErr.message ??
          "Failed to truncate conversation after the edited message",
      });
    }
    const truncatedIds: string[] = downstreamIds;

    // ── 3. Cache invalidation ─────────────────────────────────────────────
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));

    // ── 4. Re-hydrate from authoritative DB state ─────────────────────────
    try {
      await dispatch(loadConversation({ conversationId })).unwrap();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[overwriteAndResend] loadConversation after truncate failed",
        err,
      );
      // Continue — the optimistic state is still close enough to fire the
      // next turn. The bundle reload after the new turn will catch up.
    }

    // ── 5. Fire the new turn ──────────────────────────────────────────────
    dispatch(
      setUserInputText({
        conversationId,
        text: newContent,
      }),
    );
    void dispatch(executeInstance({ conversationId }));

    return { conversationId, truncatedMessageIds: truncatedIds };
  },
);
