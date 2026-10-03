// THE NOTE'S WORKING COPY — the body a person is typing, ONE per note, in
// Redux (`workingCopies.byKey["note:<id>"]`, lib/working-copy), shared by every
// editor showing that note: a board tile, the notes side panel, a split pane,
// the phone editor. The editors are VIEWS of it (`useNoteWorkingCopy`), never
// owners of a private copy.
//
// It is the pre-debounce truth: every keystroke lands there first (every view
// updates at once), and ONE coalesced commit per note carries it to the note
// record (`updateNoteContent` → the record's undo history →
// `autoSaveMiddleware`, the one save path). When the last view of a note goes
// (closed, unmounted, a board tile asleep) the pending words are committed and
// the copy is released, so the note record is the truth again and any remount
// reads it.
//
// Non-React readers that must see keystrokes (the draft rescue in
// `notesDrafts.ts`, the delete thunk) use `getNoteLiveContent`; components use
// `selectWorkingCopyValue(state, noteWorkingCopy.key(id))`. Undefined means
// "nothing newer than the note record".

import { defineWorkingCopyKind, type WorkingCopyStoreLike } from "@/lib/working-copy/workingCopyKind";
import { getReduxSyncDelay } from "../redux/notes.types";
import { updateNoteContent } from "../redux/slice";

export const noteWorkingCopy = defineWorkingCopyKind({
  entity: "note",
  delay: (entry) => getReduxSyncDelay(entry?.value?.length ?? 0),
  // The commit is the note record's own edit; persistence is autoSaveMiddleware's.
  save: ({ id, entry, store }) => {
    if (entry.value === undefined) return { savedAt: null };
    store.dispatch(updateNoteContent({ id, content: entry.value }));
    return { value: entry.value, savedAt: null };
  },
});

/** A view holds this note's working copy. Returns the release (the last one commits). */
export function holdNoteWorkingCopy(noteId: string, store: WorkingCopyStoreLike): () => void {
  return noteWorkingCopy.attach(noteId, store);
}

export function getNoteLiveContent(noteId: string): string | undefined {
  return noteWorkingCopy.entry(noteId)?.value;
}
