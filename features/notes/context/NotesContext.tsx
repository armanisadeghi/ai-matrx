"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import {
  fetchNotes,
  createNote as createNoteService,
  updateNote as updateNoteService,
  deleteNote as deleteNoteService,
  copyNote as copyNoteService,
} from "../service/notesService";
import { findEmptyNewNote, generateUniqueLabel } from "../utils/noteUtils";
import type { Note, CreateNoteInput, UpdateNoteInput } from "../types";
import { supabase } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";

interface NotesContextType {
  notes: Note[];
  isLoading: boolean;
  error: Error | null;
  activeNote: Note | null;
  setActiveNote: (note: Note | null) => void;
  /** Report whether the active note has unsaved local edits. Prevents refreshNotes from overwriting user input. */
  setActiveNoteDirty: (dirty: boolean) => void;
  createNote: (input: CreateNoteInput) => Promise<Note>;
  updateNote: (id: string, updates: UpdateNoteInput) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;
  copyNote: (id: string) => Promise<Note>;
  refreshNotes: () => Promise<void>;
  findOrCreateEmptyNote: (folderName?: string) => Promise<Note>;
  // Tab management
  openTabs: string[];
  openNoteInTab: (noteId: string) => void;
  closeTab: (noteId: string) => void;
  closeAllTabs: () => void;
  reorderTabs: (newOrder: string[]) => void;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { id: userId } = useAppSelector(selectUser);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const isRefreshing = useRef(false);
  const isInitialized = useRef(false); // Track if initial fetch completed
  const initializationPromise = useRef<Promise<void> | null>(null); // For race condition prevention
  const notesRef = useRef<Note[]>([]); // Add ref for notes to avoid callback dependencies
  const activeNoteRef = useRef<Note | null>(null);
  // Track saves in-flight to avoid spurious realtime conflict warnings
  const savingNoteIdsRef = useRef<Set<string>>(new Set());
  // Track notes with stale-data warnings already shown (to avoid spamming)
  const shownConflictToastsRef = useRef<Set<string>>(new Set());

  // Keep refs in sync with state
  useEffect(() => {
    notesRef.current = notes;
    activeNoteRef.current = activeNote;
  }, [notes, activeNote]);

  // Track whether the active note has unsaved local edits (set by NoteEditor/MobileNoteEditor)
  const activeNoteIsDirtyRef = useRef(false);

  // Called by editors to tell the context whether there are unsaved local changes
  const setActiveNoteDirty = useCallback((dirty: boolean) => {
    activeNoteIsDirtyRef.current = dirty;
  }, []);

  // Fetch notes from database with race condition prevention
  const refreshNotes = useCallback(async () => {
    // If already refreshing, wait for that to complete
    if (isRefreshing.current && initializationPromise.current) {
      console.log("Waiting for existing refresh to complete...");
      await initializationPromise.current;
      return;
    }

    if (isRefreshing.current) return;

    isRefreshing.current = true;
    setIsLoading(true);
    setError(null);

    // Create a promise for this initialization
    const currentInit = (async () => {
      try {
        const fetchedNotes = await fetchNotes();
        setNotes(fetchedNotes);

        // Mark as initialized
        isInitialized.current = true;

        // Update active note if it exists in the new data (use ref to avoid dependency)
        const currentActive = activeNoteRef.current;
        if (currentActive) {
          const updatedActiveNote = fetchedNotes.find(
            (n) => n.id === currentActive.id,
          );
          if (updatedActiveNote) {
            // CRITICAL: Never overwrite activeNote if the user has unsaved local edits.
            // Only update metadata fields that can't be edited in the editor (e.g. updated_at
            // from the server). Content/label/folder/tags are owned by the editor until saved.
            if (!activeNoteIsDirtyRef.current) {
              setActiveNote(updatedActiveNote);
            }
            // Ensure active note is in tabs
            setOpenTabs((prev) => {
              if (!prev.includes(updatedActiveNote.id)) {
                return [...prev, updatedActiveNote.id];
              }
              return prev;
            });
          } else {
            // Active note was deleted, select another or null
            const nextNote = fetchedNotes.length > 0 ? fetchedNotes[0] : null;
            setActiveNote(nextNote);
            if (nextNote) {
              setOpenTabs((prev) => {
                if (!prev.includes(nextNote.id)) {
                  return [...prev, nextNote.id];
                }
                return prev;
              });
            }
          }
        } else if (fetchedNotes.length > 0) {
          // No active note but we have notes, select the first one and open in tab
          const firstNote = fetchedNotes[0];
          setActiveNote(firstNote);
          setOpenTabs((prev) => {
            if (!prev.includes(firstNote.id)) {
              return [firstNote.id];
            }
            return prev;
          });
        }
      } catch (err) {
        setError(err as Error);
        console.error("Failed to fetch notes:", err);
      } finally {
        setIsLoading(false);
        isRefreshing.current = false;
        initializationPromise.current = null;
      }
    })();

    initializationPromise.current = currentInit;
    await currentInit;
  }, []); // No dependencies - stable function

  // Helper to ensure notes are loaded before operations
  const ensureNotesLoaded = useCallback(async () => {
    if (isInitialized.current) return;

    // If initialization is in progress, wait for it
    if (initializationPromise.current) {
      console.log("Waiting for notes initialization...");
      await initializationPromise.current;
    } else {
      // Start initialization if not started
      await refreshNotes();
    }
  }, [refreshNotes]);

  // Initial load
  useEffect(() => {
    refreshNotes();
  }, []);

  // Real-time subscription to prevent data loss from concurrent edits.
  // Requires: `notes` table added to the `supabase_realtime` publication AND
  // the `realtime` schema must have all migrations applied (including `list_changes` function).
  // See README "Supabase Realtime Setup" section.
  useEffect(() => {
    if (!userId) return undefined;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    channel = supabase
      .channel(`notes-realtime:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `created_by=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updatedNote = payload.new as Note;
            if (!updatedNote?.id) return;

            if (savingNoteIdsRef.current.has(updatedNote.id)) return;

            const currentNote = notesRef.current.find(
              (n) => n.id === updatedNote.id,
            );
            if (!currentNote) return;

            const serverTime = new Date(updatedNote.updated_at ?? 0).getTime();
            const localTime = new Date(currentNote.updated_at ?? 0).getTime();
            if (serverTime <= localTime) return;

            const isActiveNote = activeNoteRef.current?.id === updatedNote.id;
            const toastId = `conflict-${updatedNote.id}`;

            if (isActiveNote) {
              if (!shownConflictToastsRef.current.has(updatedNote.id)) {
                shownConflictToastsRef.current.add(updatedNote.id);
                toast.warning(
                  "This note was updated in another browser or tab.",
                  {
                    id: toastId,
                    duration: 10000,
                    description:
                      "Your local changes are preserved. Refresh to load the latest version.",
                    action: {
                      label: "Refresh",
                      onClick: () => {
                        shownConflictToastsRef.current.delete(updatedNote.id);
                        setNotes((prev) =>
                          prev.map((n) =>
                            n.id === updatedNote.id ? updatedNote : n,
                          ),
                        );
                        setActiveNote((prev) =>
                          prev?.id === updatedNote.id ? updatedNote : prev,
                        );
                        toast.success("Note refreshed to latest version");
                      },
                    },
                  },
                );
              }
            } else {
              setNotes((prev) =>
                prev.map((n) => (n.id === updatedNote.id ? updatedNote : n)),
              );
            }
            return;
          }

          if (payload.eventType === "INSERT") {
            const newNote = payload.new as Note;
            if (!newNote?.id || newNote.deleted_at) return;

            setNotes((prev) => {
              if (prev.some((n) => n.id === newNote.id)) return prev;
              return [newNote, ...prev];
            });
            return;
          }

          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string } | null)?.id;
            if (!deletedId) return;

            setNotes((prev) => {
              const remaining = prev.filter((n) => n.id !== deletedId);
              if (activeNoteRef.current?.id === deletedId) {
                setActiveNote(remaining.length > 0 ? remaining[0] : null);
              }
              return remaining;
            });
            setOpenTabs((prev) => prev.filter((id) => id !== deletedId));
          }
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log(
            "[Notes Realtime] Subscribed to notes changes for user",
            userId,
          );
        } else if (status === "CHANNEL_ERROR") {
          console.warn(
            "[Notes Realtime] Channel error — live sync unavailable, notes still load normally.",
            "Error:",
            err ?? "unknown",
            "| Check: (1) `notes` is in supabase_realtime publication,",
            "(2) realtime schema migrations are healthy in Supabase Dashboard > Logs > Realtime.",
          );
        } else if (status === "TIMED_OUT") {
          console.warn(
            "[Notes Realtime] Subscription timed out — will auto-retry.",
          );
        }
      });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [userId]);

  // Find or create an empty "New Note" - prevents duplicates
  const findOrCreateEmptyNote = useCallback(
    async (folderName: string = "Draft"): Promise<Note> => {
      // Ensure notes are loaded before checking
      await ensureNotesLoaded();

      // Use ref to avoid dependency on notes state
      const currentNotes = notesRef.current;

      // First, check if we have an empty "New Note" in ANY folder
      const existingEmptyNote = findEmptyNewNote(currentNotes);

      if (existingEmptyNote) {
        console.log(
          "Found existing empty note, reusing:",
          existingEmptyNote.id,
        );
        // If it's in a different folder, move it to the target folder
        if (existingEmptyNote.folder_name !== folderName) {
          const updated = await updateNoteService(existingEmptyNote.id, {
            folder_name: folderName,
          });
          setNotes((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n)),
          );
          setActiveNote(updated);
          return updated;
        }
        // Already in the right folder, just return it
        setActiveNote(existingEmptyNote);
        return existingEmptyNote;
      }

      // No empty note exists, create a new one
      const uniqueLabel = generateUniqueLabel(currentNotes);
      console.log(
        "No empty note found, creating new one with label:",
        uniqueLabel,
      );
      const newNote = await createNoteService({
        label: uniqueLabel,
        folder_name: folderName,
        content: "",
      });

      setNotes((prev) => [newNote, ...prev]);
      setActiveNote(newNote);
      return newNote;
    },
    [ensureNotesLoaded],
  ); // Depend on ensureNotesLoaded

  // Create a new note (with duplicate checking)
  const createNote = useCallback(
    async (input: CreateNoteInput): Promise<Note> => {
      // Ensure notes are loaded before creating
      await ensureNotesLoaded();

      const targetFolder = input.folder_name || "Draft";

      // If creating an empty note, check for existing empty notes first
      if (!input.content || input.content.trim() === "") {
        return findOrCreateEmptyNote(targetFolder);
      }

      // Creating a note with content, proceed normally
      const currentNotes = notesRef.current;
      const uniqueLabel = input.label || generateUniqueLabel(currentNotes);
      const newNote = await createNoteService({
        ...input,
        label: uniqueLabel,
      });

      setNotes((prev) => [newNote, ...prev]);
      setActiveNote(newNote);
      return newNote;
    },
    [ensureNotesLoaded, findOrCreateEmptyNote],
  );

  // Update a note
  const updateNote = useCallback(
    async (id: string, updates: UpdateNoteInput): Promise<Note> => {
      // Mark as saving to suppress spurious realtime conflict warnings
      savingNoteIdsRef.current.add(id);
      // Clear any shown conflict toast for this note (we're actively saving)
      shownConflictToastsRef.current.delete(id);

      // Optimistic update for immediate UI feedback
      setNotes((prev) =>
        prev.map((note) => (note.id === id ? { ...note, ...updates } : note)),
      );
      setActiveNote((prev) =>
        prev?.id === id ? { ...prev, ...updates } : prev,
      );

      try {
        // Persist to database
        const updated = await updateNoteService(id, updates);

        // Sync with server response (picks up server-generated updated_at etc.)
        setNotes((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
        setActiveNote((prev) => (prev?.id === id ? updated : prev));

        return updated;
      } finally {
        // Small delay before removing from saving set, to absorb the realtime echo
        setTimeout(() => {
          savingNoteIdsRef.current.delete(id);
        }, 2000);
      }
    },
    [],
  ); // No dependencies!

  // Delete a note
  const deleteNote = useCallback(async (id: string): Promise<void> => {
    // Optimistic delete and handle active note in one go
    setNotes((prev) => {
      const remaining = prev.filter((n) => n.id !== id);

      // If the deleted note was active, select another one
      const currentActive = activeNoteRef.current;
      if (currentActive?.id === id) {
        setActiveNote(remaining.length > 0 ? remaining[0] : null);
      }

      return remaining;
    });

    // Persist to database
    await deleteNoteService(id);
  }, []); // No dependencies!

  // Copy a note
  const copyNote = useCallback(async (id: string): Promise<Note> => {
    const copiedNote = await copyNoteService(id);
    setNotes((prev) => [copiedNote, ...prev]);
    setActiveNote(copiedNote);
    return copiedNote;
  }, []);

  // Tab Management Functions

  // Open a note in a tab (or switch to it if already open)
  const openNoteInTab = useCallback((noteId: string) => {
    setOpenTabs((prev) => {
      // Check if note is already in a tab
      const existingIndex = prev.indexOf(noteId);

      if (existingIndex !== -1) {
        // Note already open - just switch to it
        const note = notesRef.current.find((n) => n.id === noteId);
        if (note) {
          setActiveNote(note);
        }
        // If note not found in ref (race condition), don't clobber activeNote
        // — findOrCreateEmptyNote already called setActiveNote(newNote) correctly
        return prev; // No change to tabs
      }

      // Add new tab
      return [...prev, noteId];
    });

    // Set as active note — ONLY if the note is found in the ref.
    // For brand-new notes, notesRef may not have been updated yet (stale ref race).
    // In that case findOrCreateEmptyNote already set activeNote correctly, so we skip it here.
    const note = notesRef.current.find((n) => n.id === noteId);
    if (note) {
      setActiveNote(note);
    }
  }, []);

  // Close a tab
  const closeTab = useCallback((noteId: string) => {
    setOpenTabs((prev) => {
      const index = prev.indexOf(noteId);
      if (index === -1) return prev; // Not in tabs

      const newTabs = prev.filter((id) => id !== noteId);

      // If closing the active note, switch to adjacent tab
      const currentActive = activeNoteRef.current;
      if (currentActive?.id === noteId && newTabs.length > 0) {
        // Switch to the tab at the same index (or previous if last)
        const nextIndex = index >= newTabs.length ? newTabs.length - 1 : index;
        const nextNoteId = newTabs[nextIndex];
        const nextNote = notesRef.current.find((n) => n.id === nextNoteId);
        if (nextNote) {
          setActiveNote(nextNote);
        }
      } else if (currentActive?.id === noteId && newTabs.length === 0) {
        // No more tabs, clear active note
        setActiveNote(null);
      }

      return newTabs;
    });
  }, []);

  // Close all tabs
  const closeAllTabs = useCallback(() => {
    setOpenTabs([]);
    setActiveNote(null);
  }, []);

  // Reorder tabs (for drag and drop)
  const reorderTabs = useCallback((newOrder: string[]) => {
    // Ensure uniqueness when reordering (safety check)
    setOpenTabs(Array.from(new Set(newOrder)));
  }, []);

  // Cleanup: Remove deleted notes from tabs and ensure uniqueness
  useEffect(() => {
    setOpenTabs((prev) => {
      const validNoteIds = new Set(notes.map((n) => n.id));
      const filtered = prev.filter((id) => validNoteIds.has(id));
      // Deduplicate to prevent the same note appearing multiple times
      return Array.from(new Set(filtered));
    });
  }, [notes]);

  // Memoize context value to prevent unnecessary re-renders
  const value: NotesContextType = useMemo(
    () => ({
      notes,
      isLoading,
      error,
      activeNote,
      setActiveNote,
      setActiveNoteDirty,
      createNote,
      updateNote,
      deleteNote,
      copyNote,
      refreshNotes,
      findOrCreateEmptyNote,
      openTabs,
      openNoteInTab,
      closeTab,
      closeAllTabs,
      reorderTabs,
    }),
    [
      notes,
      isLoading,
      error,
      activeNote,
      setActiveNoteDirty,
      createNote,
      updateNote,
      deleteNote,
      copyNote,
      refreshNotes,
      findOrCreateEmptyNote,
      openTabs,
      openNoteInTab,
      closeTab,
      closeAllTabs,
      reorderTabs,
    ],
  );

  return (
    <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
  );
}

export function useNotesContext() {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error("useNotesContext must be used within a NotesProvider");
  }
  return context;
}
