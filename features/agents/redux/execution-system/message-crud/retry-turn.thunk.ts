/**
 * retryConversationTurn — re-run the last turn after a failure.
 *
 * This is THE retry entry point. It honors the backend failure-and-retry
 * contract (migrations 0061–0063): a failed turn is persisted and KEPT in
 * history — the user's message stays `active`, the assistant turn is saved
 * `status='failed'`, `is_visible_to_model=false`. To recover you call the
 * normal continue endpoint with `{ retry: true }` and no input. Nothing is
 * deleted. See `aidream/api/docs/CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md`.
 *
 * Two paths, picked automatically from whether the failed turn ever reached
 * the server:
 *
 *   1. Server-side failure — the last user message is PERSISTED
 *      (`_clientStatus !== "pending"`: promoted from its `record_reserved`
 *      or hydrated from the DB). Re-run via the contract:
 *      `executeInstance({ retry: true })` POSTs `{ retry: true, stream: true }`
 *      with NO `user_input`. The server re-attempts; because the failed
 *      assistant turn is hidden from the model, the context ends at the
 *      user's message and it tries again. **Non-destructive** — the failed
 *      turn remains in history, ordered just before its successful retry
 *      (they share a `position`; `(position, created_at)` ordering keeps them
 *      in attempt order).
 *
 *   2. Client-side failure — the last user message is still OPTIMISTIC
 *      (`_clientStatus === "pending"`): the request never reached the server
 *      (e.g. "Failed to fetch"), so there is no persisted state to retry.
 *      Re-SEND it as a fresh turn: extract its text + non-text parts, drop
 *      the optimistic bubble (so it isn't duplicated and the turn re-routes
 *      correctly), re-seed the input slice, and dispatch `executeInstance()`.
 *
 * This replaces the old `atomicRetry`, which client-side soft-deleted the
 * failed turn and everything after it before resubmitting. That contradicted
 * the new "keep the failed turn in history" contract and is gone.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { MessagePart } from "@/types/python-generated/stream-events";
import { removeMessage } from "../messages/messages.slice";
import {
  setUserInputText,
  setUserInputMessageParts,
} from "../instance-user-input/instance-user-input.slice";
import { executeInstance } from "../thunks/execute-instance.thunk";

interface RetryConversationTurnArgs {
  conversationId: string;
}

interface RetryConversationTurnResult {
  conversationId: string;
  mode: "retry" | "resend";
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

/**
 * Split a user message's `content` blocks back into the two shapes the input
 * slice understands: a flat text string (joined from every `text` part) and a
 * non-text `MessagePart[]` (media, input_*, etc.). Tool-shaped parts can never
 * appear on a user message but are dropped defensively. Mirrors how
 * `assembleRequest` reconstructs `user_input`, so a re-send produces the same
 * payload the original send did.
 */
function splitUserContent(content: unknown): {
  text: string;
  parts: MessagePart[];
} {
  const rawBlocks = Array.isArray(content) ? (content as MessagePart[]) : [];
  let text = "";
  const parts: MessagePart[] = [];
  const ASSISTANT_ONLY_TYPES = new Set(["tool_call", "tool_result", "thinking"]);
  for (const block of rawBlocks) {
    const type = block.type ?? "";
    if (ASSISTANT_ONLY_TYPES.has(type)) continue;
    if (type === "text") {
      const t = "text" in block ? block.text : undefined;
      if (typeof t === "string" && t.length > 0) {
        text = text ? `${text}\n${t}` : t;
      }
      continue;
    }
    parts.push(block);
  }
  return { text, parts };
}

export const retryConversationTurn = createAsyncThunk<
  RetryConversationTurnResult,
  RetryConversationTurnArgs,
  ThunkApi
>(
  "messages/retryConversationTurn",
  async ({ conversationId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState();
    const entry = state.messages.byConversationId[conversationId];
    const ordered = entry
      ? entry.orderedIds.map((id) => entry.byId[id]).filter(Boolean)
      : [];

    // Walk back to the most recent non-deleted user message — the turn we are
    // recovering. (Retry re-runs the last turn; we only read this message to
    // decide retry-vs-resend and, for resend, to reconstruct the input.)
    let lastUserMessage: (typeof ordered)[number] | undefined;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const m = ordered[i];
      if (m.role === "user" && !m.deletedAt) {
        lastUserMessage = m;
        break;
      }
    }

    if (!lastUserMessage) {
      return rejectWithValue({
        message: "No user message to retry — send a message first.",
      });
    }

    // Persisted server-side → re-run via the non-destructive retry contract.
    if (lastUserMessage._clientStatus !== "pending") {
      await dispatch(executeInstance({ conversationId, retry: true })).unwrap();
      return { conversationId, mode: "retry" };
    }

    // Never reached the server → re-send the message as a fresh turn.
    const { text, parts } = splitUserContent(lastUserMessage.content);
    if (!text && parts.length === 0) {
      return rejectWithValue({
        message:
          "The message has no content to resend. Edit it or send a new one.",
      });
    }

    // Drop the optimistic bubble first: executeInstance re-adds it from the
    // input slice, and leaving it would both duplicate it and miscount the
    // turn (an unsent turn-1 would route as a continuation and 404).
    dispatch(removeMessage({ conversationId, messageId: lastUserMessage.id }));
    dispatch(setUserInputText({ conversationId, text }));
    if (parts.length > 0) {
      dispatch(setUserInputMessageParts({ conversationId, parts }));
    }
    await dispatch(executeInstance({ conversationId })).unwrap();
    return { conversationId, mode: "resend" };
  },
);
