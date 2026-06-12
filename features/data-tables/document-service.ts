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

  const { data, error } = await supabase
    .from("udt_documents")
    .insert({
      document_name: args.name,
      description: args.description ?? null,
      source: args.source ?? "created",
      organization_id: args.organizationId ?? null,
      project_id: args.projectId ?? null,
      task_id: args.taskId ?? null,
      is_public: args.isPublic ?? false,
      original_file_id: args.originalFileId ?? null,
      user_id: userData.user.id,
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
    .from("udt_documents")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as DocumentRow[] };
}

export async function getDocument(
  documentId: string,
): Promise<ServiceResult<DocumentRow>> {
  const { data, error } = await supabase
    .from("udt_documents")
    .select("*")
    .eq("id", documentId)
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as DocumentRow };
}

export async function renameDocument(
  documentId: string,
  name: string,
): Promise<ServiceResult<DocumentRow>> {
  const { data, error } = await supabase
    .from("udt_documents")
    .update({ document_name: name, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as DocumentRow };
}

export async function deleteDocument(
  documentId: string,
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("udt_documents")
    .delete()
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
    .from("udt_document_snapshots")
    .select("id, document_id, label, origin, created_by, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as DocumentSnapshot[] };
}
