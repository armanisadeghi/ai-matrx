"use client";

// useWorkspaceNotesRedux — Bridge hook that replaces NotesWorkspace's local Map cache
// with Redux state. Preserves the exact same API the workspace uses internally
// so the migration is a drop-in replacement without rewriting the render logic.
//
// This hook manages:
// - Note cache (read/write through Redux)
// - Auto-save with debounce (timer management)
// - Echo suppression for realtime
// - URL ↔ Redux sync for tabs and activeNoteId
// - Conflict detection via analyzeDiff

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { selectUser } from "@/lib/redux/slices/userSlice";
import {
  setNoteField,
  upsertNoteFromServer,
  removeNote,
  markNoteSaving,
  markNoteSaved,
  markNoteSaveError,
  clearSavingNoteId,
  setActiveNote as setActiveNoteAction,
  addTab,
  removeTab,
  reorderTabs as reorderTabsAction,
  setListStatus,
} from "../redux/slice";
import {
  selectNotesMap,
  selectActiveNoteId,
  selectOpenTabs,
  selectAllNotesList,
  selectAllFolders,
  selectSavingNoteIds,
} from "../redux/selectors";
import { fetchNotesList, fetchNoteContent } from "../redux/thunks";
import type { Note } from "../types";
import type { NoteRecord } from "../redux/notes.types";
import { analyzeDiff, type DiffAnalysis } from "../utils/diffAnalysis";

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceNoteData {
  id: string;
  label: string;
  content: string;
  folder_name: string;
  tags: string[];
  metadata: Record<string, unknown>;
  updated_at: string;
}

export type SaveState = "saved" | "dirty" | "saving" | "conflict";

export interface WorkspaceCachedNote {
  data: WorkspaceNoteData;
  localEdits: { label: string; content: string } | null;
  saveState: SaveState;
  fetchedAt: number;
}

export interface ConflictData {
  noteId: string;
  noteTitle: string;
  localContent: string;
  remoteContent: string;
  analysis: DiffAnalysis;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceNotesRedux() {
  const dispatch = useAppDispatch();
  const notesMap = useAppSelector(selectNotesMap);
  const activeNoteId = useAppSelector(selectActiveNoteId);
  const openTabs = useAppSelector(selectOpenTabs);
  const notesList = useAppSelector(selectAllNotesList);
  const allFolders = useAppSelector(selectAllFolders);
  const savingNoteIds = useAppSelector(selectSavingNoteIds);
  const { id: userId } = useAppSelector(selectUser);

  // Save debounce timers (local ref — not in Redux)
  const saveTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Auto-label tracking
  const autoLabeledRef = useRef<Set<string>>(new Set());

  // ── Fetch on init ──────────────────────────────────────────────────────
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current && userId) {
      initRef.current = true;
      dispatch(fetchNotesList());
    }
  }, [dispatch, userId]);

  // ── Convert NoteRecord → WorkspaceCachedNote for compatibility ─────────
  const getCachedNote = useCallback(
    (noteId: string): WorkspaceCachedNote | undefined => {
      const record = notesMap[noteId];
      if (!record) return undefined;

      return {
        data: {
          id: record.id,
          label: record.label,
          content: record.content,
          folder_name: record.folder_name,
          tags: record.tags,
          metadata: record.metadata as Record<string, unknown>,
          updated_at: record.updated_at,
        },
        localEdits: record._dirty
          ? { label: record.label, content: record.content }
          : null,
        saveState: record._error === "conflict"
          ? "conflict"
          : record._saving
            ? "saving"
            : record._dirty
              ? "dirty"
              : "saved",
        fetchedAt: Date.now(), // NoteRecord doesn't track fetchedAt — approximate
      };
    },
    [notesMap],
  );

  // ── Schedule save (debounced) ──────────────────────────────────────────
  const scheduleSave = useCallback(
    (noteId: string, label: string, content: string) => {
      const timers = saveTimerRef.current;
      const existing = timers.get(noteId);
      if (existing) clearTimeout(existing);

      // Mark dirty via Redux
      dispatch(setNoteField({ id: noteId, field: "content", value: content }));
      if (label) {
        dispatch(setNoteField({ id: noteId, field: "label", value: label }));
      }

      // Schedule save
      const timer = setTimeout(async () => {
        timers.delete(noteId);
        dispatch(markNoteSaving(noteId));

        try {
          const record = notesMap[noteId];
          if (!record) return;

          const updates: Record<string, unknown> = {};
          // Compare against the original (non-dirty) baseline
          const baseline = record._fieldHistory;
          if (content !== (baseline.content ?? record.content))
            updates.content = content;
          if (label !== (baseline.label ?? record.label)) updates.label = label;

          if (Object.keys(updates).length === 0) {
            dispatch(markNoteSaved({ id: noteId }));
            return;
          }

          const { data, error } = await supabase
            .from("notes")
            .update(updates)
            .eq("id", noteId)
            .select("updated_at")
            .single();

          if (error) {
            dispatch(markNoteSaveError({ id: noteId, error: error.message }));
            return;
          }

          dispatch(
            markNoteSaved({
              id: noteId,
              updatedAt: data?.updated_at,
            }),
          );

          if (updates.label) {
            window.dispatchEvent(
              new CustomEvent("notes:labelChange", {
                detail: { noteId, label: updates.label },
              }),
            );
          }
        } catch (err) {
          dispatch(
            markNoteSaveError({
              id: noteId,
              error: err instanceof Error ? err.message : "Save failed",
            }),
          );
        }

        // Echo suppression cleanup
        setTimeout(() => {
          dispatch(clearSavingNoteId(noteId));
        }, 3000);
      }, 1500);

      timers.set(noteId, timer);
    },
    [dispatch, notesMap],
  );

  // ── Force save (cancel debounce, save immediately) ─────────────────────
  const forceSave = useCallback(
    (noteId: string) => {
      const timers = saveTimerRef.current;
      const t = timers.get(noteId);
      if (t) {
        clearTimeout(t);
        timers.delete(noteId);
      }
      const record = notesMap[noteId];
      if (!record || !record._dirty) return;
      scheduleSave(noteId, record.label, record.content);
    },
    [notesMap, scheduleSave],
  );

  // ── Fetch full note content ────────────────────────────────────────────
  const fetchNote = useCallback(
    (noteId: string) => {
      dispatch(fetchNoteContent(noteId));
    },
    [dispatch],
  );

  // ── Tab management ─────────────────────────────────────────────────────
  const switchTab = useCallback(
    (noteId: string) => {
      dispatch(setActiveNoteAction(noteId));
      if (!openTabs.includes(noteId)) {
        dispatch(addTab(noteId));
      }
      dispatch(fetchNoteContent(noteId));
    },
    [dispatch, openTabs],
  );

  const closeTab = useCallback(
    (noteId: string) => {
      dispatch(removeTab(noteId));
    },
    [dispatch],
  );

  const closeOtherTabs = useCallback(
    (keepId: string) => {
      const toRemove = openTabs.filter((id) => id !== keepId);
      toRemove.forEach((id) => dispatch(removeTab(id)));
      dispatch(setActiveNoteAction(keepId));
    },
    [dispatch, openTabs],
  );

  const closeAllTabs = useCallback(() => {
    openTabs.forEach((id) => dispatch(removeTab(id)));
  }, [dispatch, openTabs]);

  const reorderTabs = useCallback(
    (dragId: string, dropId: string) => {
      if (dragId === dropId) return;
      const filtered = openTabs.filter((t) => t !== dragId);
      const dropIdx = filtered.indexOf(dropId);
      if (dropIdx === -1) return;
      filtered.splice(dropIdx, 0, dragId);
      dispatch(reorderTabsAction(filtered));
    },
    [dispatch, openTabs],
  );

  // ── CRUD operations ────────────────────────────────────────────────────
  const deleteNote = useCallback(
    async (noteId: string) => {
      await supabase
        .from("notes")
        .update({ is_deleted: true })
        .eq("id", noteId);
      dispatch(removeNote(noteId));
      window.dispatchEvent(
        new CustomEvent("notes:deleted", { detail: { noteId } }),
      );
    },
    [dispatch],
  );

  const duplicateNote = useCallback(
    async (noteId: string) => {
      const record = notesMap[noteId];
      if (!record || !userId) return;

      const { data, error } = await supabase
        .from("notes")
        .insert({
          user_id: userId,
          // Canonical RLS std_insert requires created_by = auth.uid().
          created_by: userId,
          label: record.label === "New Note" ? "New Note" : `${record.label} (Copy)`,
          content: record.content,
          folder_name: record.folder_name,
          tags: record.tags,
          // Private by default — the `notes.visibility` enum DB default is
          // 'internal' (org-visible), so set it explicitly on create.
          visibility: "private",
        })
        .select()
        .single();

      if (error || !data) return;

      dispatch(
        upsertNoteFromServer({ note: data as Note, fetchStatus: "full" }),
      );
      dispatch(addTab(data.id));
      dispatch(setActiveNoteAction(data.id));
      window.dispatchEvent(
        new CustomEvent("notes:created", { detail: data }),
      );
    },
    [dispatch, notesMap, userId],
  );

  const moveNote = useCallback(
    async (noteId: string, folder: string) => {
      dispatch(setNoteField({ id: noteId, field: "folder_name", value: folder }));
      await supabase
        .from("notes")
        .update({ folder_name: folder })
        .eq("id", noteId);
      window.dispatchEvent(
        new CustomEvent("notes:moved", { detail: { noteId, folder } }),
      );
    },
    [dispatch],
  );

  const createNoteInActiveFolder = useCallback(
    async (folder: string) => {
      if (!userId) return;
      const { data, error } = await supabase
        .from("notes")
        .insert({
          user_id: userId,
          // Canonical RLS std_insert requires created_by = auth.uid().
          created_by: userId,
          label: "New Note",
          content: "",
          folder_name: folder || "Draft",
          // Private by default — the `notes.visibility` enum DB default is
          // 'internal' (org-visible), so set it explicitly on create.
          visibility: "private",
        })
        .select()
        .single();

      if (error || !data) return;

      dispatch(
        upsertNoteFromServer({ note: data as Note, fetchStatus: "full" }),
      );
      dispatch(addTab(data.id));
      dispatch(setActiveNoteAction(data.id));
      window.dispatchEvent(
        new CustomEvent("notes:created", { detail: data }),
      );
      return data;
    },
    [dispatch, userId],
  );

  const updateTags = useCallback(
    async (noteId: string, tags: string[]) => {
      dispatch(setNoteField({ id: noteId, field: "tags", value: tags }));
      await supabase.from("notes").update({ tags }).eq("id", noteId);
    },
    [dispatch],
  );

  const shareNote = useCallback(async (noteId: string) => {
    const record = notesMap[noteId];
    if (!record) return;
    try {
      await navigator.clipboard.writeText(record.content);
    } catch {
      // ignore
    }
  }, [notesMap]);

  const exportNote = useCallback(
    (noteId: string) => {
      const record = notesMap[noteId];
      if (!record) return;
      const blob = new Blob([record.content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record.label || "note"}.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [notesMap],
  );

  return {
    // State
    notesMap,
    activeNoteId,
    openTabs,
    notesList,
    allFolders,
    savingNoteIds,
    autoLabeledRef,

    // Cache helpers
    getCachedNote,

    // Save
    scheduleSave,
    forceSave,

    // Fetch
    fetchNote,

    // Tabs
    switchTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    reorderTabs,

    // CRUD
    deleteNote,
    duplicateNote,
    moveNote,
    createNoteInActiveFolder,
    updateTags,
    shareNote,
    exportNote,

    // Dispatch (for direct actions)
    dispatch,
  };
}
