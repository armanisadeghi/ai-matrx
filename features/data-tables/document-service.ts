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
 *   - Realtime: features/data-tables/hooks/useDocumentRealtime
 *   - Component: features/data-tables/components/DocumentEditor
 *
 * Mirrors `workbook-service.ts`. If you're changing the shape of one, change
 * the other at the same time — see `features/data-tables/FEATURE.md`.
 */
import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

import type {
  DocumentRow,
  DocumentSnapshot,
  DocumentSnapshotOrigin,
  ServiceResult,
} from "./types";

// ─── documents ───────────────────────────────────────────────────────────────

export type CreateDocumentArgs = {
  name: string;
  description?: string | null;
  /** Origin label for the document itself, mirrors `udt_documents.source`. */
  source?: "created" | "imported_docx" | "imported_md" | "imported_txt";
  organizationId?: string | null;
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
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return {
      success: false,
      error: userErr?.message ?? "not authenticated",
    };
  }

  // Org is NOT NULL — ride the explicit org if given, else the active org.
  const organizationId = await ensureOrgId(args.organizationId);

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
  // RLS handles owner / public / shared visibility.
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_documents")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as DocumentRow[] };
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
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as DocumentRow };
}

export async function renameDocument(
  documentId: string,
  name: string,
): Promise<ServiceResult<DocumentRow>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_documents")
    .update({ document_name: name, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .select("*")
    .single();
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
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_documents")
    .update({
      description: description && description.length > 0 ? description : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .select("*")
    .single();
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
  const { error } = await supabase
    .schema("workbench")
    .from("udt_documents")
    .update({ deleted_at: null })
    .eq("id", documentId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

/**
 * HARD delete — only for rolling back a document this very flow just created and
 * failed to populate. Never use for a user-initiated delete: that is
 * deleteDocument, which tombstones and stays recoverable.
 */
export async function discardFailedDocument(
  documentId: string,
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .schema("workbench")
    .from("udt_documents")
    .delete()
    .eq("id", documentId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

export async function deleteDocument(
  documentId: string,
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .schema("workbench")
    .from("udt_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId);
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
  const { data: userData } = await supabase.auth.getUser();
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
  await supabase
    .schema("workbench")
    .from("udt_documents")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.documentId);

  return { success: true, data: data as DocumentSnapshot };
}

export async function listDocumentSnapshots(
  documentId: string,
  limit = 50,
): Promise<ServiceResult<DocumentSnapshot[]>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_document_snapshots")
    .select("id, document_id, label, origin, created_by, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as DocumentSnapshot[] };
}
