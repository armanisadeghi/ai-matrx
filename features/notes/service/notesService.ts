// features/notes/service/notesService.ts

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { operationFailed } from "@/utils/errors";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { requireOrganizationContext } from "@/lib/api/organization-context";
import type {
  Note,
  NoteRow,
  NoteUpdate,
  CreateNoteInput,
  UpdateNoteInput,
  NoteListItem,
  FolderReference,
  NoteContextLinks,
} from "../types";
import { generateLabelFromContent } from "../hooks/useAutoLabel";
import { findEmptyNewNote } from "../utils/noteUtils";
import {
  hydrateNoteContextLinks,
  syncNoteContextLinks,
} from "./noteContextAssociations";
import { scopeToOwner, type ListScopeWord } from "@/lib/list-scope";

/**
 * Fetch the notes this screen should open on (excluding deleted).
 *
 * WHERE THIS LANDS IS A REGISTRY WORD, NOT A LITERAL (DD-137c, VISIBILITY-BY-CLASS §3.3). The
 * `note` token is registered `default_list_scope = 'organization'`, so the list opens on the
 * organization's notes — the viewer's own included — and a caller that genuinely means "only mine"
 * passes `"mine"` and gets exactly that. The old comment here said the filter existed so that "my
 * notes" would not include shared ones; that is still available, it is just no longer assumed for
 * every caller. RLS remains the ceiling either way: this only decides where the screen starts.
 */
export async function fetchNotes(scope?: ListScopeWord): Promise<Note[]> {
  const userId = requireUserId();
  const ownerOnly = await scopeToOwner("note", scope);
  let query = supabase
    .schema("workbench")
    .from("notes")
    .select("*")
    .is("deleted_at", null);
  if (ownerOnly) query = query.eq("created_by", userId);
  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching notes:", error);
    throw error;
  }

  return hydrateNoteContextLinks(data ?? []);
}

/**
 * Fetch lightweight note list items (no content) for pickers and sidebars.
 */
export async function fetchNoteListItems(scope?: ListScopeWord): Promise<NoteListItem[]> {
  const userId = requireUserId();
  const ownerOnly = await scopeToOwner("note", scope);
  let query = supabase
    .schema("workbench")
    .from("notes")
    .select(
      "id, created_by, label, folder_name, folder_id, tags, updated_at, position, organization_id, visibility, version",
    )
    .is("deleted_at", null);
  if (ownerOnly) query = query.eq("created_by", userId);
  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching note list items:", error);
    throw error;
  }

  return hydrateNoteContextLinks(data ?? []) as Promise<NoteListItem[]>;
}

/**
 * Fetch a batch of notes by id (any note the caller can read — attached
 * observation notes may belong to teammates, so no created_by filter).
 * Deleted notes are excluded; missing/inaccessible ids are simply absent.
 */
export async function fetchNotesByIds(ids: string[]): Promise<Note[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .schema("workbench")
    .from("notes")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching notes by ids:", error);
    throw error;
  }

  return hydrateNoteContextLinks(data ?? []);
}

/**
 * Fetch a single note by ID
 */
export async function fetchNoteById(id: string): Promise<Note | null> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("notes")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("Error fetching note:", error);
    return null;
  }

  if (!data) return null;
  const [note] = await hydrateNoteContextLinks([data]);
  return note;
}

/**
 * Create a new note
 * Automatically generates label from content if label is missing or is "New Note"
 * IMPORTANT: Checks for existing empty notes and reuses them to prevent duplicates
 */
export function emptyNoteReuseUpdates(
  existingNote: Note,
  input: CreateNoteInput,
  targetFolder: { id: string; name: string },
): UpdateNoteInput {
  const updates: UpdateNoteInput = {};
  const requestedLabel = input.label?.trim();
  if (
    requestedLabel &&
    requestedLabel.toLowerCase() !== "new note" &&
    existingNote.label !== requestedLabel
  ) {
    updates.label = requestedLabel;
  }
  if (
    existingNote.folder_id !== targetFolder.id ||
    existingNote.folder_name !== targetFolder.name
  ) {
    updates.folder_id = targetFolder.id;
  }
  if (input.metadata !== undefined) updates.metadata = input.metadata;
  if (input.position !== undefined) updates.position = input.position;
  if (input.visibility !== undefined) updates.visibility = input.visibility;
  if (input.project_id !== undefined) updates.project_id = input.project_id;
  if (input.task_id !== undefined) updates.task_id = input.task_id;
  return updates;
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  // This must be the first tenant operation: even an empty-note reuse is a
  // cross-organization read unless the captured destination is admitted first.
  const organizationId = requireOrganizationContext(input.organization_id);
  const userId = requireUserId();

  const content = input.content || "";
  const requestedFolderName = input.folder_name?.trim() || "Draft";
  let targetFolder: { id: string; name: string };
  if (input.folder_id) {
    const { data: folder, error: folderError } = await supabase
      .schema("workbench")
      .from("note_folders")
      .select("id, name")
      .eq("id", input.folder_id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (folderError || !folder) {
      throw folderError ?? new Error("The selected folder is unavailable in this organization. Choose another folder and try again.");
    }
    targetFolder = folder;
  } else {
    targetFolder = {
      id: await createFolder(requestedFolderName, organizationId),
      name: requestedFolderName,
    };
  }

  // CRITICAL: If creating an empty note (no content or whitespace only), check for existing empty notes
  const isCreatingEmptyNote = !content || content.trim() === "";

  if (isCreatingEmptyNote) {
    const { data: existingRows, error: reuseError } = await supabase
      .schema("workbench")
      .from("notes")
      .select("*")
      .eq("created_by", userId)
      .eq("organization_id", organizationId)
      .eq("folder_id", targetFolder.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (reuseError) throw reuseError;
    const existingNotes = await hydrateNoteContextLinks(existingRows ?? []);
    const existingEmptyNote = findEmptyNewNote(existingNotes);

    if (existingEmptyNote) {
      console.log(
        "Reusing existing empty note instead of creating duplicate:",
        existingEmptyNote.id,
      );

      // Reuse must preserve the caller's explicit name. Returning the generic
      // empty row unchanged made the war-room "+ New" dialog ignore its input.
      const reuseUpdates = emptyNoteReuseUpdates(existingEmptyNote, input, targetFolder);
      if (Object.keys(reuseUpdates).length > 0) {
        return updateNote(existingEmptyNote.id, reuseUpdates);
      }

      // Already in the right folder, just return it
      return existingEmptyNote;
    }
  }

  // Auto-generate label from content if needed
  let finalLabel = input.label || "New Note";

  // Check if we should auto-generate the label
  const shouldAutoGenerate =
    !finalLabel ||
    finalLabel.trim() === "" ||
    finalLabel.toLowerCase() === "new note";

  if (shouldAutoGenerate && content.trim()) {
    const generatedLabel = generateLabelFromContent(content);
    if (generatedLabel) {
      finalLabel = generatedLabel;
    }
  }

  // No existing empty note found, create a new one
  const { data, error } = await supabase
    .schema("workbench")
    .from("notes")
    .insert({
      // Canonical RLS std_insert requires created_by = auth.uid(). The
      // _stamp_actor trigger fills this too, but set it explicitly so the
      // INSERT passes with_check even if the trigger order ever changes.
      created_by: userId,
      label: finalLabel,
      content: content,
      folder_name: targetFolder.name,
      folder_id: targetFolder.id,
      tags: input.tags || [],
      metadata: input.metadata || {},
      position: input.position || 0,
      // Private by default — the `notes.visibility` enum DB default is
      // 'internal' (org-visible), so set it explicitly on create.
      visibility: input.visibility ?? "personal",
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating note:", error);
    throw error;
  }

  console.log(
    "Created new note:",
    data.id,
    "Label:",
    finalLabel,
    "Content length:",
    content.length,
  );
  await syncNoteContextLinks({
    noteId: data.id,
    organizationId,
    projectId: input.project_id,
    taskId: input.task_id,
  });
  const [note] = await hydrateNoteContextLinks([data]);
  return note;
}

/**
 * Update an existing note.
 *
 * Optional `expectedUpdatedAt` enables atomic optimistic locking
 * (`.eq("updated_at", expected)`). The BEFORE UPDATE `_touch_row` trigger
 * only mutates NEW — the WHERE still matches the OLD row. Prefer the Redux
 * autosave / `saveNote` path for the live `/notes` UI; this helper remains
 * for legacy surfaces (NotesLayout, useAutoSave, mobile dock).
 */
export async function updateNote(
  id: string,
  updates: UpdateNoteInput,
  options?: { expectedUpdatedAt?: string | null },
): Promise<Note> {
  // Existing-resource mutations bind to the resource's organization, never the
  // mutable organization picker. Read it before resolving a requested folder.
  const { data: existing, error: existingError } = await supabase
    .schema("workbench")
    .from("notes")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw existingError ?? operationFailed("save this note — it may already be gone");
  const organizationId = requireOrganizationContext(existing.organization_id);
  if ((updates as { organization_id?: string }).organization_id !== undefined && (updates as { organization_id?: string }).organization_id !== organizationId) {
    throw new Error("Moving a note to another organization is not available yet. Keep this note in its current organization.");
  }
  if (updates.folder_name !== undefined && updates.folder_id === undefined) {
    throw new Error("A persisted note can only move to an admitted folder ID. Create a new folder separately before moving this note.");
  }
  const normalizedUpdates: NoteUpdate & Partial<NoteContextLinks> = { ...updates };
  if (updates.folder_id !== undefined && updates.folder_id !== null) {
    const { data: folder, error: folderError } = await supabase
      .schema("workbench")
      .from("note_folders")
      .select("id, name")
      .eq("id", updates.folder_id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (folderError || !folder) {
      throw folderError ?? new Error("The selected folder is unavailable in this note's organization.");
    }
    normalizedUpdates.folder_id = folder.id;
    normalizedUpdates.folder_name = folder.name;
  } else if (updates.folder_id === null) {
    normalizedUpdates.folder_id = null;
    normalizedUpdates.folder_name = null;
  }

  const {
    project_id: projectId,
    task_id: taskId,
    ...databaseUpdates
  } = normalizedUpdates;

  let data: NoteRow | null = null;
  let error: { message: string } | null = null;
  if (Object.keys(databaseUpdates).length > 0) {
    let query = supabase
      .schema("workbench")
      .from("notes")
      .update(databaseUpdates)
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (options?.expectedUpdatedAt) {
      query = query.eq("updated_at", options.expectedUpdatedAt);
    }

    const result = await query.select().maybeSingle();
    data = result.data;
    error = result.error;
  } else {
    const result = await supabase
      .schema("workbench")
      .from("notes")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error("Error updating note:", error);
    throw error;
  }

  if (!data) {
    if (options?.expectedUpdatedAt) {
      const { data: stillThere } = await supabase
        .schema("workbench")
        .from("notes")
        .select("id")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (stillThere) {
        throw new Error(
          "Conflict: note was modified on another device or tab. Please refresh.",
        );
      }
    }
    throw operationFailed(
      "save this note — nothing was changed. It may need editor access you don't have, or the note may already be gone",
    );
  }

  await syncNoteContextLinks({
    noteId: id,
    organizationId,
    projectId,
    taskId,
  });
  const [note] = await hydrateNoteContextLinks([data]);
  return note;
}

/**
 * Soft delete a note
 */
export async function deleteNote(id: string): Promise<void> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Error deleting note:", error);
    throw error;
  }
  // RLS silently filters a non-admin sharee's delete to 0 rows — surface it.
  if (!data || data.length === 0) {
    throw operationFailed(
      "delete this note — nothing was changed. It may need owner access you don't have, or the note may already be gone",
    );
  }
}

/**
 * Permanently delete a note
 */
export async function permanentlyDeleteNote(id: string): Promise<void> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("notes")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Error permanently deleting note:", error);
    throw error;
  }
  if (!data || data.length === 0) {
    throw operationFailed(
      "permanently delete this note — nothing was changed. It may need owner access you don't have, or the note may already be gone",
    );
  }
}

/**
 * Permanently delete every soft-deleted note owned by the current user.
 * Returns the number of rows removed.
 */
export async function emptyTrash(): Promise<number> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("workbench")
    .from("notes")
    .delete()
    .eq("created_by", userId)
    .not("deleted_at", "is", null)
    .select("id");

  if (error) {
    console.error("Error emptying trash:", error);
    throw error;
  }
  return data?.length ?? 0;
}

/**
 * Copy/duplicate a note
 * Smart labeling: If original was "New Note", auto-generate from content
 */
export async function copyNote(id: string): Promise<Note> {
  // First fetch the original note
  const { data: original, error: fetchError } = await supabase
    .schema("workbench")
    .from("notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching note to copy:", fetchError);
    throw operationFailed("copy this note", fetchError);
  }
  if (!original) {
    throw recordUnavailable({
      entity: "note",
      reason: "unknown",
      recordId: id,
      token: "note",
      relation: "workbench.notes",
    });
  }

  // Smart label handling
  let copyLabel: string;
  if (original.label.toLowerCase() === "new note") {
    // If original was "New Note", let auto-labeling handle it
    copyLabel = "New Note";
  } else {
    // Otherwise, append (Copy) to the original label
    copyLabel = `${original.label} (Copy)`;
  }

  // Create a copy with modified label
  const copy: CreateNoteInput = {
    label: copyLabel,
    content: original.content,
    folder_name: original.folder_name,
    folder_id: original.folder_id,
    tags: original.tags || [],
    metadata: original.metadata || {},
    organization_id: requireOrganizationContext(original.organization_id),
  };

  if (!copy.folder_id) {
    throw new Error("This note has no valid persisted folder. Choose a destination folder before copying it.");
  }

  return await createNote(copy);
}

/**
 * Every folder name on the notes this list opens on — the same scope as the list itself, because a
 * filter offering folders the list will never show is a lie the user discovers by clicking.
 */
export async function fetchFolderNames(scope?: ListScopeWord): Promise<string[]> {
  const userId = requireUserId();
  const ownerOnly = await scopeToOwner("note", scope);
  let folderQuery = supabase
    .schema("workbench")
    .from("notes")
    .select("folder_name")
    .is("deleted_at", null);
  if (ownerOnly) folderQuery = folderQuery.eq("created_by", userId);
  const { data, error } = await folderQuery;

  if (error) {
    console.error("Error fetching folder names:", error);
    return [];
  }

  const uniqueFolders = Array.from(
    new Set(
      data
        .map((n) => n.folder_name)
        .filter((name): name is string => name != null),
    ),
  );
  return uniqueFolders.sort();
}

/**
 * Every tag on the notes this list opens on — same scope as the list, same reason as the folders.
 */
export async function fetchTags(scope?: ListScopeWord): Promise<string[]> {
  const userId = requireUserId();
  const ownerOnly = await scopeToOwner("note", scope);
  let tagQuery = supabase
    .schema("workbench")
    .from("notes")
    .select("tags")
    .is("deleted_at", null);
  if (ownerOnly) tagQuery = tagQuery.eq("created_by", userId);
  const { data, error } = await tagQuery;

  if (error) {
    console.error("Error fetching tags:", error);
    return [];
  }

  const allTags = data.flatMap((n) => n.tags || []);
  const uniqueTags = Array.from(new Set(allTags));
  return uniqueTags.sort();
}

/**
 * Create a folder record in note_folders.
 * Returns the new folder ID.
 */
export async function createFolder(name: string, capturedOrganizationId: string): Promise<string> {
  const organizationId = requireOrganizationContext(capturedOrganizationId);
  const userId = requireUserId();

  // Atomic get-or-create on the (created_by, name) natural key, backed by the
  // FULL unique index `note_folders_created_by_name_unique`. ON CONFLICT DO
  // NOTHING (`ignoreDuplicates`) never emits a 23505/409: a concurrent create /
  // double-Quick-Save returns an EMPTY result instead of silently minting a
  // second folder (the old select-then-insert had no backing constraint).
  const { data: inserted, error: insertError } = await supabase
    .schema("workbench")
    .from("note_folders")
    .upsert(
      {
        created_by: userId,
        name,
        path: name,
        position: 0,
        organization_id: organizationId,
      },
      { onConflict: "created_by,name", ignoreDuplicates: true },
    )
    .select("id, deleted_at")
    .maybeSingle();

  if (insertError && insertError.code !== "23505") {
    console.error("Error creating folder:", insertError);
    throw insertError;
  }
  // A row came back → we created it.
  if (inserted?.id) return inserted.id;

  // No row → a LIVE folder with this (user, name) already exists (DO NOTHING).
  // Folder rows are hard-deleted (see deleteFolderNotes), so there is never a
  // soft-deleted row to revive — the conflicting row is always live and RLS-
  // visible. Return it.
  const { data: existing, error: selError } = await supabase
    .schema("workbench")
    .from("note_folders")
    .select("id")
    .eq("created_by", userId)
    .eq("name", name)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selError) {
    console.error("Error resolving existing folder:", selError);
    throw selError;
  }
  if (existing?.id) return existing.id;

  // The legacy unique key still overlaps organizations. Never return a folder
  // from another org while it exists; the owner must activate the composite key.
  const { data: conflicting } = await supabase
    .schema("workbench")
    .from("note_folders")
    .select("id, organization_id")
    .eq("created_by", userId)
    .eq("name", name)
    .is("deleted_at", null)
    .maybeSingle();
  if (conflicting && conflicting.organization_id !== organizationId) {
    throw new Error("notes_folder_cross_org_legacy_key: this folder name is reserved in another organization until the folder-key cutover is activated.");
  }

  if (insertError) throw insertError;

  // Vanishingly rare: the conflicting row was hard-deleted between the upsert
  // and this re-read (concurrent create + delete of the same name). Create fresh.
  const { data: recreated, error: recreateError } = await supabase
    .schema("workbench")
    .from("note_folders")
    .insert({
      created_by: userId,
      name,
      path: name,
      position: 0,
      organization_id: organizationId,
    })
    .select("id")
    .single();
  if (recreateError || !recreated) {
    console.error("Error creating folder:", recreateError);
    throw recreateError ?? new Error("Folder insert returned no row");
  }
  return recreated.id;
}

/**
 * Rename a folder by updating both the note_folders record
 * AND the denormalized folder_name on all notes in that folder.
 */
export async function renameFolder(
  folder: FolderReference,
  newName: string,
): Promise<void> {
  const organizationId = requireOrganizationContext(folder.organizationId);
  const userId = requireUserId();

  // Update the note_folders record
  await supabase
    .schema("workbench")
    .from("note_folders")
    .update({ name: newName, path: newName })
    .eq("created_by", userId)
    .eq("id", folder.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  // Update the denormalized folder_name on all notes
  const { error } = await supabase
    .schema("workbench")
    .from("notes")
    .update({ folder_name: newName })
    .eq("created_by", userId)
    .eq("folder_id", folder.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) {
    console.error("Error renaming folder:", error);
    throw error;
  }
}

/**
 * Bulk soft-delete all notes in a folder (current user only).
 * Also soft-deletes the note_folders record.
 */
export async function deleteFolderNotes(folder: FolderReference): Promise<number> {
  const organizationId = requireOrganizationContext(folder.organizationId);
  const userId = requireUserId();

  const { data: notesToDelete } = await supabase
    .schema("workbench")
    .from("notes")
    .select("id")
    .eq("created_by", userId)
    .eq("folder_id", folder.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const count = notesToDelete?.length || 0;

  // Soft-delete the notes
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .schema("workbench")
    .from("notes")
    .update({ deleted_at: deletedAt })
    .eq("created_by", userId)
    .eq("folder_id", folder.id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) {
    console.error("Error deleting folder notes:", error);
    throw error;
  }

  // HARD-delete the folder record (not soft-delete). The folder row is a
  // name-keyed picker-registry entry — notes reference their folder by the
  // `folder_name` STRING, not by id, and `ensureFolderMaterialized` recreates
  // it on demand. Soft-deleting it would leave a `deleted_at`-set row occupying
  // the (created_by, name) slot of the FULL unique index
  // `note_folders_created_by_name_unique` — invisible to the `authenticated`
  // client under RLS (`deleted_at IS NULL`), so a same-name recreate could
  // neither insert (conflict) nor see/revive it. Hard delete keeps the natural
  // key free for reuse. (The notes themselves stay soft-deleted / recoverable.)
  await supabase
    .schema("workbench")
    .from("note_folders")
    .delete()
    .eq("created_by", userId)
    .eq("id", folder.id)
    .eq("organization_id", organizationId);

  return count;
}

/**
 * Ensure a folder exists in the note_folders table.
 * Creates the record if it doesn't exist.
 * Call this before UIs (e.g. Quick Save) that need the folder to appear in pickers.
 */
export async function ensureFolderMaterialized(
  folderName: string,
  organizationId: string,
): Promise<void> {
  const trimmed = folderName.trim();
  if (!trimmed) return;

  // createFolder already handles "exists? return id : insert" logic
  await createFolder(trimmed, organizationId);
}
