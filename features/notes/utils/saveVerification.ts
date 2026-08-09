// features/notes/utils/saveVerification.ts
//
// THE RULE: never tell the user their note has a conflict without checking the
// ACTUAL server data first.
//
// A note UPDATE is gated by an optimistic lock (`WHERE updated_at = <local>`).
// 0 rows back has always been read as "someone else wrote this row" — but it
// also happens when only our CACHED `updated_at` drifted while the row itself
// already holds exactly what we were trying to write. That second case is
// bookkeeping, not a conflict, and surfacing it as one is the recurring false
// "another device is overwriting your note" report on /notes.

import type { Note } from "../types";
import type { NoteUndoableField } from "../redux/notes.types";

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
