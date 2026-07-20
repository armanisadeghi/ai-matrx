// features/notes/utils/writeErrors.ts
//
// Loud-recovery helpers for note writes rejected by RLS.
//
// Under canonical RLS a viewer-level sharee can SELECT a shared note but the
// UPDATE policy filters the row out of the write set — Postgres "succeeds"
// with 0 rows and NO error. Our save paths use `.select().single()`, so the
// zero-row write surfaces as PGRST116 ("JSON object requested … 0 rows");
// an explicit with_check violation surfaces as 42501. Both mean the same
// thing to the user: the write did NOT happen. These helpers translate that
// into an unmissable message so edits are never silently thrown away.

import { toast } from "@/lib/toast";

interface WriteErrorLike {
  code?: string | null;
  message?: string | null;
}

/** True when a write failed because RLS rejected/filtered it (not a network/data error). */
export function isPermissionWriteError(
  error: WriteErrorLike | null | undefined,
): boolean {
  return error?.code === "PGRST116" || error?.code === "42501";
}

export const NOTE_READONLY_SAVE_MESSAGE =
  "This note is read-only for you — your changes are NOT being saved. Duplicate the note to keep your work.";

export const NOTE_READONLY_DELETE_MESSAGE =
  "You don't have permission to delete this note.";

/** Friendly, actionable message for a failed note save. */
export function noteSaveErrorMessage(
  error: WriteErrorLike | null | undefined,
): string {
  if (isPermissionWriteError(error)) return NOTE_READONLY_SAVE_MESSAGE;
  return error?.message || "Saving this note failed — your latest changes are not persisted.";
}

// Autosave retries every few seconds; scream once per burst, not per retry.
const lastToastAt = new Map<string, number>();
const TOAST_DEDUPE_MS = 15_000;

/** Toast a blocked/failed note write, deduped per note. */
export function toastNoteWriteBlocked(noteId: string, message: string): void {
  const now = Date.now();
  if (now - (lastToastAt.get(noteId) ?? 0) < TOAST_DEDUPE_MS) return;
  lastToastAt.set(noteId, now);
  toast.error(message, { id: `note-write-blocked-${noteId}`, duration: 8000 });
}

/** Clear the dedupe window after a successful save so a later failure screams again. */
export function clearNoteWriteBlockedToast(noteId: string): void {
  lastToastAt.delete(noteId);
}
