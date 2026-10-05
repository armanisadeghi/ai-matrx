/**
 * stampPersistedRemarkHandles — after a turn, read the person's saved message
 * and stamp the remark handles (c1, c2 …) the server minted onto the in-memory
 * copy, so every "Reply in thread · cN" line is a door the moment the reply
 * lands — not after a reload. One row read, handles only: the transcript the
 * person saw is never rewritten.
 *
 * A receipt names ONE handle at a time and cannot say which of several
 * handle-less remarks on one answer it means; the saved row names them all.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { durableRecordId } from "@ai-matrx/kit/ids";
import { supabase } from "../../../../host/db";
import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import type { Json } from "../../../../host/db-types";
import { updateMessageRecord } from "../messages/messages.slice";
import { selectConversationMessages } from "../messages/messages.selectors";
import { hasHandlelessRemark, withPersistedHandles } from "../instance-resources/remark-handles";

interface ThunkApi {
  dispatch: ChatDispatch;
  state: ChatRootState;
}

const RETRY_DELAYS_MS = [0, 400, 1000, 2000];

export const stampPersistedRemarkHandles = createAsyncThunk<number, { conversationId: string }, ThunkApi>(
  "messages/stampPersistedRemarkHandles",
  async ({ conversationId }, { dispatch, getState }) => {
    const wanted = () =>
      selectConversationMessages(conversationId)(getState()).filter(
        (m) =>
          m.role === "user" &&
          durableRecordId(m.id) !== null &&
          (hasHandlelessRemark(m.content) || hasHandlelessRemark(m.userContent)),
      );
    let stamped = 0;
    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const pending = wanted();
      if (pending.length === 0) break;
      for (const message of pending) {
        const { data, error } = await supabase
          .schema("chat")
          .from("message")
          .select("content, user_content")
          .eq("id", message.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) {
          console.error("[stampPersistedRemarkHandles] read failed:", error.message);
          continue;
        }
        if (!data) continue;
        const persisted = [data.content, data.user_content];
        const patch: { content?: Json; userContent?: Json } = {};
        for (const source of persisted) {
          const content = withPersistedHandles(message.content, source);
          if (content) patch.content = content as Json;
          const userContent = withPersistedHandles(message.userContent, source);
          if (userContent) patch.userContent = userContent as Json;
        }
        if (patch.content || patch.userContent) {
          dispatch(updateMessageRecord({ conversationId, messageId: message.id, patch }));
          stamped += 1;
        }
      }
      if (wanted().length === 0) break;
    }
    return stamped;
  },
);
