// THE NOTE'S WORKING COPY — and its ONE save door.
//
// The body a person is typing lives ONCE per note in Redux
// (`workingCopies.byKey["note:<id>"]`, lib/working-copy), shared by every
// editor showing that note: a board tile, the notes side panel, a split pane,
// Quick Notes, the phone editor. The editors are VIEWS of it
// (`useNoteWorkingCopy`), never owners of a private copy.
//
// ONE DOOR (2026-10-03). The working copy's save IS the note's database save.
// Its steps, once per save:
//   1. the working text reaches the note record (`updateNoteContent` — one
//      undo step);
//   2. the auto-label ("New Note" takes the body's first line);
//   3. the record's dirty fields are written (`writeNoteRecord`, a
//      compare-and-swap on the version the edit started from).
// So the primitive's guarantees cover the write that matters: a failure is
// held and retried (1s → 30s backoff, never while offline, at once on
// reconnect / the tab returning) whether or not any view is still open, the
// note's session is held until it lands, and a stored row that moved under the
// person's words is the primitive's conflict — Keep mine / Take theirs / Merge
// in the editor (`WorkingCopyAlert`) or the toast when no editor is open.
// Everything else that saves a note (Save, a rename, an agent's write, a
// folder move) asks THIS door (`requestNoteSave`, or `saveNote` which calls
// it) — no other path writes a note's content.
//
// NO SILENT LOST UPDATE. The base an edit starts from is held from the FIRST
// keystroke: the copy going unsaved marks the record's body as edited
// (`noteContentEditPending`), so a collaborator's row arriving meanwhile is
// kept as the record's remote observation, never merged under the typing.
// Right before each save the primitive compares that observation with the
// base (`source`); the write's compare-and-swap is the backstop.
//
// Non-React readers that must see keystrokes (the draft rescue in
// `notesDrafts.ts`, the delete thunk) use `getNoteLiveContent`; components use
// `selectWorkingCopyValue(state, noteWorkingCopy.key(id))`.

import {
  defineWorkingCopyKind,
  WorkingCopySaveConflict,
  type WorkingCopyKind,
  type WorkingCopyStoreLike,
} from "@/lib/working-copy/workingCopyKind";
import { announceWorkingCopyConflict, dismissWorkingCopyConflict } from "@/lib/working-copy/announce";
import { getReduxSyncDelay, NOTE_SAVE_MAX_WAIT_MS, type NoteRecord, type NoteUndoableField } from "../redux/notes.types";
import type { Note } from "../types";
import { equalNoteSnapshotValue } from "../noteSnapshotEquality";
import {
  discardNoteUnsavedEdits,
  markNoteSaved,
  noteContentEditPending,
  noteContentEditSettled,
  resolveNoteStoredConflict,
  updateNoteContent,
  updateNoteLabel,
} from "../redux/slice";
import { writeNoteRecord } from "../redux/noteRecordWrite";
import { generateLabelFromContent } from "../hooks/useAutoLabel";
import { isNoteLabelEditing } from "./labelEditing";

type WithNotes = { notes?: { notes?: Record<string, NoteRecord | undefined> } };

const recordOf = (store: WorkingCopyStoreLike, id: string): NoteRecord | undefined =>
  (store.getState() as WithNotes).notes?.notes?.[id];

/** The writes per note (latest few), so `saveNote` reports the write its request caused. */
let writeSeq = 0;
const writes = new Map<string, Array<{ seq: number; action: unknown }>>();
function recordWrite(noteId: string, action: unknown): void {
  const list = writes.get(noteId) ?? [];
  list.push({ seq: ++writeSeq, action });
  if (list.length > 4) list.shift();
  writes.set(noteId, list);
}
/** A mark to read writes after (`lastNoteWriteSince`). */
export function noteWriteMark(): number {
  return writeSeq;
}
/** The latest write of this note after `mark`, if any ran. */
export function lastNoteWriteSince(noteId: string, mark: number): unknown {
  const list = writes.get(noteId);
  const last = list?.[list.length - 1];
  return last && last.seq > mark ? last.action : undefined;
}

/**
 * Who made the unsaved edit. A note's words are written only as the person
 * who typed them — never as whoever is signed in when a retry fires.
 */
const editedBy = new Map<string, string | null>();
const actorOf = (store: WorkingCopyStoreLike): string | null =>
  (store.getState() as { userAuth?: { id?: string | null } }).userAuth?.id ?? null;

/** Marks this door's own content commit (the save-request middleware ignores it). */
export const NOTE_WORKING_COPY_COMMIT = "noteWorkingCopyCommit";

/** The stored row a refused write (or realtime) brought, when it is newer than the record's base. */
function storedBody(record: NoteRecord | undefined): { value: string; version: number } | undefined {
  const observed = record?._remoteObservation;
  if (!record || !observed?.complete || typeof observed.note.content !== "string") return undefined;
  if (observed.version === null || observed.version <= record.version) return undefined;
  return { value: observed.note.content, version: observed.version };
}

/** "New Note" takes the body's first line — never while the person is naming it, never over their name. */
function applyAutoLabel(id: string, store: WorkingCopyStoreLike): void {
  const record = recordOf(store, id);
  if (!record) return;
  const label = record.label?.trim() ?? "";
  const unnamed = label === "" || label.toLowerCase() === "new note";
  if (!unnamed || isNoteLabelEditing(id) || record._dirtyFields.has("label")) return;
  if (!record.content || record.content.trim().length < 12) return;
  const generated = generateLabelFromContent(record.content);
  if (!generated) return;
  const labelled = { ...updateNoteLabel({ id, label: generated }), meta: { notesAutoLabel: true } };
  store.dispatch(labelled);
}

function dirtyValues(record: NoteRecord): Partial<Record<NoteUndoableField, Note[NoteUndoableField]>> {
  const values: Partial<Record<NoteUndoableField, Note[NoteUndoableField]>> = {};
  for (const field of record._dirtyFields) values[field] = record[field];
  return values;
}

/** A persisted record whose every unsaved field equals its acknowledged stored row. */
function holdsStoredValues(record: NoteRecord | undefined): boolean {
  const stored = record?._acknowledgedPhysicalSnapshot;
  if (!record || !stored || record._isAutogenerated || !record._dirty) return false;
  for (const field of record._dirtyFields) {
    if (!equalNoteSnapshotValue(record[field] ?? null, stored[field] ?? null)) return false;
  }
  return true;
}

type WriteAction = { type: string; error?: { name?: string; message?: string; code?: string } };

async function writeOnce(id: string, store: WorkingCopyStoreLike): Promise<WriteAction> {
  const dispatch = store.dispatch as unknown as (thunk: ReturnType<typeof writeNoteRecord>) => Promise<WriteAction>;
  const action = await dispatch(writeNoteRecord(id));
  recordWrite(id, action);
  return action;
}

const refusedByVersion = (action: WriteAction) =>
  writeNoteRecord.rejected.match(action) && action.error?.name === "NoteUpdateConflictError";

function writeError(action: WriteAction): Error {
  const error = new Error(action.error?.message ?? "Saving this note failed.");
  if (action.error?.name) error.name = action.error.name;
  if (action.error?.code) Object.assign(error, { code: action.error.code });
  return error;
}

export const noteWorkingCopy: WorkingCopyKind<never> = defineWorkingCopyKind({
  entity: "note",
  delay: (entry) => getReduxSyncDelay(entry?.value?.length ?? 0),
  // Someone typing without a one-second pause still saves every few seconds.
  maxWait: NOTE_SAVE_MAX_WAIT_MS,
  save: async ({ id, entry, store }) => {
    if (!recordOf(store, id)) {
      throw Object.assign(new Error("This note is no longer open here."), { status: 404 });
    }
    if (editedBy.has(id) && editedBy.get(id) !== actorOf(store)) {
      throw Object.assign(new Error("Your sign-in changed before this note was saved."), { status: 403 });
    }
    // 1. The working text reaches the record — one undo step per save.
    if (entry.value !== undefined && recordOf(store, id)?.content !== entry.value) {
      const committed = { ...updateNoteContent({ id, content: entry.value }), meta: { [NOTE_WORKING_COPY_COMMIT]: true } };
      store.dispatch(committed);
    }
    // 2. The auto-label.
    applyAutoLabel(id, store);
    // Nothing to write when every unsaved field already holds what is stored
    // (an undo and its redo, a title typed and set back): settle, no write.
    if (holdsStoredValues(recordOf(store, id))) {
      const record = recordOf(store, id);
      if (record) store.dispatch(markNoteSaved({ id, savedSnapshot: dirtyValues(record) }));
      return { value: entry.value, version: record?.version ?? null, savedAt: null };
    }
    // 3. The write, compare-and-swapped on the version the edit started from.
    let action = await writeOnce(id, store);
    if (refusedByVersion(action)) {
      const stored = storedBody(recordOf(store, id));
      const mine = entry.value;
      const collides = stored !== undefined && mine !== undefined && stored.value !== entry.base && stored.value !== mine;
      if (collides) throw new WorkingCopySaveConflict({ theirs: stored.value, version: stored.version });
      // Nothing the person typed collides (another field moved, or the stored
      // text already is theirs): their edit goes on the stored version.
      const record = recordOf(store, id);
      if (record) store.dispatch(resolveNoteStoredConflict({ id, choice: "mine", content: record.content ?? "" }));
      action = await writeOnce(id, store);
      if (refusedByVersion(action)) {
        const again = storedBody(recordOf(store, id));
        throw new WorkingCopySaveConflict({ theirs: again?.value, version: again?.version ?? null });
      }
    }
    if (writeNoteRecord.rejected.match(action)) throw writeError(action);
    const saved = recordOf(store, id);
    return { value: entry.value, version: saved?.version ?? null, savedAt: Date.now() };
  },
  source: (id, store) => storedBody(recordOf(store, id)),
  onDirtyChanged: (id, dirty, store) => {
    if (!dirty) editedBy.delete(id);
    else if (!editedBy.has(id)) editedBy.set(id, actorOf(store));
    // A copy with no text (only other fields touched) leaves the body alone.
    if (noteWorkingCopy.entry(id)?.value === undefined) return;
    store.dispatch(dirty ? noteContentEditPending({ id }) : noteContentEditSettled({ id }));
  },
  conflictChosen: (id, choice, chosen, conflict, store) => {
    const content = chosen.value ?? conflict.theirs ?? recordOf(store, id)?.content ?? "";
    store.dispatch(resolveNoteStoredConflict({ id, choice, content }));
  },
  discarded: (id, after, store) => {
    store.dispatch(discardNoteUnsavedEdits({ id, content: after.value ?? recordOf(store, id)?.content ?? "" }));
  },
  onConflict: (id, conflict) => announceWorkingCopyConflict(noteWorkingCopy, id, "Note", conflict),
  onConflictResolved: (id) => dismissWorkingCopyConflict(noteWorkingCopy, id),
});

/** A view holds this note's working copy. Returns the release (the last one saves). */
export function holdNoteWorkingCopy(noteId: string, store: WorkingCopyStoreLike): () => void {
  return noteWorkingCopy.attach(noteId, store);
}

/**
 * The note record has unsaved fields (a rename, a folder move, an agent's
 * write, undo): save them through the one door. `now` saves at once (Save);
 * otherwise an open editor's debounce carries it. Resolves when it has run.
 */
export function requestNoteSave(
  noteId: string,
  store: WorkingCopyStoreLike,
  options?: { now?: boolean; value?: string },
): Promise<void> {
  return noteWorkingCopy.request(noteId, store, options);
}

export function getNoteLiveContent(noteId: string): string | undefined {
  return noteWorkingCopy.entry(noteId)?.value;
}
