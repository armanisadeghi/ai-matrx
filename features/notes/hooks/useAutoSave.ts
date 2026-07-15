// features/notes/hooks/useAutoSave.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateNote } from "../service/notesService";
import {
  noteSaveErrorMessage,
  toastNoteWriteBlocked,
} from "../utils/writeErrors";
import type { UpdateNoteInput } from "../types";

interface UseAutoSaveOptions {
  noteId: string | null;
  debounceMs?: number;
  onSaveSuccess?: () => void;
  onSaveError?: (error: Error) => void;
}

/**
 * Hook to handle auto-save with debouncing and dirty state tracking.
 *
 * Legacy path for `NoteEditor` / NotesLayout. Canonical `/notes` uses Redux
 * `autoSaveMiddleware` (atomic `updated_at` lock + mid-save dirty retention).
 * Mid-flight edits stay in `pendingUpdatesRef` and trigger a follow-up save.
 */
export function useAutoSave({
  noteId,
  debounceMs = 1000,
  onSaveSuccess,
  onSaveError,
}: UseAutoSaveOptions) {
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<UpdateNoteInput>({});
  const isSavingRef = useRef(false);
  const saveNowRef = useRef<() => Promise<void>>(async () => {});

  // Callbacks are held in refs so `saveNow` (and everything derived from it:
  // scheduleSave / updateWithAutoSave / forceSave) keeps a STABLE identity.
  // Callers pass inline arrows for onSaveSuccess/onSaveError; with them in
  // saveNow's deps, every render minted new callbacks, which re-ran the
  // consumer's note-switch effect whose CLEANUP calls forceSave() — one save
  // attempt per render, and on a failing save (RLS viewer, offline) an
  // unbounded save→error→setState→render→forceSave retry loop with a toast
  // per iteration (2026-07 /notes freeze class).
  const onSaveSuccessRef = useRef(onSaveSuccess);
  const onSaveErrorRef = useRef(onSaveError);
  useEffect(() => {
    onSaveSuccessRef.current = onSaveSuccess;
    onSaveErrorRef.current = onSaveError;
  }, [onSaveSuccess, onSaveError]);

  /**
   * Mark the note as dirty (has unsaved changes)
   */
  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  /**
   * Queue an update to be saved
   */
  const queueUpdate = useCallback(
    (updates: UpdateNoteInput) => {
      pendingUpdatesRef.current = {
        ...pendingUpdatesRef.current,
        ...updates,
      };
      markDirty();
    },
    [markDirty],
  );

  /**
   * Actually save the pending updates
   */
  const saveNow = useCallback(async () => {
    if (!noteId || Object.keys(pendingUpdatesRef.current).length === 0) {
      return;
    }

    // Don't stack concurrent saves — the next debounce will pick up any
    // changes that arrive while this one is in-flight.
    if (isSavingRef.current) return;

    const updatesSnapshot = { ...pendingUpdatesRef.current };
    // Clear pending immediately so edits that arrive during the async save
    // are queued for the next save rather than dropped.
    pendingUpdatesRef.current = {};

    try {
      isSavingRef.current = true;
      setIsSaving(true);
      await updateNote(noteId, updatesSnapshot);
      setLastSaved(new Date());
      onSaveSuccessRef.current?.();
      const hasMore = Object.keys(pendingUpdatesRef.current).length > 0;
      setIsDirty(hasMore);
      // Mid-save keystrokes: schedule a follow-up without waiting for
      // another keystroke (user may have stopped typing). Do NOT retry
      // on error — that caused infinite loops for permission failures.
      if (hasMore) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          void saveNowRef.current();
        }, debounceMs);
      }
    } catch (error) {
      // Restore pending updates so the next scheduled save retries them
      pendingUpdatesRef.current = {
        ...updatesSnapshot,
        ...pendingUpdatesRef.current,
      };
      setIsDirty(true);
      console.error("[useAutoSave] Error saving note:", error);
      // Never let a rejected write pass as silence — a viewer-level
      // sharee's RLS-filtered save would otherwise eat every keystroke.
      toastNoteWriteBlocked(
        noteId,
        noteSaveErrorMessage(error as { code?: string; message?: string }),
      );
      onSaveErrorRef.current?.(error as Error);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [noteId, debounceMs]);

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  /**
   * Schedule a save with debouncing
   */
  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveNow();
    }, debounceMs);
  }, [saveNow, debounceMs]);

  /**
   * Queue an update and schedule a debounced save
   */
  const updateWithAutoSave = useCallback(
    (updates: UpdateNoteInput) => {
      queueUpdate(updates);
      scheduleSave();
    },
    [queueUpdate, scheduleSave],
  );

  /**
   * Cancel the debounce timer and save immediately
   */
  const forceSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    saveNow();
  }, [saveNow]);

  // On noteId change (tab switch / unmount): flush any pending updates immediately
  useEffect(() => {
    return () => {
      const currentNoteId = noteId;
      const pendingUpdates = { ...pendingUpdatesRef.current };

      if (currentNoteId && Object.keys(pendingUpdates).length > 0) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        pendingUpdatesRef.current = {};
        updateNote(currentNoteId, pendingUpdates).catch((err) => {
          console.error(
            "[useAutoSave] Error saving note on unmount/switch:",
            err,
          );
          toastNoteWriteBlocked(
            currentNoteId,
            noteSaveErrorMessage(err as { code?: string; message?: string }),
          );
        });
      }
    };
  }, [noteId]);

  return {
    isDirty,
    isSaving,
    lastSaved,
    updateWithAutoSave,
    forceSave,
    markDirty,
  };
}
