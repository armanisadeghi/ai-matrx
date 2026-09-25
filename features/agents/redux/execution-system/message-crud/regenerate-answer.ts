/**
 * regenerateAnswer — plain "Regenerate" on the latest answer (no edit), the
 * ChatGPT / Claude.ai retry. Beside the existing edit paths:
 *   - Edit & resubmit (overwriteAndResend) — change the question, re-run.
 *   - Fork & regenerate — re-run on a NEW branch conversation.
 *   - Regenerate (this) — same question, same conversation, new answer.
 *
 * Flow: anchor on the user message the latest answer replied to, soft-delete
 * everything after it through the SAME atomic RPC the overwrite path uses
 * (`cx_truncate_conversation_after` — archived, never purged), rehydrate, and
 * re-run the now-unanswered turn with `executeInstance({ retry: true })` —
 * the same primitive the failure Retry button uses. No user text is re-sent,
 * so the question is never duplicated.
 *
 * Only the LATEST answer can be regenerated in place: regenerating an older
 * one would silently drop every later turn. Older answers use Fork.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { markCacheBypass } from "./cache-bypass.slice";
import { invalidateConversationCache } from "./invalidate-conversation-cache.thunk";
import { executeInstance } from "../thunks/execute-instance.thunk";
import { loadConversation } from "../thunks/load-conversation.thunk";
import { selectRegenerateAnchor } from "./regenerate-anchor";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const regenerateAnswer = createAsyncThunk<
  { conversationId: string },
  { conversationId: string; assistantMessageId: string },
  ThunkApi
>(
  "messages/regenerateAnswer",
  async (
    { conversationId, assistantMessageId },
    { dispatch, getState, rejectWithValue },
  ) => {
    const anchor = selectRegenerateAnchor(getState(), conversationId, assistantMessageId);
    if (!anchor) {
      return rejectWithValue({
        message: "Only the latest answer can be regenerated here — use Fork for an earlier one.",
      });
    }
    const { error } = await supabase.rpc("cx_truncate_conversation_after", {
      p_conversation_id: conversationId,
      p_after_position: anchor.userPosition,
    });
    if (error) {
      console.error("[regenerateAnswer] truncate failed", error);
      return rejectWithValue({ message: error.message ?? "Couldn't archive the current answer" });
    }
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));
    try {
      await dispatch(loadConversation({ conversationId })).unwrap();
    } catch (err) {
      // The next turn's bundle reload catches up; the re-run can still fire.
      console.error("[regenerateAnswer] reload after truncate failed", err);
    }
    void dispatch(executeInstance({ conversationId, retry: true }));
    return { conversationId };
  },
);
