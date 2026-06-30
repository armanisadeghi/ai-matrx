// features/notes/hooks/useActiveNote.ts
"use client";

import { useCallback, useEffect, useState } from 'react';
import { createNote } from '../service/notesService';
import { findEmptyNewNote } from '../utils/noteUtils';
import type { Note } from '../types';

interface UseActiveNoteOptions {
    notes: Note[];
    onNoteCreated?: (note: Note) => void;
}

/**
 * Hook to manage the active note (always ensures there's an active note)
 */
export function useActiveNote({ notes, onNoteCreated }: UseActiveNoteOptions) {
    const [activeNote, setActiveNote] = useState<Note | null>(null);
    const [isCreatingDefault, setIsCreatingDefault] = useState(false);

    /**
     * Ensure we always have an active note
     */
    const ensureActiveNote = useCallback(async () => {
        // If we already have an active note, do nothing
        if (activeNote) {
            return;
        }

        // If there are notes, prefer an empty "New Note" if exists, otherwise most recent
        if (notes.length > 0) {
            const emptyNewNote = findEmptyNewNote(notes);
            if (emptyNewNote) {
                setActiveNote(emptyNewNote);
                return;
            }
            
            const mostRecent = [...notes].sort((a, b) =>
                new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
            )[0];
            setActiveNote(mostRecent);
            return;
        }

        // No notes exist, create a default one
        if (!isCreatingDefault) {
            try {
                setIsCreatingDefault(true);
                        const newNote = await createNote({
                            label: 'New Note',
                            content: '',
                            folder_name: 'Draft',
                });
                setActiveNote(newNote);
                onNoteCreated?.(newNote);
            } catch (error) {
                console.error('Error creating default note:', error);
            } finally {
                setIsCreatingDefault(false);
            }
        }
    }, [activeNote, notes, isCreatingDefault, onNoteCreated]);

    useEffect(() => {
        ensureActiveNote();
    }, [ensureActiveNote]);

    /**
     * Update the active note locally (for optimistic updates)
     */
    const updateActiveNoteLocally = useCallback((updates: Partial<Note>) => {
        setActiveNote(prev => prev ? { ...prev, ...updates } : null);
    }, []);

    return {
        activeNote,
        setActiveNote,
        updateActiveNoteLocally,
        isCreatingDefault,
    };
}

