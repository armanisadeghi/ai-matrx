/**
 * forkConversationServer — server-backed fork. Parallel to `forkConversation`
 * (which calls the `cx_fork_conversation` Supabase RPC directly).
 *
 * Endpoint: `POST /cx/conversations/{id}/fork`. Accepts:
 *   • `up_to_position` — copy messages with `position <= N`
 *   • `from_message_id` + `exclusive` — copy up to / before a specific
 *     message. `exclusive: true` is the natural shape for "edit this
 *     message" (drop the anchor).
 *   • `title` — optional custom title for the new conversation.
 *
 * The server response is small (`{ conversation_id, forked_from_id,
 * forked_at_position, message_count }`); we hydrate via `loadConversation`
 * after the call so the messages / observability / variables / overrides
 * slices come up the same way they would on a normal page open.
 *
 * Does NOT replace `forkConversation`. Opt in per surface — when the
 * server-side path is proven across enough flows we'll consolidate.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  callConversationFork,
  type ConversationForkBody,
} from "@/lib/api/call-api";
import { loadConversation } from "../../thunks/load-conversation.thunk";
import { setFocus } from "../../conversation-focus/conversation-focus.slice";
import { markCacheBypass } from "../cache-bypass.slice";
import { invalidateConversationCache } from "../invalidate-conversation-cache.thunk";

interface ForkConversationServerArgs {
  conversationId: string;
  /** Provide at most one selector. Empty body copies the entire conversation. */
  selector?: {
    upToPosition?: number;
    fromMessageId?: string;
    /** When true with fromMessageId, the anchor message is NOT copied. */
    exclusive?: boolean;
  };
  /** Optional title for the new conversation. Defaults to `"Fork: <source>"`. */
  title?: string;
  /** If set, the conversation focus jumps to the new fork on success. */
  surfaceKey?: string;
}

interface ForkConversationServerResult {
  conversationId: string;
  forkedFromId: string;
  forkedAtPosition: number | null;
  messageCount: number;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const forkConversationServer = createAsyncThunk<
  ForkConversationServerResult,
  ForkConversationServerArgs,
  ThunkApi
>(
  "conversations/forkServer",
  async (
    { conversationId, selector, title, surfaceKey },
    { dispatch, rejectWithValue },
  ) => {
    const body: ConversationForkBody = {
      up_to_position: selector?.upToPosition ?? null,
      from_message_id: selector?.fromMessageId ?? null,
      exclusive: selector?.exclusive ?? false,
      title: title ?? null,
    };

    const result = await dispatch(
      callConversationFork({ conversationId, body }),
    );

    if (result.error) {
      return rejectWithValue({
        message:
          result.error.message ??
          `Fork endpoint failed: HTTP ${result.error.status ?? "unknown"}`,
      });
    }
    const data = result.data;
    if (!data?.conversation_id) {
      return rejectWithValue({
        message: "Fork endpoint returned no conversation_id",
      });
    }

    // Rehydrate from the canonical bundle so every slice (messages,
    // observability, variables, overrides, UI state) ends up in the same
    // shape as a normal page open. Cheaper than mirroring the DB rows
    // manually and we know it works.
    try {
      await dispatch(
        loadConversation({ conversationId: data.conversation_id }),
      ).unwrap();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[forkConversationServer] loadConversation after fork failed",
        err,
      );
      return rejectWithValue({
        message: `Fork succeeded but rehydration failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }

    if (surfaceKey) {
      dispatch(setFocus({ surfaceKey, conversationId: data.conversation_id }));
    }

    // Cache-busts for both ends of the fork — same rationale as the
    // direct-RPC version: the source's agent cache may have a snapshot
    // without the new `forked_from_id` backref, and the new conversation
    // should rebuild from the DB on its first outbound call rather than
    // trusting anything lazily inherited.
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    dispatch(
      markCacheBypass({
        conversationId: data.conversation_id,
        conversation: true,
      }),
    );
    void dispatch(invalidateConversationCache({ conversationId }));
    void dispatch(
      invalidateConversationCache({
        conversationId: data.conversation_id,
      }),
    );

    return {
      conversationId: data.conversation_id,
      forkedFromId: data.forked_from_id,
      forkedAtPosition: data.forked_at_position ?? null,
      messageCount: data.message_count,
    };
  },
);
