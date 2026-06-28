/**
 * Workbook service — typed wrappers for `udt_workbooks` + `udt_workbook_snapshots`.
 *
 * Workbooks are the lossless-spreadsheet surface (P4): metadata in
 * `udt_workbooks`, content state in append-only `udt_workbook_snapshots`. The
 * editor (Univer or equivalent) hydrates from the LATEST snapshot and writes
 * a new snapshot per save (debounced on the client — see WorkbookEditor).
 *
 * What lives elsewhere:
 *   - Sharing / permissions: features/sharing/ + `has_permission(...)` RLS
 *   - Realtime: features/data-tables/hooks/useWorkbookRealtime
 *   - Component: features/data-tables/components/WorkbookEditor
 *
 * See `features/data-tables/FEATURE.md` for architecture context.
 */
import { supabase } from "@/utils/supabase/client";

import type {
  ServiceResult,
  Workbook,
  WorkbookSnapshot,
  WorkbookSnapshotOrigin,
} from "./types";

// ─── workbooks ────────────────────────────────────────────────────────────────

export type CreateWorkbookArgs = {
  name: string;
  description?: string | null;
  /** Origin label for the workbook itself, mirrors `udt_workbooks.source`. */
  source?:
    | "created"
    | "imported_xlsx"
    | "imported_gsheet"
    | "imported_csv"
    | "linked_gsheet";
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  isPublic?: boolean;
  /**
   * cld_files.id of the source upload (XLSX / CSV blob). Set on the import
   * flow so the lossless original is recoverable; FK is ON DELETE SET NULL,
   * so deleting the file just nulls the link — the workbook survives.
   */
  originalFileId?: string | null;
};

export async function createWorkbook(
  args: CreateWorkbookArgs,
): Promise<ServiceResult<Workbook>> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return {
      success: false,
      error: userErr?.message ?? "not authenticated",
    };
  }

  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_workbooks")
    .insert({
      workbook_name: args.name,
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
  return { success: true, data: data as Workbook };
}

export async function listAccessibleWorkbooks(): Promise<
  ServiceResult<Workbook[]>
> {
  // RLS handles owner / public / shared visibility.
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_workbooks")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Workbook[] };
}

export async function getWorkbook(
  workbookId: string,
): Promise<ServiceResult<Workbook>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_workbooks")
    .select("*")
    .eq("id", workbookId)
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Workbook };
}

export async function renameWorkbook(
  workbookId: string,
  name: string,
): Promise<ServiceResult<Workbook>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_workbooks")
    .update({ workbook_name: name, updated_at: new Date().toISOString() })
    .eq("id", workbookId)
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Workbook };
}

export async function deleteWorkbook(
  workbookId: string,
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .schema("workbench")
    .from("udt_workbooks")
    .delete()
    .eq("id", workbookId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

// ─── snapshots (workbook content) ────────────────────────────────────────────

/**
 * Latest-snapshot fetch — what an opened workbook hydrates from. Returns
 * `data: null` (success path) when the workbook has no snapshots yet (newly
 * created, never saved). Distinguish "no snapshot" from "load error" by
 * checking `result.data === null`.
 */
export async function getLatestSnapshot(
  workbookId: string,
): Promise<ServiceResult<WorkbookSnapshot | null>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_workbook_snapshots")
    .select("*")
    .eq("workbook_id", workbookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? null) as WorkbookSnapshot | null };
}

export type SaveSnapshotArgs = {
  workbookId: string;
  snapshot: unknown; // opaque to us — editor library decides the shape
  label?: string | null;
  origin?: WorkbookSnapshotOrigin;
};

export async function saveSnapshot(
  args: SaveSnapshotArgs,
): Promise<ServiceResult<WorkbookSnapshot>> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_workbook_snapshots")
    .insert({
      workbook_id: args.workbookId,
      snapshot: args.snapshot as never,
      label: args.label ?? null,
      origin: args.origin ?? "autosave",
      created_by: userData?.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) return { success: false, error: error.message };

  // Touch the parent workbook's updated_at so list views can sort by recency
  // without scanning snapshots. Best-effort — failure here is harmless.
  await supabase
    .schema("workbench")
    .from("udt_workbooks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.workbookId);

  return { success: true, data: data as WorkbookSnapshot };
}

export async function listSnapshots(
  workbookId: string,
  limit = 50,
): Promise<ServiceResult<WorkbookSnapshot[]>> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_workbook_snapshots")
    .select("id, workbook_id, label, origin, created_by, created_at")
    .eq("workbook_id", workbookId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as WorkbookSnapshot[] };
}
