/**
 * Document service — typed wrappers for `udt_documents` + `udt_document_snapshots`.
 *
 * Cloud document editor backed by Univer's preset-docs-core. Same shape as
 * `workbook-service.ts` — metadata in `udt_documents`, content state in
 * append-only `udt_document_snapshots`. The editor hydrates from the LATEST
 * snapshot and writes a new snapshot per save (debounced on the client —
 * see DocumentEditor).
 *
 * What lives elsewhere:
 *   - Sharing / permissions: features/sharing/ + `has_permission(...)` RLS
 *   - The open document (one model per id per tab: load, one save, realtime,
 *     collab): features/documents/document-model/
 *   - Component (a view of that model): features/documents/components/DocumentEditor
 *
 * Mirrors `workbook-service.ts`. If you're changing the shape of one, change
 * the other at the same time — see `features/data-tables/FEATURE.md`.
 */
import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { tryWriteOne, writeOneRow } from "@/utils/supabase/writeOne";
import { requireOrganizationContext } from "@/lib/api/organization-context";

import type {
  DocumentRow,
  DocumentSnapshot,
  DocumentSnapshotOrigin,
  ServiceResult,
} from "@/features/data-tables/types";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
// ─── documents ───────────────────────────────────────────────────────────────

export type CreateDocumentArgs = {
  name: string;
  description?: string | null;
  /** Origin label for the document itself, mirrors `udt_documents.source`. */
  source?: "created" | "imported_docx" | "imported_md" | "imported_txt";
  organizationId: string;
  projectId?: string | null;
  taskId?: string | null;
  isPublic?: boolean;
  /**
   * cld_files.id of the source upload (DOCX / MD / TXT blob). Set on the
   * import flow so the lossless original is recoverable; FK is ON DELETE SET
   * NULL, so deleting the file just nulls the link — the document survives.
   */
  originalFileId?: string | null;
};

export async function createDocument(
  args: CreateDocumentArgs,
): Promise<ServiceResult<DocumentRow>> {
  let organizationId: string;
  try {
    organizationId = requireOrganizationContext(undefined, args.organizationId);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Select an organization before creating a document.",
    };
  }

  const { data: userData, error: userErr } = await getClaimsUser(supabase);
  if (userErr || !userData?.user) {
    return {
      success: false,
      error: userErr?.message ?? "not authenticated",
    };
  }

  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_documents")
    .insert({
      document_name: args.name,
      description: args.description ?? null,
      source: args.source ?? "created",
      organization_id: organizationId,
      project_id: args.projectId ?? null,
      task_id: args.taskId ?? null,
      original_file_id: args.originalFileId ?? null,
      // CANONICAL columns (workbench_udt_canonical_step1). `visibility` is the
      // source of truth; the legacy `is_public` boolean is derived from it by
      // the workbench._bridge_legacy_owner trigger, so writing both here would
      // be two authorities for one fact. A new document defaults to `internal`
      // — it is org work product, not an individual person's private thing
      // (db-rules §6) — unless the caller explicitly asked for public.
      created_by: userData.user.id,
      visibility: args.isPublic ? "public" : "internal",
    })
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as DocumentRow };
}

export async function listAccessibleDocuments(): Promise<
  ServiceResult<DocumentRow[]>
> {
  // RLS handles owner / published-to-the-web / shared access. The library and
  // the pickers treat this list as COMPLETE ("you have no such document"), so
  // it pages past PostgREST's silent 1000-row cap (D190).
  try {
    const rows = await readAllRows<DocumentRow>(
      ({ from, to }) =>
        supabase
          .schema("workbench")
          .from("udt_documents")
          .select("*", { count: "exact" })
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
          .returns<DocumentRow[]>(),
      { label: "workbench.udt_documents accessible documents" },
    );
    return { success: true, data: rows };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getDocument(
  documentId: string,
): Promise<ServiceResult<DocumentRow>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_documents")
    .select("*")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) {
    // A trashed or unreachable document is a state the person can act on,
    // never PostgREST's "Cannot coerce the result to a single JSON object".
    return {
      success: false,
      error:
        "This document is in the trash or you no longer have access to it. Restore it from Trash, or ask its owner to share it again.",
    };
  }
  return { success: true, data: data as DocumentRow };
}

export async function renameDocument(
  documentId: string,
  name: string,
): Promise<ServiceResult<DocumentRow>> {
  const { data, error } = await writeOneRow(
    supabase
      .schema("workbench")
      .from("udt_documents")
      .update({ document_name: name, updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .select("*"),
    { action: "update", noun: "document" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as DocumentRow };
}

/**
 * Rewrite the document's description. Sibling of `renameDocument` — the two
 * human-authored fields on `udt_documents` each get a named setter so callers
 * never hand-roll a `.from("udt_documents").update(...)`. Pass `null` (or an
 * empty string) to clear it.
 *
 * Added when the documents surface became agent-writable: the
 * `document_description` write target on `/documents/[id]` is its caller, the
 * same way `updateWorkbookDescription` serves `workbook_description`. Keeping
 * the pair symmetric is this file's standing contract with `workbook-service`
 * (see the module header).
 */
export async function updateDocumentDescription(
  documentId: string,
  description: string | null,
): Promise<ServiceResult<DocumentRow>> {
  const { data, error } = await writeOneRow(
    supabase
      .schema("workbench")
      .from("udt_documents")
      .update({
        description: description && description.length > 0 ? description : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId)
      .select("*"),
    { action: "update", noun: "document" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as DocumentRow };
}

/**
 * Soft delete — the document is tombstoned, not destroyed, and its snapshots stay
 * with it. Every read path filters `deleted_at is null`. Pair with
 * restoreDocument for undo. (aidream migration 0458.)
 */
export async function restoreDocument(
  documentId: string,
): Promise<ServiceResult<true>> {
  const { error } = await tryWriteOne(
    supabase
      .schema("workbench")
      .from("udt_documents")
      .update({ deleted_at: null })
      .eq("id", documentId)
      .select("id"),
    { action: "restore", noun: "document" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

/**
 * Archive (delete means archive: never a hard delete) — only for rolling back a document this very flow just created and
 * failed to populate. Never use for a user-initiated delete: that is
 * deleteDocument, which tombstones and stays recoverable.
 */
export async function discardFailedDocument(
  documentId: string,
): Promise<ServiceResult<true>> {
  const { error } = await tryWriteOne(
    supabase
      .schema("workbench")
      .from("udt_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", documentId)
      .select("id"),
    { action: "archive", noun: "document" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

export async function deleteDocument(
  documentId: string,
): Promise<ServiceResult<true>> {
  const { error } = await tryWriteOne(
    supabase
      .schema("workbench")
      .from("udt_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", documentId)
      .select("id"),
    { action: "delete", noun: "document" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

// ─── snapshots (document content) ────────────────────────────────────────────

/**
 * Latest-snapshot fetch — what an opened document hydrates from. Returns
 * `data: null` (success path) when the document has no snapshots yet (newly
 * created, never saved). Distinguish "no snapshot" from "load error" by
 * checking `result.data === null`.
 */
export async function getLatestDocumentSnapshot(
  documentId: string,
): Promise<ServiceResult<DocumentSnapshot | null>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_document_snapshots")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? null) as DocumentSnapshot | null };
}

export type SaveDocumentSnapshotArgs = {
  documentId: string;
  snapshot: unknown; // opaque to us — Univer IDocumentData decides the shape
  label?: string | null;
  origin?: DocumentSnapshotOrigin;
};

export async function saveDocumentSnapshot(
  args: SaveDocumentSnapshotArgs,
): Promise<ServiceResult<DocumentSnapshot>> {
  const { data: userData } = await getClaimsUser(supabase);
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_document_snapshots")
    .insert({
      document_id: args.documentId,
      snapshot: args.snapshot as never,
      label: args.label ?? null,
      origin: args.origin ?? "autosave",
      created_by: userData?.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  // Touch the parent document's updated_at so list views can sort by recency
  // without scanning snapshots. Best-effort — failure here is harmless.
  // write-lands-exempt: best-effort recency stamp on the parent document; the snapshot insert above is the real write
  await supabase
    .schema("workbench")
    .from("udt_documents")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.documentId);

  return { success: true, data: data as DocumentSnapshot };
}

/**
 * An independent copy of a document: its own row, with the latest snapshot copied over, so editing the copy never
 * touches the original. The copy lives in the original's organization and project. Used by a board-template use.
 */
export async function copyDocument(
  documentId: string,
): Promise<ServiceResult<DocumentRow>> {
  const original = await getDocument(documentId);
  if (!original.success) return original;
  const row = original.data;
  if (!row.organization_id) {
    return { success: false, error: "This document has no organization and cannot be copied." };
  }
  const created = await createDocument({
    name: row.document_name,
    description: row.description ?? null,
    organizationId: row.organization_id,
    projectId: row.project_id ?? null,
    isPublic: row.visibility === "public",
  });
  if (!created.success) return created;
  const latest = await getLatestDocumentSnapshot(documentId);
  if (!latest.success) return latest;
  if (latest.data) {
    const saved = await saveDocumentSnapshot({
      documentId: created.data.id,
      snapshot: latest.data.snapshot,
      label: latest.data.label,
      origin: "autosave",
    });
    if (!saved.success) return saved;
  }
  return created;
}

export async function listDocumentSnapshots(
  documentId: string,
  limit = 50,
): Promise<ServiceResult<DocumentSnapshot[]>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_document_snapshots")
    // component-created-by-ok: append-only snapshot with NO updated_by column and NO parent-rewrite trigger — created_by is the author the client wrote at insert (the only person field this table has)
    .select("id, document_id, label, origin, created_by, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as DocumentSnapshot[] };
}
