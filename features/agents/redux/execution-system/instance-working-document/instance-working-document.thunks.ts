/**
 * Instance Working Document thunks.
 *
 * Side-effectful operations for the per-conversation working document:
 *   - `bindWorkingDocumentToNoteThunk`  — bind to a `public.notes` row and seed
 *     the document content from it (enables the doc as a convenience).
 *   - `syncWorkingDocumentFromAgentThunk` — resolve an agent writeback signalled
 *     by a stream `context_changed` event. The event carries no content, so for
 *     note-bound docs we re-read the note (the backend's auto-persist wrote it)
 *     and apply it; for unbound docs there is nothing durable to pull, so it is
 *     a no-op (see the backend caveat in workingDocumentContext.ts).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { refreshNoteContent } from "@/features/notes/redux/thunks";
import {
  applyAgentWorkingDocContent,
  markWorkingDocError,
  setWorkingDocBinding,
  setWorkingDocContent,
  setWorkingDocEnabled,
  setWorkingDocTitle,
} from "./instance-working-document.slice";
import { selectWorkingDocBinding } from "./instance-working-document.selectors";

interface ThunkConfig {
  state: RootState;
  dispatch: AppDispatch;
}

/**
 * Bind the conversation's working document to an existing note and seed the
 * document content from that note. Enables the document.
 */
export const bindWorkingDocumentToNoteThunk = createAsyncThunk<
  void,
  { conversationId: string; noteId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/bindToNote",
  async ({ conversationId, noteId }, { dispatch }) => {
    try {
      const note = await NotesAPI.getById(noteId);
      if (!note) {
        dispatch(
          markWorkingDocError({
            conversationId,
            error: "Could not load the selected note.",
          }),
        );
        return;
      }
      dispatch(
        setWorkingDocBinding({
          conversationId,
          binding: { kind: "note", id: note.id, label: note.label ?? null },
        }),
      );
      if (note.label) {
        dispatch(setWorkingDocTitle({ conversationId, title: note.label }));
      }
      dispatch(
        setWorkingDocContent({ conversationId, content: note.content ?? "" }),
      );
      dispatch(setWorkingDocEnabled({ conversationId, enabled: true }));
    } catch {
      dispatch(
        markWorkingDocError({
          conversationId,
          error: "Could not load the selected note.",
        }),
      );
    }
  },
);

/**
 * Resolve an agent writeback for the working document. Called from the stream
 * processor when a `context_changed` / `context_persisted` event arrives for
 * the `working_document` key.
 *
 * LOUD on failure: a recovery firing means a real change came through that we
 * could not reflect — we log it so the gap is visible rather than silent.
 */
export const syncWorkingDocumentFromAgentThunk = createAsyncThunk<
  void,
  { conversationId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/syncFromAgent",
  async ({ conversationId }, { dispatch, getState }) => {
    const binding = selectWorkingDocBinding(conversationId)(getState());
    if (binding.kind !== "note" || !binding.id) {
      // Unbound: the stream event carries no content and there is no durable
      // source to re-read. Nothing we can reflect (see backend caveat).
      return;
    }
    try {
      const note = await dispatch(refreshNoteContent(binding.id)).unwrap();
      if (note) {
        dispatch(
          applyAgentWorkingDocContent({
            conversationId,
            content: note.content ?? "",
          }),
        );
      }
    } catch (err) {
      console.error(
        "[working-document] failed to resync bound note after agent writeback",
        { conversationId, noteId: binding.id, err },
      );
    }
  },
);
