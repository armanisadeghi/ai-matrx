/**
 * Notes — Redux Thunks
 *
 * Read thunks:
 *   fetchNotesList           — lightweight list for sidebar (id, label, folder_name, tags, updated_at, position)
 *   fetchNoteContent         — full note when tab opened
 *
 * Write thunks:
 *   saveNote                 — save dirty fields with concurrency check
 *   createNewNote            — create note in DB
 *   deleteNote               — soft delete
 *   copyNote                 — duplicate a note
 *   findOrCreateEmptyNote    — find existing empty note or create one
 *   moveNoteToFolder         — move note to a different folder
 *   saveNoteField            — quick single-field save + optimistic update
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/store";
import type { Note, CreateNoteInput } from "../types";
import type { NoteRecord, NoteScopeAssignment } from "./notes.types";
import {
  upsertNoteFromServer,
  removeNote,
  markNoteSaving,
  markNoteSaved,
  markNoteSaveError,
  clearSavingNoteId,
  setListStatus,
  setListError,
  setActiveNote,
  addTab,
  setNoteField,
} from "./slice";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserId(getState: () => unknown): string {
  const state = getState() as RootState;
  const userId = state.userAuth.id;
  if (!userId) throw new Error("User is not authenticated");
  return userId;
}

function dispatchCustomEvent(name: string, detail?: unknown): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

// Echo suppression timeout (ms)
const SAVING_NOTE_ID_TIMEOUT = 3000;

// ---------------------------------------------------------------------------
// 1. fetchNotesList
// ---------------------------------------------------------------------------

/**
 * Fetch basics for sidebar: id, label, folder_name, tags, updated_at, position.
 * Dispatches upsertNoteFromServer for each with fetchStatus "list".
 */
export const fetchNotesList = createAsyncThunk<void, void>(
  "notes/fetchNotesList",
  async (_, { dispatch, getState }) => {
    console.log("[Track Quick Notes] 6, thunks.ts — fetchNotesList started");
    const userId = getUserId(getState);

    dispatch(setListStatus("loading"));

    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .select(
        "id, label, content, folder_name, folder_id, tags, updated_at, position, organization_id, project_id, task_id, visibility, version",
      )
      .eq("created_by", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      dispatch(setListError(error.message));
      dispatch(setListStatus("error"));
      throw error;
    }

    const notes = data ?? [];

    for (const note of notes) {
      dispatch(
        upsertNoteFromServer({
          note: { ...note, created_by: userId },
          fetchStatus: "list",
        }),
      );
    }

    console.log("[Track Quick Notes] 6c, thunks.ts — fetchNotesList complete", {
      notesCount: notes.length,
    });
    dispatch(setListStatus("loaded"));
  },
);

// ---------------------------------------------------------------------------
// 2. fetchNoteContent
// ---------------------------------------------------------------------------

/**
 * Fetch the full note when a tab is opened.
 * Dispatches upsertNoteFromServer with fetchStatus "full".
 */
export const fetchNoteContent = createAsyncThunk<Note | null, string>(
  "notes/fetchNoteContent",
  async (noteId, { dispatch, getState }) => {
    // Skip if we already have full content — never refetch unless forced
    const state = getState() as RootState;
    const existing = state.notes?.notes?.[noteId];
    if (existing?._fetchStatus === "full") {
      return null; // Already have it — no network call
    }

    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .select("*")
      .eq("id", noteId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Note not found");

    dispatch(
      upsertNoteFromServer({
        note: data,
        fetchStatus: "full",
      }),
    );

    return data as Note;
  },
);

// ---------------------------------------------------------------------------
// 2b. refreshNoteContent
// ---------------------------------------------------------------------------

/**
 * Force-refetch the full note from the server, bypassing the cache guard in
 * fetchNoteContent. Used by the explicit "Refresh" action so users can pull
 * the latest server state for currently-open tabs (e.g. after a sibling
 * device edited the note).
 *
 * Skips notes that have unsaved local changes to avoid clobbering the user's
 * work — the user must save or discard before the server copy overwrites them.
 */
export const refreshNoteContent = createAsyncThunk<Note | null, string>(
  "notes/refreshNoteContent",
  async (noteId, { dispatch, getState }) => {
    const state = getState() as RootState;
    const existing = state.notes?.notes?.[noteId] as NoteRecord | undefined;

    // Guard: never overwrite dirty local state with a forced refresh.
    if (existing?._dirty) {
      return null;
    }

    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .select("*")
      .eq("id", noteId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Note not found");

    dispatch(
      upsertNoteFromServer({
        note: data,
        fetchStatus: "full",
      }),
    );

    return data as Note;
  },
);

// ---------------------------------------------------------------------------
// 3. saveNote
// ---------------------------------------------------------------------------

/**
 * Save dirty fields with concurrency check.
 * - Reads note from state, checks _dirty and _dirtyFields
 * - Builds update object from only dirty fields
 * - Concurrency check: fetch server updated_at, compare with local
 * - If conflict: dispatch error, don't save
 * - If ok: markNoteSaving → update → markNoteSaved
 * - Echo suppression: manage _savingNoteIds with 3s timeout
 * - Label change: dispatch custom event "notes:labelChange"
 */
export const saveNote = createAsyncThunk<void, string>(
  "notes/saveNote",
  async (noteId, { dispatch, getState }) => {
    const state = getState() as RootState;
    const record = state.notes.notes[noteId] as NoteRecord | undefined;

    if (!record || !record._dirty || record._dirtyFields.size === 0) {
      return;
    }

    // Build update object from only dirty fields
    const updates: Record<string, unknown> = {};
    const dirtyFields = Array.from(record._dirtyFields);
    const hasLabelChange = dirtyFields.includes("label");

    for (const field of dirtyFields) {
      updates[field] = record[field];
    }

    // Concurrency check: fetch server updated_at
    const { data: serverNote, error: fetchError } = await supabase
      .schema("workbench").from("notes")
      .select("updated_at")
      .eq("id", noteId)
      .single();

    if (fetchError) {
      dispatch(markNoteSaveError({ id: noteId, error: fetchError.message }));
      throw fetchError;
    }

    if (serverNote && serverNote.updated_at !== record.updated_at) {
      const conflictMsg =
        "Conflict: note was modified on another device or tab. Please refresh.";
      dispatch(markNoteSaveError({ id: noteId, error: conflictMsg }));
      throw new Error(conflictMsg);
    }

    // Proceed with save
    dispatch(markNoteSaving(noteId));

    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .update(updates)
      .eq("id", noteId)
      .select("updated_at")
      .single();

    if (error) {
      dispatch(markNoteSaveError({ id: noteId, error: error.message }));
      throw error;
    }

    dispatch(
      markNoteSaved({
        id: noteId,
        updatedAt: data?.updated_at,
      }),
    );

    // Echo suppression: clear saving ID after timeout
    setTimeout(() => {
      dispatch(clearSavingNoteId(noteId));
    }, SAVING_NOTE_ID_TIMEOUT);

    // Dispatch label change event if label was dirty
    if (hasLabelChange) {
      dispatchCustomEvent("notes:labelChange", {
        noteId,
        label: record.label,
      });
    }
  },
);

// ---------------------------------------------------------------------------
// 4. createNewNote
// ---------------------------------------------------------------------------

/**
 * Resolve a folder_name to a folder_id by looking up (or creating) a note_folders record.
 * Returns the folder_id UUID, or null if resolution fails.
 */
async function resolveFolderId(
  userId: string,
  folderName: string,
): Promise<string | null> {
  // Try to find existing folder for this user
  const { data: existing } = await supabase
    .schema("workbench").from("note_folders")
    .select("id")
    .eq("created_by", userId)
    .eq("name", folderName)
    .is("deleted_at", null)
    .limit(1)
    .single();

  if (existing?.id) return existing.id;

  // Create the folder record
  const { data: created, error } = await supabase
    .schema("workbench").from("note_folders")
    .insert({
      created_by: userId,
      name: folderName,
      path: folderName,
      position: 0,
      // note_folders is a root entity (no parent → no org-inherit trigger), so
      // organization_id is NOT NULL with nothing to fill it. Resolve it here.
      organization_id: await ensureOrgId(undefined),
    })
    .select("id")
    .single();

  if (error || !created) return null;
  return created.id;
}

/**
 * Create a new note in the database.
 * Resolves folder_name to folder_id via note_folders table.
 * Dispatches upsertNoteFromServer with "full", addTab, setActiveNote.
 */
export const createNewNote = createAsyncThunk<
  Note,
  CreateNoteInput | undefined
>("notes/createNewNote", async (input = {}, { dispatch, getState }) => {
  const userId = getUserId(getState);
  const folderName = input.folder_name ?? "Draft";

  // Resolve folder_id from note_folders table
  const folderId =
    input.folder_id ?? (await resolveFolderId(userId, folderName));

  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .insert({
      // Canonical RLS std_insert requires created_by = auth.uid().
      created_by: userId,
      label: input.label ?? "New Note",
      content: input.content ?? "",
      folder_name: folderName,
      folder_id: folderId,
      tags: input.tags ?? [],
      metadata: {},
      position: 0,
      // Private by default — the `notes.visibility` enum DB default is
      // 'internal' (org-visible), so set it explicitly on create.
      visibility: input.visibility ?? "private",
      // folder_id can be null here, so the org-inherit trigger may have no
      // parent to read — resolve the org explicitly (never insert a null org).
      organization_id: await ensureOrgId(input.organization_id),
      ...(input.project_id && { project_id: input.project_id }),
      ...(input.task_id && { task_id: input.task_id }),
    })
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("Failed to create note");

  const note = data as Note;

  dispatch(
    upsertNoteFromServer({
      note,
      fetchStatus: "full",
    }),
  );

  dispatch(addTab(note.id));
  dispatch(setActiveNote(note.id));

  return note;
});

// ---------------------------------------------------------------------------
// 5. deleteNote
// ---------------------------------------------------------------------------

/**
 * Soft delete a note (set deleted_at = now).
 * Dispatches removeNote and custom event "notes:deleted".
 */
export const deleteNote = createAsyncThunk<void, string>(
  "notes/deleteNote",
  async (noteId, { dispatch }) => {
    const { error } = await supabase
      .schema("workbench").from("notes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", noteId);

    if (error) throw error;

    dispatch(removeNote(noteId));
    dispatchCustomEvent("notes:deleted", { noteId });
  },
);

// ---------------------------------------------------------------------------
// 6. copyNote
// ---------------------------------------------------------------------------

/**
 * Duplicate a note. Creates a new note with the same content, tags, folder,
 * and label + " (Copy)". Opens the copy in a new tab.
 */
export const copyNote = createAsyncThunk<Note, string>(
  "notes/copyNote",
  async (noteId, { dispatch, getState }) => {
    const state = getState() as RootState;
    const record = state.notes.notes[noteId] as NoteRecord | undefined;
    const userId = getUserId(getState);

    if (!record) throw new Error("Note not found in state");

    const copyLabel =
      record.label.toLowerCase() === "new note"
        ? "New Note"
        : `${record.label} (Copy)`;

    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .insert({
        // Canonical RLS std_insert requires created_by = auth.uid().
        created_by: userId,
        label: copyLabel,
        content: record.content,
        folder_name: record.folder_name,
        tags: record.tags ?? [],
        metadata: {},
        position: 0,
        // A duplicate is private by default — don't inherit a shared
        // visibility, and don't fall through to the DB 'internal' default.
        visibility: "private",
        // Keep the copy in the original's org; fall back to the personal org.
        organization_id: await ensureOrgId(record.organization_id),
      })
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("Failed to copy note");

    const note = data as Note;

    dispatch(
      upsertNoteFromServer({
        note,
        fetchStatus: "full",
      }),
    );

    dispatch(addTab(note.id));
    dispatch(setActiveNote(note.id));

    return note;
  },
);

// ---------------------------------------------------------------------------
// 7. findOrCreateEmptyNote
// ---------------------------------------------------------------------------

/**
 * Find an existing empty "New Note" in the given folder, or create one.
 * Returns the note and sets it active.
 */
export const findOrCreateEmptyNote = createAsyncThunk<Note, string | undefined>(
  "notes/findOrCreateEmptyNote",
  async (folder = "Draft", { dispatch, getState }) => {
    const state = getState() as RootState;
    const allNotes = state.notes.notes;

    // Check state for existing "New Note" with empty content in the folder
    for (const record of Object.values(allNotes)) {
      if (
        record.label === "New Note" &&
        (!record.content || record.content.trim() === "") &&
        record.folder_name === folder &&
        !record.deleted_at
      ) {
        dispatch(addTab(record.id));
        dispatch(setActiveNote(record.id));
        return record as Note;
      }
    }

    // No existing empty note found — create one
    const result = await dispatch(
      createNewNote({ folder_name: folder }),
    ).unwrap();

    return result;
  },
);

// ---------------------------------------------------------------------------
// 8. moveNoteToFolder
// ---------------------------------------------------------------------------

/**
 * Move a note to a different folder. Optimistically updates state,
 * then schedules a save.
 */
export const moveNoteToFolder = createAsyncThunk<
  void,
  { noteId: string; folder: string }
>(
  "notes/moveNoteToFolder",
  async ({ noteId, folder }, { dispatch, getState }) => {
    const userId = getUserId(getState);

    // Resolve folder_id for the target folder
    const folderId = await resolveFolderId(userId, folder);

    dispatch(
      setNoteField({
        id: noteId,
        field: "folder_name",
        value: folder,
      }),
    );

    if (folderId) {
      dispatch(
        setNoteField({
          id: noteId,
          field: "folder_id",
          value: folderId,
        }),
      );
    }

    await dispatch(saveNote(noteId)).unwrap();
  },
);

// ---------------------------------------------------------------------------
// 9. saveNoteField
// ---------------------------------------------------------------------------

/**
 * Quick single-field save with optimistic update.
 * Dispatches setNoteField (updates undo + state), then schedules saveNote.
 */
export const saveNoteField = createAsyncThunk<
  void,
  {
    noteId: string;
    field: "content" | "label" | "folder_name" | "tags";
    value: Note["content"] | Note["label"] | Note["folder_name"] | Note["tags"];
  }
>("notes/saveNoteField", async ({ noteId, field, value }, { dispatch }) => {
  dispatch(
    setNoteField({
      id: noteId,
      field,
      value,
    }),
  );

  await dispatch(saveNote(noteId)).unwrap();
});

// ---------------------------------------------------------------------------
// 10. restoreNote
// ---------------------------------------------------------------------------

/**
 * Restore a soft-deleted note — clears deleted_at and re-adds to Redux.
 */
export const restoreNote = createAsyncThunk<void, string>(
  "notes/restoreNote",
  async (noteId, { dispatch }) => {
    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .update({ deleted_at: null })
      .eq("id", noteId)
      .select("*")
      .single();

    if (error) throw error;
    if (data) {
      dispatch(upsertNoteFromServer({ note: data, fetchStatus: "full" }));
    }
  },
);

// ---------------------------------------------------------------------------
// 11. fetchDeletedNotes
// ---------------------------------------------------------------------------

/**
 * Fetch soft-deleted notes for the Trash folder.
 * Only called on demand when the user opens the Trash.
 */
export const fetchDeletedNotes = createAsyncThunk<void, void>(
  "notes/fetchDeletedNotes",
  async (_, { dispatch, getState }) => {
    const userId = getUserId(getState);

    const { data, error } = await supabase
      .schema("workbench").from("notes")
      .select(
        "id, label, folder_name, folder_id, tags, content, updated_at, position, organization_id, project_id, task_id, visibility, deleted_at, version",
      )
      .eq("created_by", userId)
      .not("deleted_at", "is", null)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    for (const note of data ?? []) {
      dispatch(
        upsertNoteFromServer({
          note: { ...note, created_by: userId },
          fetchStatus: "full",
        }),
      );
    }
  },
);

// ---------------------------------------------------------------------------
// 12. fetchAllNoteScopes
// ---------------------------------------------------------------------------

/**
 * Fetch all scope assignments for entity_type = 'note'.
 * Returns denormalized rows with scope name + type for sidebar grouping.
 *
 * Scope tags now live on `platform.associations`; the denormalized read goes
 * through the `scopesService` chokepoint (which also owns the ctx_scopes /
 * ctx_scope_types join) rather than querying ctx_scope_assignments directly.
 */
export const fetchAllNoteScopes = createAsyncThunk<NoteScopeAssignment[], void>(
  "notes/fetchAllNoteScopes",
  async () => {
    const res = await scopesService.listEntityScopeTags("note");
    if (isScopesRpcErr(res)) throw new Error(res.error.message);
    return res.data.tags.map((t) => ({
      entity_id: t.entity_id,
      scope_id: t.scope_id,
      scope_name: t.scope_name,
      scope_type: t.scope_type,
    }));
  },
);
