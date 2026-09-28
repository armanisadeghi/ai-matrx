/**
 * features/rag/components/library/libraryTrash.ts — the Source trash's doors,
 * as plain functions over injected RPC calls (so the hub's Trash view and its
 * tests call the same code).
 *
 *   list     — `rag.fn_list_library_trash` (SECURITY DEFINER, owner-scoped).
 *   restore  — individually trashed: `fn_restore_library_document`; trashed
 *              with its file (`deleted_via='file_cascade'`): the file's
 *              `restore_file` (`restoreFileDirect`) brings the whole family
 *              back in one transaction.
 *
 * There is no purge door: delete means archive (2026-09-27). Erasure of
 * trashed rows is a retention policy, never a button.
 */

import type { TrashRow } from "@/features/rag/components/library/trashGroups";

export interface TrashDoors {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  restoreFile: (fileId: string) => Promise<unknown>;
}

export async function listTrash(doors: TrashDoors): Promise<TrashRow[]> {
  const { data, error } = await doors.rpc("fn_list_library_trash");
  if (error) throw new Error(`Your trash could not be read: ${error.message}`);
  return (data ?? []) as TrashRow[];
}

/** Restore one trashed Source (or its file family). Returns the sentence to show. */
export async function restoreTrashRow(row: TrashRow, doors: TrashDoors): Promise<string> {
  if (row.deleted_via === "file_cascade") {
    await doors.restoreFile(row.source_id);
    return `Restored "${row.file_name ?? row.name ?? "file"}" and its documents.`;
  }
  const { error } = await doors.rpc("fn_restore_library_document", { p_id: row.id });
  // Say the server's own reason — a guard refusal is not a permission problem.
  if (error) throw new Error(`We couldn't restore "${row.name ?? "this document"}": ${error.message}`);
  return `Restored "${row.name ?? "document"}".`;
}
