/**
 * saveAnswerEdit — the chat-message SAVE ADAPTER (rich-content RC-B5).
 *
 * The one path an edited answer text takes back to its row:
 *
 *   1. Re-read the row's STORED content from the database. The loaded Redux
 *      record is not the truth: an answer streamed in this session is committed
 *      client-side in its own shape (inline `<reasoning>` inside one text part)
 *      while the server stored a `thinking` part + a text part — splicing
 *      against the Redux copy wrote the client shape over the row and dropped
 *      the thinking part (live, 2026-09-25).
 *   2. If the stored answer is no longer what the editor opened on, refuse —
 *      someone (another tab, an inline edit) changed it; nothing is written.
 *   3. Splice the edited string into the stored parts (`spliceAnswerText`):
 *      only the touched text part changes; tool / kind / media / thinking
 *      parts and untouched text segments are carried through as-is.
 *   4. No change → nothing is written (no RPC, no history entry).
 *   5. Otherwise → `editMessage` → `cx_message_edit`, the canonical write
 *      path, which archives the prior content into `content_history` (the
 *      platform's version mechanism for messages) and stamps `status='edited'`;
 *      the RPC's returned row replaces the Redux record.
 *   6. Returns the answer text AS STORED (projected from the returned row) so
 *      the editor can prove the write byte-for-byte.
 *
 * Whether the model sees the edit on the next turn is the organization's
 * `agents.messages / edited_answer_visible_to_model` knob, applied server-side
 * where history is rebuilt (matrx-ai `db/edited_answers.py`).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { editMessage } from "./edit-message.thunk";
import { projectAnswerText, spliceAnswerText, spliceDisplayEdit } from "./answer-text-splice";

export interface SaveAnswerEditArgs {
  conversationId: string;
  messageId: string;
  /** The whole edited answer text, in STORED bytes (the in-place editor). */
  newText?: string;
  /**
   * An in-body edit made on DISPLAY text (code block, table, decision, task
   * toggle): only its changed span is spliced into the stored text
   * (`spliceDisplayEdit`), so whitespace the view normalized is never rewritten.
   */
  displayEdit?: { previous: string; next: string };
  /**
   * The stored answer text the editor opened on (`fetchStoredAnswer`). When
   * given, a row that changed since then is refused instead of overwritten.
   */
  openedText?: string;
}

/** The row's stored content, read from the database (never the Redux copy). */
export async function fetchStoredAnswer(messageId: string): Promise<{ content: unknown; text: string }> {
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select("content")
    .eq("id", messageId)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "This answer could not be read — reload the conversation and edit again.");
  }
  return { content: data.content, text: projectAnswerText(data.content).text };
}

export interface SaveAnswerEditResult {
  written: boolean;
  /** The answer text as the row now holds it. */
  storedText: string;
  /**
   * How many separate spans of the stored answer this save changed (a
   * display edit: one per mapped hunk; a whole-text edit: 1). 0 = nothing.
   */
  changedSpans: number;
  /** The change touched most of the answer — say "rewritten", not a count. */
  mostlyRewritten: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  /** `code: "stale"` — the saved answer changed since the editor opened. */
  rejectValue: { message: string; code?: "stale"; storedText?: string };
}

export const saveAnswerEdit = createAsyncThunk<SaveAnswerEditResult, SaveAnswerEditArgs, ThunkApi>(
  "messages/saveAnswerEdit",
  async ({ conversationId, messageId, newText: givenText, displayEdit, openedText }, { dispatch, getState, rejectWithValue }) => {
    const record = getState().messages.byConversationId[conversationId]?.byId?.[messageId];
    if (!record) {
      return rejectWithValue({ message: "This answer is no longer loaded — reload the conversation and edit again." });
    }
    let stored: { content: unknown; text: string };
    try {
      stored = await fetchStoredAnswer(messageId);
    } catch (error) {
      return rejectWithValue({ message: error instanceof Error ? error.message : String(error) });
    }
    if (openedText !== undefined && stored.text !== openedText) {
      return rejectWithValue({
        code: "stale",
        storedText: stored.text,
        message: "This answer changed since you opened it (another tab or edit saved first), so nothing was saved",
      });
    }
    let newText = givenText;
    let changedSpans = 1;
    let mostlyRewritten = false;
    if (displayEdit) {
      const mapped = spliceDisplayEdit(stored.text, displayEdit.previous, displayEdit.next);
      if ("error" in mapped) return rejectWithValue({ message: mapped.error });
      newText = mapped.text;
      changedSpans = mapped.changedSpans;
      mostlyRewritten = mapped.mostlyRewritten;
    }
    if (newText === undefined) {
      return rejectWithValue({ message: "Nothing to save: no edited text was given." });
    }
    const plan = spliceAnswerText(stored.content, newText);
    if ("error" in plan) return rejectWithValue({ message: plan.error });
    if (!plan.changed) {
      return { written: false, storedText: stored.text, changedSpans: 0, mostlyRewritten: false };
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
    return { written: true, storedText: projectAnswerText(after?.content).text, changedSpans, mostlyRewritten };
  },
);

/**
 * THE door for any surface that edited a message's DISPLAY text (the old
 * full-screen editor, the HTML preview, a source adapter): an assistant row is
 * saved by splicing only the changed span into its STORED text (`displayEdit`);
 * a user row keeps its text-merge contract (`editMessageText` — user rows are
 * written by the client and carry no normalized view). Throws with the reason
 * when nothing was written.
 */
export async function saveMessageDisplayEdit(
  dispatch: AppDispatch,
  getState: () => RootState,
  args: { conversationId: string; messageId: string; previous: string; next: string },
): Promise<void> {
  const record = getState().messages.byConversationId[args.conversationId]?.byId?.[args.messageId];
  if (record && record.role !== "assistant") {
    const { editMessageText } = await import("./edit-message-text.thunk");
    await dispatch(
      editMessageText({ conversationId: args.conversationId, messageId: args.messageId, newContent: args.next }),
    ).unwrap();
    return;
  }
  const result = await dispatch(
    saveAnswerEdit({
      conversationId: args.conversationId,
      messageId: args.messageId,
      displayEdit: { previous: args.previous, next: args.next },
    }),
  );
  if (saveAnswerEdit.rejected.match(result)) {
    throw new Error(result.payload?.message ?? result.error.message ?? "The answer was not saved.");
  }
}
