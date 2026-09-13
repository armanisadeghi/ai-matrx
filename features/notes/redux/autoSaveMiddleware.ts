// features/notes/redux/autoSaveMiddleware.ts
// Watches for note content/label changes and auto-saves after a debounce.
// Debounce is adaptive: smaller content = faster save, larger = slower.
// For auto-generated notes, materializes them (first DB insert) on first edit.

import type { Middleware } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { NotesSliceState, NoteUndoableField } from "./notes.types";
import type { UserAuthState } from "@/lib/redux/slices/userAuthSlice";

// Minimal local state type — avoids importing RootState from store.ts (which
// imports this middleware), breaking the type-level circular dependency.
type StateWithNotes = { notes: NotesSliceState; userAuth: UserAuthState };
import {
  updateNoteLabel,
} from "./slice";
import { getAutoSaveDelay } from "./notes.types";
import type { NoteRecord } from "./notes.types";
import { generateLabelFromContent } from "../hooks/useAutoLabel";
import { isNoteLabelEditing } from "../utils/labelEditing";
import { saveNote } from "./thunks";

// Timer map — one debounce timer per note
// Timers are scoped to this middleware instance. A second configured store
// must never cancel or inherit another store's pending note save.

/**
 * Resolve an optional materialized folder for a first-save note.
 * A folder name can legitimately exist only on the note: default folders and
 * older rows are materialized lazily, so zero rows is not an error.
 */
/**
 * Auto-save middleware.
 * Listens for updateNoteContent and updateNoteLabel actions.
 * Schedules a debounced save to Supabase.
 * For auto-generated notes, performs INSERT instead of UPDATE on first save.
 *
 * Concurrency: UPDATE is gated by the persisted revision so a concurrent
 * collaborator write yields a conflict without a TOCTOU window.
 * Mid-save keystrokes: `markNoteSaved` receives a savedSnapshot and only
 * clears dirty fields that still match what was written.
 */
export const autoSaveMiddleware: Middleware<{}, RootState, AppDispatch> =
  (storeApi) => {
    const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
    return (next) => (action) => {
    const result = next(action);

    // Content/label edits + internal follow-up after a mid-save dirty remain.
    const actionType = (action as { type?: string }).type;
    if (
      actionType !== "notes/updateNoteContent" &&
      actionType !== "notes/updateNoteLabel" &&
      actionType !== "notes/updateNoteFolder" &&
      actionType !== "notes/updateNoteTags" &&
      actionType !== "notes/setNoteField" &&
      actionType !== "notes/setNoteFields" &&
      actionType !== "notes/requestAutoSave"
    ) {
      return result;
    }

    // Extract noteId from action payload
    const payload = (action as { payload?: { id?: string } }).payload;
    const noteId = payload?.id;
    if (!noteId) return result;

    // Read current note from state
    const state = storeApi.getState() as StateWithNotes;
    const record = state.notes?.notes?.[noteId] as NoteRecord | undefined;
    if (!record || !record._dirty) return result;

    // Clear existing timer for this note
    const existing = saveTimers.get(noteId);
    if (existing) clearTimeout(existing);

    // Calculate debounce based on content size
    const delay = getAutoSaveDelay(record.content?.length ?? 0);
    const scheduledUserId = state.userAuth.id;

    // Schedule save
    const timer = setTimeout(async () => {
      saveTimers.delete(noteId);

      const currentState = storeApi.getState() as StateWithNotes;
      if (currentState.userAuth.id !== scheduledUserId) return;
      const currentRecord = currentState.notes?.notes?.[noteId] as
        NoteRecord | undefined;
      if (!currentRecord || !currentRecord._dirty) return;

      // ── Auto-label: generate label from content if still "New Note" ──
      // NEVER while the user is typing the title (labelEditing signal) or
      // after they typed one (label field dirty): the generated label would
      // land in Redux mid-keystroke and clobber their in-progress name —
      // the naming rule is "if the user starts naming, hold their value and
      // commit it on blur; no freaking out".
      const shouldAutoLabel =
        (!currentRecord.label ||
          currentRecord.label.trim() === "" ||
          currentRecord.label.toLowerCase() === "new note") &&
        !isNoteLabelEditing(noteId) &&
        !currentRecord._dirtyFields.has("label");

      if (
        shouldAutoLabel &&
        currentRecord.content &&
        currentRecord.content.trim().length >= 12
      ) {
        const generated = generateLabelFromContent(currentRecord.content);
        if (generated) {
          storeApi.dispatch(updateNoteLabel({ id: noteId, label: generated }));
        }
      }

      // Re-read state after potential label update
      const stateAfterLabel = storeApi.getState() as StateWithNotes;
      const recordAfterLabel = stateAfterLabel.notes?.notes?.[noteId] as
        NoteRecord | undefined;
      if (!recordAfterLabel || !recordAfterLabel._dirty) return;

      try {
        await storeApi.dispatch(saveNote(noteId)).unwrap();
      } catch {
        // `saveNote` owns durable error state and user-visible failure.
      }
    }, delay);

    saveTimers.set(noteId, timer);

    return result;
  };
  };
