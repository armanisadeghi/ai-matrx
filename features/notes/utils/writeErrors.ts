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
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { NOTE_SAVE_FAILURE_BLOCK_THRESHOLD } from "../redux/notes.types";
import { captureNoteDrafts } from "./notesDrafts";

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
  lastEscalationAt.delete(noteId);
}

// ── Escalation: a streak of failures is a DEFECT, not a notification ────────
//
// A toast is dismissible, deduped and easy to ignore — on 2026-08-08 fourteen
// hours of failing autosaves were ignorable exactly that way (D132). Once the
// streak reaches NOTE_SAVE_FAILURE_BLOCK_THRESHOLD the editor raises a
// blocking banner (see NoteSaveFailureBanner); this function is the other
// half of the loud recovery: it snapshots the buffer to a local draft (the
// only remaining copy of that text) and screams into the Error Inspector.

const lastEscalationAt = new Map<string, number>();
/** Re-scream at most this often while a streak continues. */
const ESCALATION_DEDUPE_MS = 60_000;

export function reportNoteSaveFailure(input: {
  noteId: string;
  failureCount: number;
  message: string;
  label?: string | null;
}): void {
  if (input.failureCount < NOTE_SAVE_FAILURE_BLOCK_THRESHOLD) return;

  const now = Date.now();
  const first = !lastEscalationAt.has(input.noteId);
  if (!first && now - (lastEscalationAt.get(input.noteId) ?? 0) < ESCALATION_DEDUPE_MS) {
    return;
  }
  lastEscalationAt.set(input.noteId, now);

  // The buffer is now the only copy — persist it before anything else.
  captureNoteDrafts("note-save-failures");

  console.error(
    `[Notes] ${input.failureCount} consecutive save failures on note ${input.noteId}.`,
    "The editor buffer is the only copy of this work; a local draft was",
    "snapshotted and the editor is showing a blocking banner.",
    input.message,
  );

  captureError({
    source: "unsaved-work",
    operation: "update",
    schema: "workbench",
    relation: "notes",
    message: `Note save failed ${input.failureCount}× in a row — user work is unsaved`,
    details: input.message,
    hint: "The editor raised its blocking save-failure banner and snapshotted the buffer to a local draft. Find why the write path is failing (RLS deny, identity drift, network).",
    userMessage: input.message,
    callSite: `note:${input.noteId}${input.label ? ` (${input.label})` : ""}`,
  });
}
