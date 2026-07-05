/**
 * editMessageText — save a plain-text edit to a message WITHOUT re-running.
 *
 * Thin wrapper over `editMessage` that merges the new text into the message's
 * existing content blocks via `mergeEditedText` (so attachments / chips / other
 * non-text blocks survive). Extracted so every "just save the text" caller
 * (inline action bar, options menu, edit modal's Save-only) shares ONE path
 * instead of each re-reading state + calling `mergeEditedText` by hand.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { editMessage } from "./edit-message.thunk";
import { mergeEditedText } from "./content-blocks.util";

interface EditMessageTextArgs {
  conversationId: string;
  messageId: string;
  /** New plain-text content; replaces the message's text block only. */
  newContent: string;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

export const editMessageText = createAsyncThunk<
  void,
  EditMessageTextArgs,
  ThunkApi
>(
  "messages/editMessageText",
  async ({ conversationId, messageId, newContent }, { dispatch, getState }) => {
    const existing =
      getState().messages.byConversationId[conversationId]?.byId?.[messageId]
        ?.content;
    await dispatch(
      editMessage({
        conversationId,
        messageId,
        newContent: mergeEditedText(existing, newContent),
      }),
    ).unwrap();
  },
);
