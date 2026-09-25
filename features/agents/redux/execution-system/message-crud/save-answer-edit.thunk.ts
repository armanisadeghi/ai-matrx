/**
 * saveAnswerEdit — the chat-message SAVE ADAPTER (rich-content RC-B5).
 *
 * The one path an edited answer text takes back to its row:
 *
 *   1. Splice the edited string into the stored parts (`spliceAnswerText`):
 *      only the touched text part changes; tool / kind / media / thinking
 *      parts and untouched text segments are carried through as-is.
 *   2. No change → nothing is written (no RPC, no history entry).
 *   3. Otherwise → `editMessage` → `cx_message_edit`, the canonical write
 *      path, which archives the prior content into `content_history` (the
 *      platform's version mechanism for messages) and stamps `status='edited'`.
 *   4. Returns the answer text AS STORED (projected from the row the RPC
 *      returned) so the editor can prove the write byte-for-byte.
 *
 * Whether the model sees the edit on the next turn is the organization's
 * `agents.messages / edited_answer_visible_to_model` knob, applied server-side
 * where history is rebuilt (matrx-ai `db/edited_answers.py`).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { editMessage } from "./edit-message.thunk";
import { projectAnswerText, spliceAnswerText } from "./answer-text-splice";

export interface SaveAnswerEditArgs {
  conversationId: string;
  messageId: string;
  /** The whole edited answer text (no citation markers). */
  newText: string;
}

export interface SaveAnswerEditResult {
  written: boolean;
  /** The answer text as the row now holds it. */
  storedText: string;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const saveAnswerEdit = createAsyncThunk<SaveAnswerEditResult, SaveAnswerEditArgs, ThunkApi>(
  "messages/saveAnswerEdit",
  async ({ conversationId, messageId, newText }, { dispatch, getState, rejectWithValue }) => {
    const record = getState().messages.byConversationId[conversationId]?.byId?.[messageId];
    if (!record) {
      return rejectWithValue({ message: "This answer is no longer loaded — reload the conversation and edit again." });
    }
    const plan = spliceAnswerText(record.content, newText);
    if ("error" in plan) return rejectWithValue({ message: plan.error });
    if (!plan.changed) {
      return { written: false, storedText: projectAnswerText(record.content).text };
    }
    try {
      await dispatch(
        editMessage({ conversationId, messageId, newContent: plan.content as Json }),
      ).unwrap();
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
      return rejectWithValue({ message });
    }
    const after = getState().messages.byConversationId[conversationId]?.byId?.[messageId];
    return { written: true, storedText: projectAnswerText(after?.content).text };
  },
);
