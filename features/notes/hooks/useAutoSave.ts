// features/notes/hooks/useAutoSave.ts
"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { updateNote } from '../service/notesService';
import { noteSaveErrorMessage, toastNoteWriteBlocked } from '../utils/writeErrors';
import type { UpdateNoteInput } from '../types';

interface UseAutoSaveOptions {
    noteId: string | null;
    debounceMs?: number;
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
}

/**
 * Hook to handle auto-save with debouncing and dirty state tracking.
 *
 * Optimistic locking (WHERE updated_at = ?) has been removed because the notes
 * table has a BEFORE UPDATE trigger that auto-sets updated_at, which causes the
 * WHERE clause to always match 0 rows. Concurrent-session conflict detection is
 * handled by the Supabase Realtime subscription in NotesContext instead.
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

    /**
     * Mark the note as dirty (has unsaved changes)
     */
    const markDirty = useCallback(() => {
        setIsDirty(true);
    }, []);

    /**
     * Queue an update to be saved
     */
    const queueUpdate = useCallback((updates: UpdateNoteInput) => {
        pendingUpdatesRef.current = {
            ...pendingUpdatesRef.current,
            ...updates,
        };
        markDirty();
    }, [markDirty]);

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
            setIsDirty(false);
            setLastSaved(new Date());
            onSaveSuccess?.();
        } catch (error) {
            // Restore pending updates so the next scheduled save retries them
            pendingUpdatesRef.current = { ...updatesSnapshot, ...pendingUpdatesRef.current };
            console.error('[useAutoSave] Error saving note:', error);
            // Never let a rejected write pass as silence — a viewer-level
            // sharee's RLS-filtered save would otherwise eat every keystroke.
            toastNoteWriteBlocked(
                noteId,
                noteSaveErrorMessage(error as { code?: string; message?: string }),
            );
            onSaveError?.(error as Error);
        } finally {
            isSavingRef.current = false;
            setIsSaving(false);
        }
    }, [noteId, onSaveSuccess, onSaveError]);

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
    const updateWithAutoSave = useCallback((updates: UpdateNoteInput) => {
        queueUpdate(updates);
        scheduleSave();
    }, [queueUpdate, scheduleSave]);

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
                updateNote(currentNoteId, pendingUpdates).catch(err => {
                    console.error('[useAutoSave] Error saving note on unmount/switch:', err);
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
