// THE NOTE'S WORKING COPY — the body a person is typing, kept ONCE per note
// (keyed by note id) and shared by every editor showing that note: a board
// tile, the notes side panel, a split pane, the phone editor. The editors are
// VIEWS of it (`useNoteWorkingCopy`), never owners of a private copy.
//
// It is the pre-debounce truth: every keystroke lands here first (every view
// updates at once), and ONE coalesced commit per note carries it to Redux
// (`updateNoteContent` → the record's undo history → `autoSaveMiddleware`, the
// one save path). When the last view of a note goes (closed, unmounted, a
// board tile asleep) the pending words are committed synchronously and the
// copy is released, so Redux is the truth again and any remount reads it.
//
// Readers that must track keystrokes (NoteStatsFooter, the save-failure
// banner, the draft rescue in `notesDrafts.ts`, the save thunk) read it with
// `getNoteLiveContent` / `subscribeNoteLiveContent`; undefined means "nothing
// newer than Redux".
//
// Primitive: `lib/working-copy/` (one session per record, one commit per
// record). Before it, each editor kept a local buffer and timer and wrote a
// module map that the FIRST unmounting view cleared while another was still
// typing (notes audit N-07).

import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { createWorkingCopyStore } from "@/lib/working-copy/workingCopyStore";
import { getReduxSyncDelay } from "../redux/notes.types";
import { updateNoteContent } from "../redux/slice";

/** The dispatch each note commits through — the store its views render from. */
const committers = new Map<string, Dispatch<UnknownAction>>();

export const noteWorkingCopy = createWorkingCopyStore<string>({
  name: "notes",
  commitDelay: (content) => getReduxSyncDelay(content.length),
  commit: (noteId, content) => {
    const dispatch = committers.get(noteId) ?? getStoreSingleton()?.dispatch;
    if (!dispatch) {
      throw new Error(`No store to commit note ${noteId} into — the edit stays in its working copy.`);
    }
    dispatch(updateNoteContent({ id: noteId, content }));
  },
});

/**
 * A view holds this note's working copy, committing through `dispatch`.
 * Returns the release (commits pending words when it is the last view).
 */
export function holdNoteWorkingCopy(noteId: string, dispatch: Dispatch<UnknownAction>): () => void {
  committers.set(noteId, dispatch);
  const release = noteWorkingCopy.attach(noteId);
  return () => {
    release();
    if (noteWorkingCopy.views(noteId) === 0 && !noteWorkingCopy.hasPending(noteId)) {
      committers.delete(noteId);
    }
  };
}

export function getNoteLiveContent(noteId: string): string | undefined {
  return noteWorkingCopy.get(noteId);
}

export function subscribeNoteLiveContent(noteId: string, listener: () => void): () => void {
  return noteWorkingCopy.subscribe(noteId, listener);
}
