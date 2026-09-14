// features/notes/utils/saveVerification.ts
//
// THE RULE: never tell the user their note has a conflict without checking the
// ACTUAL server data first.
//
// A note UPDATE is a compare-and-swap on the integer `version`. 0 rows back
// has always been read as "someone else wrote this row" — but `version` moves
// on EVERY update of the row (the desktop sync stamping `file_path`, an ingest
// job writing metadata, a folder move), not only on the fields the editor
// edits. A CAS miss on a row whose EDITED fields still equal the base the edit
// was made against is bookkeeping, not a conflict, and surfacing it as one is
// the recurring false "another device is overwriting your note" report on
// /notes (root-caused 2026-09-13: matrx-local wrote `file_path` 0.9s after a
// web-created note's INSERT; the browser never adopted version 2).
//
// A conflict means the OTHER side changed something you are editing.

import type { Note } from "../types";
import type { NoteUndoableField } from "../redux/notes.types";

/**
 * The fields a user edits through the notes editor and its actions — the ONLY
 * fields whose server-side change is a conflict with a local edit. Everything
 * else on the row (`metadata`, `position`, `file_path`, `last_device_id`,
 * `sync_version`, `content_hash`, actor stamps) is system bookkeeping that may
 * move the version without touching what the user is working on.
 */
export const NOTE_EDITED_FIELDS = [
  "content",
  "label",
  "folder_id",
  "folder_name",
  "tags",
  "visibility",
] as const satisfies readonly NoteUndoableField[];

export type NoteEditedField = (typeof NOTE_EDITED_FIELDS)[number];

/** The slice of a note row a phantom-conflict check compares. */
export type NoteEditBase = Pick<Note, NoteEditedField>;

function normalizeEdited(value: unknown): string {
  // `tags` is an array; JSON is the stable comparison. `null` and `undefined`
  // are the same absence on the wire.
  return JSON.stringify(value ?? null);
}

/**
 * True when every user-edited field of `serverRow` equals `base` — i.e. the
 * server holds exactly the base this client's edit was made against, and any
 * version difference between them came from a column nobody is editing.
 */
export function noteEditedFieldsEqual(
  serverRow: Partial<NoteEditBase>,
  base: NoteEditBase,
): boolean {
  for (const field of NOTE_EDITED_FIELDS) {
    if (normalizeEdited(serverRow[field]) !== normalizeEdited(base[field])) return false;
  }
  return true;
}

/** Project the edit base out of a full row (drops the bookkeeping columns). */
export function noteEditBaseOf(note: NoteEditBase): NoteEditBase {
  return {
    content: note.content,
    label: note.label,
    folder_id: note.folder_id,
    folder_name: note.folder_name,
    tags: note.tags === null ? null : [...note.tags],
    visibility: note.visibility,
  };
}

/**
 * True when the live server row already holds exactly the values this write
 * attempted — meaning the write is effectively done and only the cached
 * timestamp was stale.
 *
 * Deliberately conservative: only `content` and `label` are probed, so a write
 * carrying any other field returns false and stays on the conflict path rather
 * than clearing a dirty field we cannot prove was persisted.
 */
export function serverMatchesAttempt(
  serverRow: { content?: string | null; label?: string | null },
  attempted: Partial<Record<NoteUndoableField, Note[NoteUndoableField]>>,
): boolean {
  const attemptedFields = Object.keys(attempted) as NoteUndoableField[];
  if (attemptedFields.length === 0) return false;
  for (const field of attemptedFields) {
    if (field !== "content" && field !== "label") return false;
    if (serverRow[field] !== attempted[field]) return false;
  }
  return true;
}
