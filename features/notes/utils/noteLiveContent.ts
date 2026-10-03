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
//
// NO SILENT LOST UPDATE (2026-10-03). The base an edit starts from is held
// from the FIRST keystroke: the copy going unsaved marks the note record's body
// as edited (`noteContentEditPending`), so a collaborator's row arriving in the
// debounce window is kept as an observation and the commit saves on the old
// version — the CAS rejects it and the note's own conflict window opens. And
// right before every commit the primitive compares the record's body with that
// base (`source`): a move under unsaved words is a working-copy conflict with a
// visible choice, never a commit on top. Retry of the DB write stays the
// record's (autoSaveMiddleware): this kind's save is a synchronous Redux
// commit that cannot fail on the network.

import {
  defineWorkingCopyKind,
  type WorkingCopyKind,
  type WorkingCopyStoreLike,
} from "@/lib/working-copy/workingCopyKind";
import { announceWorkingCopyConflict, dismissWorkingCopyConflict } from "@/lib/working-copy/announce";
import { getReduxSyncDelay } from "../redux/notes.types";
import { noteContentEditPending, noteContentEditSettled, updateNoteContent } from "../redux/slice";

type WithNoteBodies = { notes?: { notes?: Record<string, { content?: string | null; version?: number | null } | undefined> } };

export const noteWorkingCopy: WorkingCopyKind<never> = defineWorkingCopyKind({
  entity: "note",
  delay: (entry) => getReduxSyncDelay(entry?.value?.length ?? 0),
  // The commit is the note record's own edit; persistence is autoSaveMiddleware's.
  save: ({ id, entry, store }) => {
    if (entry.value === undefined) return { savedAt: null };
    store.dispatch(updateNoteContent({ id, content: entry.value }));
    return { value: entry.value, savedAt: null };
  },
  source: (id, store) => {
    const record = (store.getState() as WithNoteBodies).notes?.notes?.[id];
    return typeof record?.content === "string"
      ? { value: record.content, version: record.version ?? null }
      : undefined;
  },
  onDirtyChanged: (id, dirty, store) => {
    store.dispatch(dirty ? noteContentEditPending({ id }) : noteContentEditSettled({ id }));
  },
  onConflict: (id, conflict) => announceWorkingCopyConflict(noteWorkingCopy, id, "Note", conflict),
  onConflictResolved: (id) => dismissWorkingCopyConflict(noteWorkingCopy, id),
});

/** A view holds this note's working copy. Returns the release (the last one commits). */
export function holdNoteWorkingCopy(noteId: string, store: WorkingCopyStoreLike): () => void {
  return noteWorkingCopy.attach(noteId, store);
}

export function getNoteLiveContent(noteId: string): string | undefined {
  return noteWorkingCopy.entry(noteId)?.value;
}
