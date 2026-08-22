/**
 * Trash — the platform-wide list of the current user's soft-deleted artifacts.
 *
 * There is deliberately no per-feature trash. The two RPCs iterate
 * `platform.entity_types.user_artifact_kind` (aidream migration 0459), so a newly
 * registered user-facing entity shows up here with no change to this file.
 *
 * Restore goes through the generic `entity_undelete(token, id)` from db-rules §8.
 * There is no purge: permanent destruction belongs to the retention engine
 * (common-docs/projects/data-lifecycle-platform), not to a button.
 */
import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

export type TrashItem =
  Database["public"]["Functions"]["trash_list"]["Returns"][number];
export type TrashCount =
  Database["public"]["Functions"]["trash_counts"]["Returns"][number];

/**
 * NOTE: `limit`/`offset` apply PER KIND, not to the merged result — that is the
 * shape of the underlying loop. Page one kind at a time by passing a single
 * `kinds` entry; the unfiltered call is a recent-items overview, not a full list.
 */
export async function listTrash(opts?: {
  kinds?: string[];
  limit?: number;
  offset?: number;
}): Promise<TrashItem[]> {
  const { data, error } = await supabase.rpc("trash_list", {
    p_kinds: opts?.kinds,
    p_limit: opts?.limit ?? 200,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load trash: ${error.message}`);
  return data ?? [];
}

/** True per-kind totals — counted against the tables, not against a page. */
export async function getTrashCounts(): Promise<TrashCount[]> {
  const { data, error } = await supabase.rpc("trash_counts");
  if (error) throw new Error(`Failed to load trash counts: ${error.message}`);
  return data ?? [];
}

export async function restoreFromTrash(
  entityToken: string,
  id: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("entity_undelete", {
    p_token: entityToken,
    p_id: id,
  });
  if (error) throw new Error(`Failed to restore: ${error.message}`);
  if (data === false) {
    throw new Error("Restore was refused — you may no longer have edit access.");
  }
}
