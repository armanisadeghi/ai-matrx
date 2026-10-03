// features/notes/redux/noteSaveRequests.ts
//
// A note record changed outside its text editor — a rename, a folder move,
// tags, sharing, undo / redo, an agent's or a tool's write — so the note has
// unsaved work. This middleware only REQUESTS the save; the save itself (and
// its retry, offline wait, hold until saved and conflict) belongs to the note's
// working copy, the ONE door (`utils/noteLiveContent.ts`). It never writes,
// times or retries anything itself.
//
// A change to the record first commits the words still pending in the working
// copy (so they are an undo step, never overwritten); a body written from
// outside then becomes the working copy's text in every view.

import type { Middleware } from "@reduxjs/toolkit";
import type { NoteRecord } from "./notes.types";
import { updateNoteContent } from "./slice";
import { NOTE_WORKING_COPY_COMMIT, noteWorkingCopy, requestNoteSave } from "../utils/noteLiveContent";

type StateWithNotes = { notes?: { notes?: Record<string, NoteRecord | undefined> } };

const NOTE_FIELD_EDITS = new Set([
  "notes/updateNoteContent",
  "notes/updateNoteLabel",
  "notes/updateNoteFolder",
  "notes/updateNoteTags",
  "notes/setNoteField",
  "notes/setNoteFields",
  "notes/undoNoteEdit",
  "notes/redoNoteEdit",
]);

const recordOf = (state: unknown, id: string) => (state as StateWithNotes).notes?.notes?.[id];

export const noteSaveRequestMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const { type, payload, meta } = action as {
    type?: string;
    payload?: { id?: string };
    meta?: Record<string, unknown>;
  };
  const noteId = payload?.id;
  // The door's own steps (its content commit, its auto-label) belong to the save in progress.
  if (!type || !noteId || !NOTE_FIELD_EDITS.has(type) || meta?.[NOTE_WORKING_COPY_COMMIT] || meta?.notesAutoLabel) {
    return next(action);
  }
  // Words still pending in an editor reach the record first — an undo step,
  // never overwritten by this change (the save that follows writes both).
  const pending = noteWorkingCopy.entry(noteId);
  const held = recordOf(storeApi.getState(), noteId);
  if (held && pending?.dirty && pending.value !== undefined && pending.value !== held.content) {
    next({ ...updateNoteContent({ id: noteId, content: pending.value }), meta: { [NOTE_WORKING_COPY_COMMIT]: true } });
  }
  const before = recordOf(storeApi.getState(), noteId)?.content;
  const result = next(action);
  const record = recordOf(storeApi.getState(), noteId);
  if (!record?._dirty) return result;
  const bodyMoved = typeof record.content === "string" && record.content !== before;
  void requestNoteSave(noteId, storeApi, bodyMoved ? { value: record.content ?? "" } : undefined);
  return result;
};
