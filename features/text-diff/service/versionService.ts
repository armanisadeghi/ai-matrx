/**
 * Version Management Service
 *
 * Handles note versioning operations with Supabase
 */

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { isJsonObject, type JsonObject } from "@/types/json";
import type { NoteVersion } from "../types";

type RpcVersionRow = {
  id: string;
  version_number: number;
  content: string;
  label: string;
  change_source: string;
  change_type: string;
  diff_metadata: Json;
  created_at: string;
  note_id?: string;
};

function diffMetadataFromJson(value: Json): JsonObject {
  return isJsonObject(value) ? value : {};
}

function mapVersionRow(row: RpcVersionRow, noteId: string): NoteVersion {
  return {
    id: row.id,
    note_id: row.note_id ?? noteId,
    version_number: row.version_number,
    content: row.content,
    label: row.label,
    change_source: row.change_source,
    change_type: row.change_type,
    diff_metadata: diffMetadataFromJson(row.diff_metadata),
    created_at: row.created_at,
  };
}

/**
 * Fetch version history for a note
 */
export async function fetchVersions(noteId: string): Promise<NoteVersion[]> {
  const { data, error } = await supabase.rpc("get_note_versions", {
    p_note_id: noteId,
  });

  if (error) {
    console.error("Error fetching versions:", error);
    throw error;
  }

  // The RPC does not return `note_id`; stamp it back on for the local type.
  return (data ?? []).map((row) => mapVersionRow(row, noteId));
}

/**
 * Fetch a specific version
 */
export async function fetchVersion(
  versionId: string,
): Promise<NoteVersion | null> {
  const { data, error } = await supabase.rpc("get_note_version", {
    p_id: versionId,
  });

  if (error) {
    console.error("Error fetching version:", error);
    return null;
  }

  // RPC returns a single-row array.
  const row = data?.[0];
  return row ? mapVersionRow(row, row.note_id) : null;
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

  return !!data;
}

/**
 * Delete a specific version
 */
export async function deleteVersion(versionId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_note_version", {
    p_id: versionId,
  });

  if (error) {
    console.error("Error deleting version:", error);
    throw error;
  }
}

/**
 * Get latest version number for a note
 */
export async function getLatestVersionNumber(noteId: string): Promise<number> {
  const versions = await fetchVersions(noteId);
  // fetchVersions returns rows ordered by version_number DESC.
  return versions[0]?.version_number ?? 0;
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
    diff_metadata?: JsonObject;
  } = {},
): Promise<NoteVersion> {
  // The RPC owns ownership/version-number/timestamps; it returns the new id.
  const { data: newId, error } = await supabase.rpc(
    "create_note_version_manual",
    {
      p_note_id: noteId,
      p_content: content,
      p_label: label,
      p_change_source: options.change_source ?? "user",
      p_change_type: options.change_type,
    },
  );

  if (error) {
    console.error("Error creating version:", error);
    throw error;
  }

  // Read the created row back so callers receive a full NoteVersion.
  const created = await fetchVersion(newId as string);
  if (!created) {
    throw new Error("Created version could not be loaded");
  }

  return created;
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
