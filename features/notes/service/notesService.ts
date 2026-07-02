// features/notes/service/notesService.ts

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { resolvePersonalOrgId, ensureOrgId } from "@/lib/organizations/personalOrg";
import type {
  Note,
  CreateNoteInput,
  UpdateNoteInput,
  NoteListItem,
} from "../types";
import { generateLabelFromContent } from "../hooks/useAutoLabel";
import { findEmptyNewNote } from "../utils/noteUtils";

/**
 * Fetch all notes owned by the current user (excluding deleted).
 * Explicitly scoped to created_by — RLS now also grants access to shared notes
 * via hierarchy, so without this filter "my notes" would include all accessible ones.
 */
export async function fetchNotes(): Promise<Note[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .select("*")
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching notes:", error);
    throw error;
  }

  return data ?? [];
}

/**
 * Fetch lightweight note list items (no content) for pickers and sidebars.
 */
export async function fetchNoteListItems(): Promise<NoteListItem[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .select(
      "id, created_by, label, folder_name, folder_id, tags, updated_at, position, organization_id, project_id, task_id, visibility, version",
    )
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching note list items:", error);
    throw error;
  }

  return (data ?? []) as NoteListItem[];
}

/**
 * Fetch a single note by ID
 */
export async function fetchNoteById(id: string): Promise<Note | null> {
  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("Error fetching note:", error);
    return null;
  }

  return data;
}

/**
 * Assign the caller's personal organization to all of their notes that have no
 * organization ("homeless" notes). Resolves the personal org via the canonical
 * session-cached `resolvePersonalOrgId`, so it works regardless of Redux
 * hydration and without a per-call RPC.
 *
 * Returns the personal org id and the ids of the notes that were re-homed.
 */
export async function assignHomelessNotesToPersonalOrg(): Promise<{
  organizationId: string;
  noteIds: string[];
}> {
  const userId = requireUserId();

  const organizationId = await resolvePersonalOrgId();

  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .update({ organization_id: organizationId })
    .eq("created_by", userId)
    .is("organization_id", null)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;

  return {
    organizationId,
    noteIds: (data ?? []).map((r) => r.id as string),
  };
}

/**
 * Create a new note
 * Automatically generates label from content if label is missing or is "New Note"
 * IMPORTANT: Checks for existing empty notes and reuses them to prevent duplicates
 */
export async function createNote(input: CreateNoteInput = {}): Promise<Note> {
  const userId = requireUserId();

  const content = input.content || "";
  const targetFolder = input.folder_name || "Draft";

  // CRITICAL: If creating an empty note (no content or whitespace only), check for existing empty notes
  const isCreatingEmptyNote = !content || content.trim() === "";

  if (isCreatingEmptyNote) {
    // Fetch all user's notes to check for existing empty ones
    const existingNotes = await fetchNotes();
    const existingEmptyNote = findEmptyNewNote(existingNotes);

    if (existingEmptyNote) {
      console.log(
        "Reusing existing empty note instead of creating duplicate:",
        existingEmptyNote.id,
      );

      // If it's in a different folder, move it to the target folder
      if (existingEmptyNote.folder_name !== targetFolder) {
        return updateNote(existingEmptyNote.id, { folder_name: targetFolder });
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

  // Resolve a home org so notes are never created homeless. If the caller
  // didn't pass one, ride the user's ACTIVE org (header selection, else their
  // personal org) via the canonical resolver — every write follows the org the
  // user is currently working in.
  let organizationId = input.organization_id ?? null;
  if (!organizationId) {
    try {
      organizationId = await ensureOrgId(undefined);
    } catch (orgError) {
      // Don't block note creation on org resolution — log loudly and fall back
      // to homeless (the sidebar's "add to my organization" action recovers it).
      console.error("Could not resolve organization for note:", orgError);
    }
  }

  if (!organizationId) {
    throw new Error(
      "Cannot create note: no organization could be resolved for the current user.",
    );
  }

  // No existing empty note found, create a new one
  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .insert({
      // Canonical RLS std_insert requires created_by = auth.uid(). The
      // _stamp_actor trigger fills this too, but set it explicitly so the
      // INSERT passes with_check even if the trigger order ever changes.
      created_by: userId,
      label: finalLabel,
      content: content,
      folder_name: targetFolder,
      tags: input.tags || [],
      metadata: input.metadata || {},
      position: input.position || 0,
      // Private by default — the `notes.visibility` enum DB default is
      // 'internal' (org-visible), so set it explicitly on create.
      visibility: input.visibility ?? "private",
      // Associations were silently dropped before — a note created with a
      // task_id / org / project now actually persists those links.
      task_id: input.task_id ?? null,
      organization_id: organizationId,
      project_id: input.project_id ?? null,
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
  return data;
}

/**
 * Update an existing note.
 * Simple UPDATE by ID — no optimistic locking.
 * The DB has an auto-update trigger on updated_at, so timestamp-based locking
 * (WHERE updated_at = ?) always fails. Concurrent-session conflicts are handled
 * via the Supabase Realtime subscription in NotesContext instead.
 */
export async function updateNote(
  id: string,
  updates: UpdateNoteInput,
): Promise<Note> {
  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating note:", error);
    throw error;
  }

  return data;
}

/**
 * Soft delete a note
 */
export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase
    .schema("workbench").from("notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Error deleting note:", error);
    throw error;
  }
}

/**
 * Permanently delete a note
 */
export async function permanentlyDeleteNote(id: string): Promise<void> {
  const { error } = await supabase.schema("workbench").from("notes").delete().eq("id", id);

  if (error) {
    console.error("Error permanently deleting note:", error);
    throw error;
  }
}

/**
 * Copy/duplicate a note
 * Smart labeling: If original was "New Note", auto-generate from content
 */
export async function copyNote(id: string): Promise<Note> {
  // First fetch the original note
  const { data: original, error: fetchError } = await supabase
    .schema("workbench").from("notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !original) {
    console.error("Error fetching note to copy:", fetchError);
    throw fetchError || new Error("Note not found");
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
    tags: original.tags || [],
    metadata: original.metadata || {},
  };

  return await createNote(copy);
}

/**
 * Generate a shareable link for a note
 * Returns a URL that users can visit to accept the share
 */
export function generateShareLink(noteId: string): string {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  return `${baseUrl}/notes/share/${noteId}`;
}

/**
 * Accept a shared note. Canonical sharing lives in the `permissions` table
 * (granted at share time), so accepting is simply resolving the note the link
 * points to — RLS grants the recipient read access via the permission grant.
 * The legacy `shared_with` JSONB column has been dropped.
 */
export async function acceptSharedNote(
  noteId: string,
  _userId: string,
): Promise<Note> {
  const { data: note, error } = await supabase
    .schema("workbench").from("notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();

  if (error || !note) {
    console.error("Error accepting shared note:", error);
    throw error || new Error("Note not found");
  }

  return note;
}

/**
 * Fetch notes explicitly shared with the current user via the permissions table.
 * Does not include notes accessible via project/workspace/org hierarchy —
 * those appear in the normal fetchNotes() query via RLS.
 * The old shared_with JSONB column approach is superseded by the permissions system.
 */
export async function fetchSharedNotes(userId: string): Promise<Note[]> {
  const { data: grants, error: grantsError } = await supabase
    .schema("iam").from("permissions")
    .select("resource_id")
    .eq("resource_type", "notes")
    .eq("granted_to_user_id", userId);

  if (grantsError || !grants || grants.length === 0) return [];

  const noteIds = grants.map((g) => g.resource_id);

  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .select("*")
    .in("id", noteIds)
    .neq("created_by", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching shared notes:", error);
    return [];
  }

  return data ?? [];
}

/**
 * Get all unique folder names for the current user
 */
export async function fetchFolderNames(): Promise<string[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .select("folder_name")
    .eq("created_by", userId)
    .is("deleted_at", null);

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
 * Get all unique tags for the current user
 */
export async function fetchTags(): Promise<string[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("workbench").from("notes")
    .select("tags")
    .eq("created_by", userId)
    .is("deleted_at", null);

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
export async function createFolder(name: string): Promise<string> {
  const userId = requireUserId();

  // Check if folder already exists
  const { data: existing } = await supabase
    .schema("workbench").from("note_folders")
    .select("id")
    .eq("created_by", userId)
    .eq("name", name)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .schema("workbench").from("note_folders")
    .insert({
      created_by: userId,
      name,
      path: name,
      position: 0,
      // Root entity (no org-inherit trigger) — org is NOT NULL; ride active org.
      organization_id: await ensureOrgId(undefined),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
  if (!data) {
    throw new Error("Folder insert returned no row");
  }

  return data.id;
}

/**
 * Rename a folder by updating both the note_folders record
 * AND the denormalized folder_name on all notes in that folder.
 */
export async function renameFolder(
  oldName: string,
  newName: string,
): Promise<void> {
  const userId = requireUserId();

  // Update the note_folders record
  await supabase
    .schema("workbench").from("note_folders")
    .update({ name: newName, path: newName })
    .eq("created_by", userId)
    .eq("name", oldName)
    .is("deleted_at", null);

  // Update the denormalized folder_name on all notes
  const { error } = await supabase
    .schema("workbench").from("notes")
    .update({ folder_name: newName })
    .eq("created_by", userId)
    .eq("folder_name", oldName)
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
export async function deleteFolderNotes(folderName: string): Promise<number> {
  const userId = requireUserId();

  const { data: notesToDelete } = await supabase
    .schema("workbench").from("notes")
    .select("id")
    .eq("created_by", userId)
    .eq("folder_name", folderName)
    .is("deleted_at", null);

  const count = notesToDelete?.length || 0;

  // Soft-delete the notes
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .schema("workbench").from("notes")
    .update({ deleted_at: deletedAt })
    .eq("created_by", userId)
    .eq("folder_name", folderName)
    .is("deleted_at", null);

  if (error) {
    console.error("Error deleting folder notes:", error);
    throw error;
  }

  // Soft-delete the folder record
  await supabase
    .schema("workbench").from("note_folders")
    .update({ deleted_at: deletedAt })
    .eq("created_by", userId)
    .eq("name", folderName)
    .is("deleted_at", null);

  return count;
}

/**
 * Ensure a folder exists in the note_folders table.
 * Creates the record if it doesn't exist.
 * Call this before UIs (e.g. Quick Save) that need the folder to appear in pickers.
 */
export async function ensureFolderMaterialized(
  folderName: string,
): Promise<void> {
  const trimmed = folderName.trim();
  if (!trimmed) return;

  // createFolder already handles "exists? return id : insert" logic
  await createFolder(trimmed);
}
