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
import type { TablesUpdate } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/store";
import { createFolder } from "../service/notesService";
import {
  noteSaveErrorMessage,
  toastNoteWriteBlocked,
  clearNoteWriteBlockedToast,
  NOTE_READONLY_DELETE_MESSAGE,
} from "../utils/writeErrors";
import type { Note, CreateNoteInput } from "../types";
import type {
  NoteRecord,
  NoteScopeAssignment,
  NoteUndoableField,
  SharedNotePermissionLevel,
} from "./notes.types";
import {
  upsertNoteFromServer,
  upsertNotesFromServer,
  removeNote,
  markNoteSaving,
  markNoteSaved,
  markNoteSaveError,
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
      .schema("workbench")
      .from("notes")
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

    // ONE dispatch for the whole page. A per-note dispatch loop notified
    // every store subscriber (and re-ran every sorted list selector) once
    // per note — O(N²·log N) on /notes entry, a main-thread freeze on large
    // collections (2026-07 freeze class — see FEATURE.md § Realtime echo
    // doctrine).
    dispatch(
      upsertNotesFromServer({
        upserts: notes.map((note) => ({
          note: { ...note, created_by: userId },
          fetchStatus: "list" as const,
        })),
      }),
    );

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
      .schema("workbench")
      .from("notes")
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
      .schema("workbench")
      .from("notes")
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
 * Save dirty fields with atomic concurrency check.
 * - Reads note from state, checks _dirty and _dirtyFields
 * - UPDATE … WHERE updated_at = local (0 rows ⇒ conflict / RLS deny)
 * - markNoteSaved gets a savedSnapshot so mid-save keystrokes stay dirty
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

    // Build update object from only dirty fields (snapshot for mid-save safety)
    const updates: Record<string, unknown> = {};
    const savedSnapshot: Partial<
      Record<NoteUndoableField, Note[NoteUndoableField]>
    > = {};
    const dirtyFields = Array.from(record._dirtyFields);
    const hasLabelChange = dirtyFields.includes("label");

    for (const field of dirtyFields) {
      updates[field] = record[field];
      savedSnapshot[field] = record[field];
    }

    // Proceed with save
    dispatch(markNoteSaving(noteId));

    // Atomic optimistic lock via updated_at predicate (OLD row; trigger only
    // mutates NEW). 0 rows ⇒ conflict or RLS deny.
    let query = supabase
      .schema("workbench")
      .from("notes")
      .update(updates as TablesUpdate<{ schema: "workbench" }, "notes">)
      .eq("id", noteId);

    if (record.updated_at) {
      query = query.eq("updated_at", record.updated_at);
    }

    const { data, error } = await query.select("updated_at").maybeSingle();

    if (error) {
      const friendly = noteSaveErrorMessage(error);
      dispatch(markNoteSaveError({ id: noteId, error: friendly }));
      toastNoteWriteBlocked(noteId, friendly);
      throw error;
    }

    if (!data) {
      const { data: stillThere } = await supabase
        .schema("workbench")
        .from("notes")
        .select("updated_at")
        .eq("id", noteId)
        .maybeSingle();

      if (!stillThere) {
        const friendly = "You don't have permission to save this note.";
        dispatch(markNoteSaveError({ id: noteId, error: friendly }));
        toastNoteWriteBlocked(noteId, friendly);
        throw new Error(friendly);
      }

      const conflictMsg =
        "Conflict: note was modified on another device or tab. Please refresh.";
      dispatch(markNoteSaveError({ id: noteId, error: "conflict" }));
      throw new Error(conflictMsg);
    }

    clearNoteWriteBlockedToast(noteId);
    dispatch(
      markNoteSaved({
        id: noteId,
        updatedAt: data.updated_at ?? undefined,
        savedSnapshot,
      }),
    );

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
 * Resolve a folder_name to a folder_id by looking up (or creating) a note_folders
 * record. Returns the folder_id UUID, or null if resolution fails.
 *
 * Delegates to the ONE canonical folder get-or-create — `notesService.createFolder`
 * — which is atomic (ON CONFLICT DO NOTHING against the (created_by, name) unique
 * index, never a 23505/409). The folder is always the current user's
 * (createFolder uses requireUserId(); RLS forbids creating one for anyone else),
 * so no user id is threaded here.
 */
async function resolveFolderId(folderName: string): Promise<string | null> {
  try {
    return await createFolder(folderName);
  } catch (err) {
    console.error("Error resolving folder id:", err);
    return null;
  }
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
  const folderId = input.folder_id ?? (await resolveFolderId(folderName));

  const { data, error } = await supabase
    .schema("workbench")
    .from("notes")
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
  async (noteId, { dispatch, getState }) => {
    // Autogenerated notes are client-only (no DB row yet) — a DB delete would
    // match 0 rows and read as a permission failure. Remove locally.
    const state = getState() as RootState;
    const record = state.notes.notes[noteId] as NoteRecord | undefined;
    if (record?._isAutogenerated) {
      dispatch(removeNote(noteId));
      dispatchCustomEvent("notes:deleted", { noteId });
      return;
    }

    // Deleting is an OWNER/ADMIN action. RLS can't enforce this for
    // editor-level sharees — soft delete is an UPDATE and std_update grants
    // editors — so their delete would "succeed", vanishing the note into the
    // OWNER's trash with no notification. Gate here: every delete surface
    // (tab menu, context menus, mobile dock) dispatches this thunk.
    if (
      record?._sharedWithMe &&
      record._sharedMeta?.permissionLevel !== "admin"
    ) {
      toastNoteWriteBlocked(noteId, NOTE_READONLY_DELETE_MESSAGE);
      throw new Error(NOTE_READONLY_DELETE_MESSAGE);
    }

    const { data, error } = await supabase
      .schema("workbench")
      .from("notes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", noteId)
      .select("id");

    if (error) {
      toastNoteWriteBlocked(noteId, noteSaveErrorMessage(error));
      throw error;
    }
    // RLS filters a VIEWER sharee's delete to 0 rows with NO error — the
    // note would vanish from the UI while surviving in the DB. Detect and
    // scream. (Editor sharees pass RLS; they're blocked by the gate above.)
    if (!data || data.length === 0) {
      toastNoteWriteBlocked(noteId, NOTE_READONLY_DELETE_MESSAGE);
      throw new Error(NOTE_READONLY_DELETE_MESSAGE);
    }

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
      .schema("workbench")
      .from("notes")
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
        // Keep the copy in the original's org — EXCEPT when duplicating a
        // note someone shared with us: the sharee may not be a member of the
        // owner's org and std_insert would 42501. Home their copy in their
        // own active/personal org instead.
        organization_id: await ensureOrgId(
          record._sharedWithMe ? undefined : record.organization_id,
        ),
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
        !record._sharedWithMe &&
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
    const folderId = await resolveFolderId(folder);

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
      .schema("workbench")
      .from("notes")
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

/**
 * Permanently delete one soft-deleted note and drop it from the store.
 */
export const permanentlyDeleteNoteThunk = createAsyncThunk<void, string>(
  "notes/permanentlyDeleteNote",
  async (noteId, { dispatch }) => {
    const { permanentlyDeleteNote } = await import("../service/notesService");
    await permanentlyDeleteNote(noteId);
    dispatch(removeNote(noteId));
  },
);

/**
 * Empty the trash — hard-delete every soft-deleted note for the current user.
 */
export const emptyTrashThunk = createAsyncThunk<number, void>(
  "notes/emptyTrash",
  async (_, { dispatch, getState }) => {
    const { emptyTrash } = await import("../service/notesService");
    const count = await emptyTrash();
    if (count === 0) return 0;
    const notes = (getState() as RootState).notes?.notes ?? {};
    for (const note of Object.values(notes)) {
      if (note.deleted_at) dispatch(removeNote(note.id));
    }
    return count;
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
      .schema("workbench")
      .from("notes")
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
// 11b. fetchSharedNotesList
// ---------------------------------------------------------------------------

let sharedListFetchSeq = 0;

/**
 * Fetch notes shared WITH the current user (direct + org grants) via the
 * `get_notes_shared_with_me` RPC. Upserts them into the store flagged
 * `_sharedWithMe` (with the effective permission level + owner email) so the
 * sidebar can render a "Shared with me" section while the owner-only list
 * selectors keep excluding them from folders.
 *
 * Stale overlapping fetches are ignored via a monotonic seq so an older
 * response cannot prune notes that a newer fetch still includes. Dirty
 * shared notes are never removed on revoke (user keeps their local edits
 * until they discard / conflict-resolve).
 */
export const fetchSharedNotesList = createAsyncThunk<void, void>(
  "notes/fetchSharedNotesList",
  async (_, { dispatch, getState }) => {
    const seq = ++sharedListFetchSeq;
    const { data, error } = await supabase.rpc("get_notes_shared_with_me");
    if (error) throw error;
    // A newer fetch started while we were in flight — drop this result.
    if (seq !== sharedListFetchSeq) return;

    const incomingIds = new Set((data ?? []).map((row) => row.id as string));

    // Single batched dispatch — see fetchNotesList for why a per-note loop
    // is forbidden here.
    dispatch(
      upsertNotesFromServer({
        upserts: (data ?? []).map((row) => ({
          note: {
            id: row.id,
            label: row.label ?? "Untitled",
            folder_name: row.folder_name,
            tags: row.tags,
            created_at: row.created_at,
            updated_at: row.updated_at,
            organization_id: row.organization_id,
            project_id: row.project_id,
            task_id: row.task_id,
            visibility: (row.visibility ?? "private") as Note["visibility"],
            version: row.version,
            created_by: row.created_by,
          },
          fetchStatus: "list" as const,
          sharedMeta: {
            permissionLevel: (row.permission_level ??
              "viewer") as SharedNotePermissionLevel,
            ownerEmail: row.owner_email,
          },
        })),
      }),
    );

    if (seq !== sharedListFetchSeq) return;

    // Revoked shares must leave the store — otherwise the sharee keeps a
    // stale editable cache after access is removed. Skip dirty notes so
    // in-progress edits aren't silently discarded by a focus refetch.
    const state = getState() as RootState;
    for (const note of Object.values(state.notes.notes)) {
      if (note._sharedWithMe && !incomingIds.has(note.id) && !note._dirty) {
        dispatch(removeNote(note.id));
      }
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
