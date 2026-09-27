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
 *   purge    — the ONLY hard delete, and only of rows already in the trash:
 *              `fn_purge_library_document` per version, children before
 *              parents (a person's edits, then recaptures, then the first
 *              capture). A file family never purges per document.
 */

import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import type { TrashGroup, TrashRow } from "@/features/rag/components/library/trashGroups";

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
  if (error) throw new Error("We couldn't restore this document. You may not be allowed to restore it.");
  return `Restored "${row.name ?? "document"}".`;
}

/** What the purge confirmation says. */
export function purgeConfirmCopy(group: TrashGroup): { title: string; description: string } {
  return {
    title: `Permanently delete "${group.head.name ?? "document"}"?`,
    description: `Erases ${group.versions > 1 ? `all ${group.versions} versions of this Source` : "the document"}, its pages, ${RAG_VOCAB.segmentsShort.toLowerCase()}, and embeddings forever. This cannot be undone.`,
  };
}

/** Purge every version of one trashed Source. Throws a counted sentence on partial failure. */
export async function purgeTrashGroup(group: TrashGroup, rows: readonly TrashRow[], doors: TrashDoors): Promise<string> {
  if (group.head.deleted_via === "file_cascade")
    throw new Error("A file's documents are deleted forever together with the file, from the file's own trash.");
  const order = (id: string) => {
    const kind = rows.find((r) => r.id === id)?.derivation_kind;
    return kind === "manual_curation" ? 0 : kind === "recapture" ? 1 : 2;
  };
  const ids = [...group.ids].sort((a, b) => order(a) - order(b));
  for (const [i, id] of ids.entries()) {
    const { error } = await doors.rpc("fn_purge_library_document", { p_id: id });
    if (error)
      throw new Error(
        i === 0
          ? "We couldn't permanently delete this document. You may not be allowed to delete it."
          : `${i} of ${ids.length} versions were deleted forever; the rest could not be. You may not be allowed to delete them.`,
      );
  }
  return `Permanently deleted "${group.head.name ?? "document"}".`;
}
