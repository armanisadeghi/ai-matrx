// features/notes/redux/autoSaveMiddleware.ts
// Watches for note content/label changes and auto-saves after a debounce.
// Debounce is adaptive: smaller content = faster save, larger = slower.
// For auto-generated notes, materializes them (first DB insert) on first edit.

import type { Middleware } from "@reduxjs/toolkit";
import type { TablesUpdate } from "@/types/database.types";
import type { NotesSliceState, NoteUndoableField } from "./notes.types";
import type { UserAuthState } from "@/lib/redux/slices/userAuthSlice";
import type { Note } from "../types";

// Minimal local state type — avoids importing RootState from store.ts (which
// imports this middleware), breaking the type-level circular dependency.
type StateWithNotes = { notes: NotesSliceState; userAuth: UserAuthState };
import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import {
  markNoteSaving,
  markNoteSaved,
  markNoteSaveError,
  materializeNote,
  updateNoteLabel,
} from "./slice";
import { getAutoSaveDelay } from "./notes.types";
import type { NoteRecord } from "./notes.types";
import { generateLabelFromContent } from "../hooks/useAutoLabel";
import { isNoteLabelEditing } from "../utils/labelEditing";
import {
  noteSaveErrorMessage,
  toastNoteWriteBlocked,
  clearNoteWriteBlockedToast,
} from "../utils/writeErrors";

// Timer map — one debounce timer per note
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function snapshotDirtyFields(
  record: NoteRecord,
): Partial<Record<NoteUndoableField, Note[NoteUndoableField]>> {
  const snap: Partial<Record<NoteUndoableField, Note[NoteUndoableField]>> = {};
  for (const field of record._dirtyFields) {
    snap[field] = record[field];
  }
  return snap;
}

/**
 * Auto-save middleware.
 * Listens for updateNoteContent and updateNoteLabel actions.
 * Schedules a debounced save to Supabase.
 * For auto-generated notes, performs INSERT instead of UPDATE on first save.
 *
 * Concurrency: UPDATE is gated with `.eq("updated_at", local)` so a concurrent
 * collaborator write yields 0 rows → conflict (atomic; no TOCTOU window).
 * Mid-save keystrokes: `markNoteSaved` receives a savedSnapshot and only
 * clears dirty fields that still match what was written.
 */
export const autoSaveMiddleware: Middleware =
  (storeApi) => (next) => (action) => {
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

    // Schedule save
    const timer = setTimeout(async () => {
      saveTimers.delete(noteId);

      const currentState = storeApi.getState() as StateWithNotes;
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

      const savedSnapshot = snapshotDirtyFields(recordAfterLabel);

      storeApi.dispatch(markNoteSaving(noteId));

      try {
        if (recordAfterLabel._isAutogenerated) {
          // ── First save: INSERT (materialize) ─────────────────────
          const userId =
            recordAfterLabel.created_by || currentState.userAuth?.id;
          if (!userId) {
            storeApi.dispatch(
              markNoteSaveError({ id: noteId, error: "No user ID" }),
            );
            return;
          }

          // Resolve folder_id if not already set
          let folderId = recordAfterLabel.folder_id;
          if (!folderId && recordAfterLabel.folder_name) {
            const { data: folderData } = await supabase
              .schema("workbench")
              .from("note_folders")
              .select("id")
              .eq("created_by", userId)
              .eq("name", recordAfterLabel.folder_name)
              .is("deleted_at", null)
              .limit(1)
              .single();
            folderId = folderData?.id ?? null;
          }

          const { data, error } = await supabase
            .schema("workbench")
            .from("notes")
            .insert({
              id: noteId,
              // Canonical RLS std_insert requires created_by = auth.uid().
              created_by: userId,
              label: recordAfterLabel.label,
              content: recordAfterLabel.content,
              folder_name: recordAfterLabel.folder_name,
              folder_id: folderId,
              // folder_id may be null, so the org-inherit trigger may have no
              // parent to read — resolve the org explicitly (never a null org).
              organization_id: await ensureOrgId(
                recordAfterLabel.organization_id,
              ),
              tags: recordAfterLabel.tags,
              metadata: recordAfterLabel.metadata,
              position: recordAfterLabel.position ?? 0,
              // Persist the record's visibility (defaults to 'private' at
              // record creation) — the DB column defaults to 'internal', so
              // omitting it would silently make the note org-visible.
              visibility: recordAfterLabel.visibility,
            })
            .select("updated_at")
            .single();

          if (error) {
            console.error("[AutoSave] INSERT failed:", error.message);
            const friendly = noteSaveErrorMessage(error);
            storeApi.dispatch(
              markNoteSaveError({ id: noteId, error: friendly }),
            );
            toastNoteWriteBlocked(noteId, friendly);
            return;
          }

          clearNoteWriteBlockedToast(noteId);
          storeApi.dispatch(materializeNote(noteId));
          storeApi.dispatch(
            markNoteSaved({
              id: noteId,
              updatedAt: data?.updated_at ?? undefined,
              savedSnapshot,
            }),
          );
        } else {
          // ── Subsequent saves: UPDATE ──────────────────────────────
          const updates: Record<string, unknown> = { ...savedSnapshot };

          if (Object.keys(updates).length === 0) {
            storeApi.dispatch(markNoteSaved({ id: noteId, savedSnapshot }));
            return;
          }

          // Atomic optimistic lock: WHERE updated_at = local. The BEFORE
          // UPDATE `_touch_row` trigger only mutates NEW — the predicate
          // still matches the OLD row. 0 rows ⇒ concurrent write won.
          let query = supabase
            .schema("workbench")
            .from("notes")
            .update(updates as TablesUpdate<{ schema: "workbench" }, "notes">)
            .eq("id", noteId);

          if (recordAfterLabel.updated_at) {
            query = query.eq("updated_at", recordAfterLabel.updated_at);
          }

          const { data, error } = await query
            .select("updated_at")
            .maybeSingle();

          if (error) {
            console.error("[AutoSave] UPDATE failed:", error.message);
            const friendly = noteSaveErrorMessage(error);
            storeApi.dispatch(
              markNoteSaveError({ id: noteId, error: friendly }),
            );
            toastNoteWriteBlocked(noteId, friendly);
            return;
          }

          if (!data) {
            // 0 rows: either RLS filtered (viewer) or updated_at mismatch.
            // Distinguish by a follow-up SELECT we can still read.
            const { data: stillThere, error: probeError } = await supabase
              .schema("workbench")
              .from("notes")
              .select("updated_at")
              .eq("id", noteId)
              .maybeSingle();

            if (probeError || !stillThere) {
              const friendly = "You don't have permission to save this note.";
              storeApi.dispatch(
                markNoteSaveError({ id: noteId, error: friendly }),
              );
              toastNoteWriteBlocked(noteId, friendly);
              return;
            }

            console.warn(
              "[AutoSave] conflict — updated_at mismatch for",
              noteId,
            );
            storeApi.dispatch(
              markNoteSaveError({ id: noteId, error: "conflict" }),
            );
            return;
          }

          clearNoteWriteBlockedToast(noteId);
          storeApi.dispatch(
            markNoteSaved({
              id: noteId,
              updatedAt: data.updated_at ?? undefined,
              savedSnapshot,
            }),
          );
        }

        // Notify sidebar of label changes
        if (savedSnapshot.label !== undefined) {
          window.dispatchEvent(
            new CustomEvent("notes:labelChange", {
              detail: { noteId, label: savedSnapshot.label },
            }),
          );
        }

        // Mid-save keystrokes stay dirty — kick another debounce without
        // touching undo history (requestAutoSave is middleware-only).
        const afterSave = storeApi.getState() as StateWithNotes;
        const stillDirty = afterSave.notes?.notes?.[noteId];
        if (stillDirty?._dirty && !saveTimers.has(noteId)) {
          storeApi.dispatch({
            type: "notes/requestAutoSave",
            payload: { id: noteId },
          });
        }
      } catch (err) {
        storeApi.dispatch(
          markNoteSaveError({
            id: noteId,
            error: err instanceof Error ? err.message : "Save failed",
          }),
        );
      }
    }, delay);

    saveTimers.set(noteId, timer);

    return result;
  };
