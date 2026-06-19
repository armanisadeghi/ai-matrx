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
import {
  selectWorkingDocBinding,
  selectWorkingDocContent,
} from "./instance-working-document.selectors";
import {
  getCxWorkingDocument,
  getOrCreateCxWorkingDocument,
  updateCxWorkingDocumentContent,
} from "./cx-working-document.service";

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
 * Ensure the conversation's working document has a durable `cx_working_documents`
 * backing row and bind to it (the chat default — the Scribe pattern). Creating
 * the row flips the published context value to `persist: "auto"` +
 * `source: { kind: "cx_working_document", id, field: "content" }`, so the agent's
 * `ctx_patch` edits persist server-side and round-trip back via realtime + the
 * post-turn re-read fallback.
 *
 * Idempotent: a row already exists → we reuse it. Seeds the slice from the row
 * when the row has content (re-opening a conversation); pushes any pre-existing
 * local content up to a freshly-created empty row so nothing is lost.
 */
export const ensureWorkingDocumentRowThunk = createAsyncThunk<
  void,
  { conversationId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/ensureRow",
  async ({ conversationId }, { dispatch, getState }) => {
    const binding = selectWorkingDocBinding(conversationId)(getState());
    // Already bound to a durable source (cx row or user-picked note) — nothing
    // to do. We never override an explicit note binding with the default.
    if (binding.kind !== "none" && binding.id) return;

    try {
      const doc = await getOrCreateCxWorkingDocument(conversationId);
      dispatch(
        setWorkingDocBinding({
          conversationId,
          binding: {
            kind: "cx_working_document",
            id: doc.id,
            label: doc.title,
          },
        }),
      );

      const localContent = selectWorkingDocContent(conversationId)(getState());
      if (doc.content) {
        // Row has content (re-opened conversation) — load it as authoritative.
        dispatch(
          applyAgentWorkingDocContent({ conversationId, content: doc.content }),
        );
      } else if (localContent) {
        // Fresh empty row but the user already typed — push local content up.
        await updateCxWorkingDocumentContent(doc.id, localContent);
      }
    } catch (err) {
      console.error(
        "[working-document] failed to ensure cx_working_documents row",
        { conversationId, err },
      );
      dispatch(
        markWorkingDocError({
          conversationId,
          error: "Could not prepare the working document.",
        }),
      );
    }
  },
);

/**
 * Resolve an agent writeback for the working document. Called from the stream
 * processor when a `context_changed` / `context_persisted` event arrives for
 * the `working_document` key. The event carries no content, so we re-read the
 * bound durable source (cx_working_documents row or bound note) and apply it.
 *
 * For `cx_working_document` bindings Supabase realtime usually delivers the
 * edit first; this re-read is the belt-and-suspenders fallback (and the primary
 * path when realtime is unavailable).
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

    if (binding.kind === "cx_working_document") {
      try {
        const doc = await getCxWorkingDocument(conversationId);
        if (doc) {
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              content: doc.content ?? "",
            }),
          );
        }
      } catch (err) {
        console.error(
          "[working-document] failed to resync cx_working_documents row after agent writeback",
          { conversationId, docId: binding.id, err },
        );
      }
      return;
    }

    if (binding.kind === "note" && binding.id) {
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
      return;
    }

    // Unbound: the stream event carries no content and there is no durable
    // source to re-read. Nothing we can reflect (see backend caveat).
  },
);
