/**
 * Version Management Service
 *
 * Handles note versioning operations with Supabase
 */

import { supabase } from "@/utils/supabase/client";
import type { NoteVersion } from "../types";

/**
 * Fetch version history for a note
 */
export async function fetchVersions(noteId: string): Promise<NoteVersion[]> {
  const { data, error } = await supabase
    .from("note_versions")
    .select("*")
    .eq("note_id", noteId)
    .order("version_number", { ascending: false });

  if (error) {
    console.error("Error fetching versions:", error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch a specific version
 */
export async function fetchVersion(
  versionId: string,
): Promise<NoteVersion | null> {
  const { data, error } = await supabase
    .from("note_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  if (error) {
    console.error("Error fetching version:", error);
    return null;
  }

  return data;
}

/**
 * Restore a note to a specific version
 * Uses the database function for atomic restore
 */
export async function restoreVersion(
  noteId: string,
  versionNumber: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("restore_note_version", {
    p_note_id: noteId,
    p_version_number: versionNumber,
  });

  if (error) {
    console.error("Error restoring version:", error);
    throw error;
  }

  return !!(data as unknown as boolean);
}

/**
 * Delete a specific version
 */
export async function deleteVersion(versionId: string): Promise<void> {
  const { error } = await supabase
    .from("note_versions")
    .delete()
    .eq("id", versionId);

  if (error) {
    console.error("Error deleting version:", error);
    throw error;
  }
}

/**
 * Get latest version number for a note
 */
export async function getLatestVersionNumber(noteId: string): Promise<number> {
  const { data, error } = await supabase
    .from("note_versions")
    .select("version_number")
    .eq("note_id", noteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return 0;
  }

  return data.version_number;
}

/**
 * Create a manual version (outside of trigger)
 * Useful for marking specific milestones
 */
export async function createManualVersion(
  noteId: string,
  content: string,
  label: string,
  options: {
    change_source?: "user" | "ai" | "system";
    change_type?: string;
    diff_metadata?: Record<string, any>;
  } = {},
): Promise<NoteVersion> {
  // Get the note's owner
  const { data: note, error: noteError } = await supabase
    .schema("workbench").from("notes")
    .select("created_by")
    .eq("id", noteId)
    .single();

  if (noteError || !note) {
    throw new Error("Note not found");
  }

  // Get next version number
  const nextVersion = (await getLatestVersionNumber(noteId)) + 1;

  // Insert version
  const { data, error } = await supabase
    .from("note_versions")
    .insert({
      note_id: noteId,
      user_id: note.created_by,
      content,
      label,
      version_number: nextVersion,
      change_source: options.change_source || "user",
      change_type: options.change_type ?? null,
      diff_metadata: options.diff_metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating version:", error);
    throw error;
  }

  return data;
}

/**
 * Compare two versions and return diff info
 */
export async function compareVersions(
  versionId1: string,
  versionId2: string,
): Promise<{
  version1: NoteVersion;
  version2: NoteVersion;
  contentDiff: {
    added: number;
    removed: number;
    modified: number;
  };
}> {
  const [version1, version2] = await Promise.all([
    fetchVersion(versionId1),
    fetchVersion(versionId2),
  ]);

  if (!version1 || !version2) {
    throw new Error("One or both versions not found");
  }

  // Simple diff calculation (line-based)
  const lines1 = version1.content.split("\n");
  const lines2 = version2.content.split("\n");

  const added = lines2.length - lines1.length;
  const removed = added < 0 ? Math.abs(added) : 0;
  const modified = Math.min(lines1.length, lines2.length);

  return {
    version1,
    version2,
    contentDiff: {
      added: added > 0 ? added : 0,
      removed,
      modified,
    },
  };
}
