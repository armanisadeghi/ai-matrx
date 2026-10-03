/**
 * features/notes/redux/noteRecordWrite.ts — THE DATABASE WRITE of a note record.
 *
 * Its dirty fields, compare-and-swapped on its version, one serialized write
 * turn per store and note. Called ONLY by the note's working-copy save
 * (`../utils/noteLiveContent.ts`), which owns retry, offline, the hold until
 * saved and the conflict choice. Everything else saves a note through
 * `saveNote` (`./thunks.ts`), which goes through that door.
 *
 * Kept apart from `thunks.ts` so the working copy can call it without an
 * import cycle (thunks → noteLiveContent → the write).
 */

import { createAsyncThunk, unwrapResult, type ThunkAction, type ThunkDispatch, type UnknownAction } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { SessionUnavailableError } from "@/lib/supabase/authRetry";
import type { RootState } from "@/lib/redux/store";
import { materializeNote as materializePersistedNote, persistNoteUpdate } from "../service/notesService";
import {
  NoteContextPartialSaveError,
  NoteUpdateConflictError,
  type NoteSaveReceipt,
} from "../service/noteSaveErrors";
import { toastNoteWriteBlocked, clearNoteWriteBlockedToast, reportNoteSaveFailure } from "../utils/writeErrors";
import { noteEditBaseFromRecord } from "../utils/saveVerification";
import type { Note, UpdateNoteInput } from "../types";
import type { NoteRecord, NoteUndoableField } from "./notes.types";
import {
  upsertNoteFromServer,
  recordNoteWriteAttempt,
  markNoteSaving,
  markNoteSaved,
  markNoteSaveError,
  recordNoteStoredRow,
  clearSavingNoteId,
  materializeNote,
} from "./slice";

export function getUserId(getState: () => unknown): string {
  const state = getState() as RootState;
  const userId = state.userAuth.id;
  if (!userId) throw new SessionUnavailableError();
  return userId;
}

export async function assertCurrentNotesUser(expectedUserId: string): Promise<void> {
  // The signed-in identity is the access token's VERIFIED claims — not
  // `getSession().user`, which is whatever the cookie deserialized to, and not
  // `auth.getUser()`, which is an auth-server round trip on every save.
  const { data, error } = await getClaimsUser(supabase);
  if (error || data.user?.id !== expectedUserId) {
    throw new SessionUnavailableError();
  }
}


export function dispatchNoteEvent(name: string, detail?: unknown): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}


// ---------------------------------------------------------------------------
// The write
// ---------------------------------------------------------------------------

/**
 * Save dirty fields with atomic concurrency check.
 * - Reads note from state, checks _dirty and _dirtyFields
 * - Delegates revision CAS and association settlement to the Notes service
 * - markNoteSaved gets a savedSnapshot so mid-save keystrokes stay dirty
 * - Label change: dispatch custom event "notes:labelChange"
 */
/**
 * Record the failure, toast once per burst, and — once the streak reaches
 * NOTE_SAVE_FAILURE_BLOCK_THRESHOLD — snapshot the buffer to a local draft and
 * scream. The blocking banner reads the streak from Redux.
 */
function failNoteSave(
  dispatch: (action: ReturnType<typeof markNoteSaveError>) => unknown,
  getState: () => unknown,
  noteId: string,
  message: string,
): void {
  dispatch(markNoteSaveError({ id: noteId, error: message }));
  toastNoteWriteBlocked(noteId, message);
  const record = (getState() as RootState).notes?.notes?.[noteId];
  reportNoteSaveFailure({
    noteId,
    failureCount: record?._consecutiveSaveFailures ?? 1,
    message,
    label: record?.label ?? null,
  });
}

function hasDirtyPhysicalField(record: NoteRecord): boolean {
  return Array.from(record._dirtyFields).some(
    (field) => field !== "project_id" && field !== "task_id",
  );
}

function receiptBaseSettlement(
  getState: () => unknown,
  noteId: string,
  receipt: { databaseWrite: "saved" | "unchanged"; note: Pick<Note, "updated_at" | "version"> },
): Pick<Note, "updated_at" | "version"> {
  if (receipt.databaseWrite === "saved") {
    return receipt.note;
  }
  const currentRecord = (getState() as RootState).notes.notes[noteId] as NoteRecord | undefined;
  // A context-only write does not create a new physical revision. If the user
  // typed a physical field while its edges were settling, retain the base that
  // edit was built on rather than adopting the service's earlier readback.
  return currentRecord && (hasDirtyPhysicalField(currentRecord) || currentRecord.version > receipt.note.version)
    ? { updated_at: currentRecord.updated_at, version: currentRecord.version }
    : receipt.note;
}

const saveNotePayload = createAsyncThunk<NoteSaveReceipt | undefined, { noteId: string; expectedQueueUserId: string; operationId: string }>(
  "notes/saveNote",
  async ({ noteId, expectedQueueUserId, operationId }, { dispatch, getState }) => {
    const attempt = saveQueues.get(getState)?.get(noteId)?.attempt;
    if (!attempt || attempt.operationId !== operationId) throw new Error("The Notes save attempt is no longer registered.");
    const record = attempt.record;
    const expectedUserId = getUserId(getState);
    const expectedOrganizationId = record?.organization_id;
    if (expectedUserId !== expectedQueueUserId) throw new SessionUnavailableError();
    await assertCurrentNotesUser(expectedQueueUserId);
    if (getUserId(getState) !== expectedQueueUserId) throw new SessionUnavailableError();

    if (!record || !record._dirty || record._dirtyFields.size === 0) {
      return;
    }

    if (record._isAutogenerated) {
      const expectedUserId = getUserId(getState);
      const savedSnapshot: Partial<Record<NoteUndoableField, Note[NoteUndoableField]>> = {};
      for (const field of record._dirtyFields) savedSnapshot[field] = record[field];
      dispatch(recordNoteWriteAttempt({ id: noteId, values: savedSnapshot }));
      dispatch(markNoteSaving(noteId));
      try {
        const note = await materializePersistedNote(record);
        await assertCurrentNotesUser(expectedUserId);
        if (getUserId(getState) !== expectedUserId) throw new SessionUnavailableError();
        dispatch(materializeNote(noteId));
        dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
        dispatch(markNoteSaved({
          id: noteId,
          updatedAt: note.updated_at ?? undefined,
          version: note.version,
          savedSnapshot,
          // The INSERT's row IS this record's first edit base. Without it a
          // web-created note had no base at all, and the desktop sync's
          // file_path stamp 0.9s later was a conflict again (adversarial
          // review, 2026-09-13).
          acknowledgedPhysicalSnapshot: note,
        }));
      } catch (error) {
        if (error instanceof SessionUnavailableError) throw error;
        const friendly = error instanceof Error ? error.message : "Could not save this new note.";
        failNoteSave(dispatch, getState, noteId, friendly);
        throw error;
      } finally {
        // An acknowledgement can arrive after auth changed. Never use receipt
        // settlement to clear that state: only clear this payload's busy flag.
        dispatch(clearSavingNoteId(noteId));
      }
      return;
    }

    // Build update object from only dirty fields (snapshot for mid-save safety)
    const updates: UpdateNoteInput = {};
    let projectId: string | null | undefined;
    let taskId: string | null | undefined;
    const savedSnapshot: Partial<
      Record<NoteUndoableField, Note[NoteUndoableField]>
    > = {};
    const dirtyFields = Array.from(record._dirtyFields);
    const hasPairedFolderId = dirtyFields.includes("folder_id");
    const hasLabelChange = dirtyFields.includes("label");

    for (const field of dirtyFields) {
      if (field === "project_id") {
        projectId = record.project_id;
      } else if (field === "task_id") {
        taskId = record.task_id;
      } else if (field === "content") {
        updates.content = record.content;
      } else if (field === "label") {
        updates.label = record.label;
      } else if (field === "folder_id") {
        updates.folder_id = record.folder_id;
      } else if (field === "tags") {
        updates.tags = record.tags;
      } else if (field === "shown_to") {
        updates.shown_to = record.shown_to;
      } else if (field === "published_to_web") {
        updates.published_to_web = record.published_to_web;
      } else if (field === "folder_name") {
        if (hasPairedFolderId) {
          // folder_name is display projection. The admitted folder ID is the
          // only persisted move input, but both local dirty values settle.
        } else {
          const error = new Error("A persisted note can only move through an admitted folder ID and cannot change organization.");
          failNoteSave(dispatch, getState, noteId, error.message);
          throw error;
        }
      } else if (field === "organization_id") {
        const error = new Error("A persisted note can only move through an admitted folder ID and cannot change organization.");
        failNoteSave(dispatch, getState, noteId, error.message);
        throw error;
      }
      savedSnapshot[field] = record[field];
    }

    // Proceed with save. Record what we are about to send BEFORE sending it —
    // the realtime echo of this write can arrive before the REST response does,
    // and the conflict check must be able to recognize our own values.
    dispatch(recordNoteWriteAttempt({ id: noteId, values: savedSnapshot }));
    dispatch(markNoteSaving(noteId));

    let acknowledgedReceipt: NoteSaveReceipt | undefined;
    try {
      const receipt = await persistNoteUpdate(noteId, {
        ...updates,
        ...(projectId === undefined ? {} : { project_id: projectId }),
        ...(taskId === undefined ? {} : { task_id: taskId }),
      }, {
        expectedVersion: record.version,
        expectedOrganizationId: record.organization_id,
        // The ACKNOWLEDGED context links (never the dirty record: those are the
        // values this save is attempting, and the receipt uses the prior ones
        // to report a failed context field honestly). With the organization
        // above, the service skips its pre-write row read and association
        // read. A record with no acknowledged snapshot lets the service read.
        ...(record._acknowledgedPhysicalSnapshot
          ? {
              priorContextLinks: {
                project_id: record._acknowledgedPhysicalSnapshot.project_id ?? null,
                task_id: record._acknowledgedPhysicalSnapshot.task_id ?? null,
              },
            }
          : {}),
        // The edit base: a CAS miss on a row whose edited fields still equal
        // it is a phantom (the version moved for a column nobody edits) and
        // is retried inside the service, never shown as a conflict.
        acknowledgedBase: noteEditBaseFromRecord(record),
      });
      if (receipt.failedFields.length > 0) throw new NoteContextPartialSaveError(receipt);
      await assertCurrentNotesUser(expectedUserId);
      if (getUserId(getState) !== expectedUserId) throw new SessionUnavailableError();
      if (receipt.postSaveRecoveryError) {
        console.error("Saved note context links need a cache recovery", receipt.postSaveRecoveryError);
      }

      clearNoteWriteBlockedToast(noteId);
      const settledBase = receiptBaseSettlement(getState, noteId, receipt);
      const currentRecord = (getState() as RootState).notes.notes[noteId] as NoteRecord | undefined;
      const acknowledgedValues = receipt.databaseWrite === "saved" && currentRecord?.folder_id === savedSnapshot.folder_id && currentRecord?.folder_name === savedSnapshot.folder_name
        ? { ...(savedSnapshot.folder_id !== undefined && savedSnapshot.folder_name !== undefined ? { folder_name: receipt.note.folder_name } : {}) }
        : {};
      dispatch(
        markNoteSaved({
          id: noteId,
          updatedAt: settledBase.updated_at ?? undefined,
          version: settledBase.version,
          savedSnapshot,
          acknowledgedValues,
          acknowledgedPhysicalSnapshot: receipt.note,
        }),
      );
      acknowledgedReceipt = receipt;
    } catch (error) {
      if (error instanceof NoteContextPartialSaveError) {
        await assertCurrentNotesUser(expectedUserId);
        if (getUserId(getState) !== expectedUserId) throw new SessionUnavailableError();
        const acknowledgedSnapshot = { ...savedSnapshot };
        for (const field of error.failedFields) {
          delete acknowledgedSnapshot[field];
        }
        const settledBase = receiptBaseSettlement(getState, noteId, error.receipt);
        const currentRecord = (getState() as RootState).notes.notes[noteId] as NoteRecord | undefined;
        const acknowledgedValues = error.databaseWrite === "saved" && currentRecord?.folder_id === acknowledgedSnapshot.folder_id && currentRecord?.folder_name === acknowledgedSnapshot.folder_name
          ? { ...(acknowledgedSnapshot.folder_id !== undefined && acknowledgedSnapshot.folder_name !== undefined ? { folder_name: error.actualStoredNote.folder_name } : {}) }
          : {};
        dispatch(markNoteSaved({
          id: noteId,
          updatedAt: settledBase.updated_at ?? undefined,
          version: settledBase.version,
          savedSnapshot: acknowledgedSnapshot,
          acknowledgedValues,
          acknowledgedPhysicalSnapshot: error.receipt.note,
        }));
        if (error.receipt.postSaveRecoveryError) {
          console.error("Partial note context save needs a cache recovery", error.receipt.postSaveRecoveryError);
        }
      }
      if (error instanceof NoteUpdateConflictError) {
        // The service's CAS error carries the stored row. It becomes the
        // record's remote observation; the note's working copy turns it into
        // its conflict (lib/working-copy) — no second read, nothing written.
        await assertCurrentNotesUser(expectedQueueUserId);
        if (!expectedOrganizationId || getUserId(getState) !== expectedQueueUserId) throw new SessionUnavailableError();
        dispatch(recordNoteStoredRow({
          id: noteId,
          row: { ...error.actualStoredNote, project_id: record.project_id, task_id: record.task_id },
        }));
        throw error;
      }
      if (error instanceof SessionUnavailableError) throw error;
      const friendly =
        error instanceof Error ? error.message : "Could not save note context.";
      failNoteSave(dispatch, getState, noteId, friendly);
      throw error;
    } finally {
      // This is deliberately independent of receipt/error settlement. An auth
      // boundary can throw while handling a partial receipt, and stale receipt
      // data must never be used merely to release the local save indicator.
      dispatch(clearSavingNoteId(noteId));
    }

    // Dispatch label change event if label was dirty
    if (hasLabelChange) {
      dispatchNoteEvent("notes:labelChange", {
        noteId,
        label: savedSnapshot.label,
      });
    }
    return acknowledgedReceipt;
  },
);

export type SaveResultAction = Awaited<ReturnType<ReturnType<typeof saveNotePayload>>>;
type QueuedSaveResult = Promise<SaveResultAction> & { unwrap: () => Promise<void> };

export type QueuedSaveThunk = ThunkAction<QueuedSaveResult, unknown, unknown, UnknownAction>;

interface SaveAttempt {
  operationId: string;
  record: NoteRecord | undefined;
}
interface SaveQueueEntry {
  result: QueuedSaveResult;
  resolve: (action: SaveResultAction) => void;
  expectedUserId: string;
  attempt?: SaveAttempt;
}
const saveQueues = new WeakMap<() => unknown, Map<string, SaveQueueEntry>>();

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasQueuedDirtyNote(getState: () => unknown, noteId: string): boolean {
  const state = getState();
  if (!isUnknownRecord(state) || !("notes" in state)) return false;
  const notesState = state.notes;
  if (!isUnknownRecord(notesState) || !("notes" in notesState)) return false;
  const records = notesState.notes;
  if (!isUnknownRecord(records) || !(noteId in records)) return false;
  const record = records[noteId];
  if (!isUnknownRecord(record) || record._dirty !== true) return false;
  const dirtyFields = record._dirtyFields;
  return dirtyFields instanceof Set && dirtyFields.size > 0;
}

function createQueuedSaveResult(): SaveQueueEntry {
  let resolver: ((action: SaveResultAction) => void) | undefined;
  const promise = new Promise<SaveResultAction>((resolve) => {
    resolver = resolve;
  });
  if (!resolver) throw new Error("Could not initialize the Notes save queue.");
  return {
    result: Object.assign(promise, {
      unwrap: () => promise.then(unwrapResult).then(() => undefined),
    }),
    resolve: resolver,
    expectedUserId: "",
  };
}

/**
 * One serialized write turn per actual Redux store and note. The queue entry
 * exists before the inner RTK thunk emits `pending`, so synchronous
 * subscribers cannot issue a second CAS against the same revision.
 */
function beginSaveQueue(
  noteId: string, dispatch: ThunkDispatch<unknown, unknown, UnknownAction>, getState: () => unknown,
): QueuedSaveResult {
  let queue = saveQueues.get(getState);
  if (!queue) { queue = new Map(); saveQueues.set(getState, queue); }
  const existing = queue.get(noteId);
  if (existing) return existing.result;
  const entry = createQueuedSaveResult();
  entry.expectedUserId = getUserId(getState);
  queue.set(noteId, entry);
  void (async () => {
    let finalAction: SaveResultAction | undefined;
    try {
      do {
        // Capture synchronously before RTK emits pending and any subscriber
        // can re-enter. The record is the store's immutable value at this
        // moment; later reducers produce new objects and never change it.
        const current = (getState() as RootState).notes.notes[noteId] as NoteRecord | undefined;
        entry.attempt = { operationId: crypto.randomUUID(), record: current };
        finalAction = await dispatch(saveNotePayload({ noteId, expectedQueueUserId: entry.expectedUserId, operationId: entry.attempt.operationId }));
        if (saveNotePayload.rejected.match(finalAction)) break;
      } while (hasQueuedDirtyNote(getState, noteId));
    } catch (error) {
      const rejection = saveNotePayload.rejected(error instanceof Error ? error : new Error("Notes save queue failed."), "notes-save-queue", { noteId, expectedQueueUserId: entry.expectedUserId, operationId: entry.attempt?.operationId ?? "uncaptured" });
      finalAction = rejection;
      try { dispatch(rejection); } catch { /* The deferred result retains the rejection. */ }
    } finally {
      queue.delete(noteId);
      if (queue.size === 0) saveQueues.delete(getState);
      if (finalAction) entry.resolve(finalAction);
    }
  })();
  return entry.result;
}

/**
 * THE DATABASE WRITE of a note record — its dirty fields, compare-and-swapped
 * on its version. Called ONLY by the note's working-copy save
 * (`utils/noteLiveContent.ts`), which owns retry, offline, the hold until
 * saved and the conflict. Everything else saves through `saveNote`.
 */
export const writeNoteRecord = Object.assign(
  (noteId: string): QueuedSaveThunk => (dispatch, getState) => beginSaveQueue(noteId, dispatch, getState),
  { fulfilled: saveNotePayload.fulfilled, rejected: saveNotePayload.rejected },
);

