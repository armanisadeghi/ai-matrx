/**
 * features/files/api/folders.ts
 *
 * Folder CRUD against the Python REST backend. Listing also goes through
 * REST here for parity with the contract; supabase-js reads remain the
 * preferred path for the live tree (`cld_get_user_file_tree`).
 *
 * Backend contract: features/files/cloud_files_frontend.md §6 (Folders)
 * plus the Python team's P-6 (folder CRUD) deliverables.
 */

import {
  del,
  getJson,
  patchJson,
  postJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";
import type {
  BulkMoveFoldersRequest,
  BulkResponse,
  CloudFolderRow,
  CreateFolderRequest,
  FolderPatchRequest,
} from "@/features/files/types";

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listFolders(
  params: { parentPath?: string } = {},
  opts: RequestOptions = {},
): Promise<{ data: CloudFolderRow[]; meta: ResponseMeta }> {
  const q = params.parentPath
    ? `?parent_path=${encodeURIComponent(params.parentPath)}`
    : "";
  return getJson<CloudFolderRow[]>(`/files/folders${q}`, opts);
}

// ---------------------------------------------------------------------------
// Create / update / delete (Python P-6)
// ---------------------------------------------------------------------------

/**
 * Create a folder. Prefer path-style (`folder_path: "Images/Chat"`) — the
 * backend will create any missing intermediate folders atomically and
 * idempotently, matching upload semantics.
 */
export async function createFolder(
  body: CreateFolderRequest,
  opts: RequestOptions = {},
): Promise<{ data: CloudFolderRow; meta: ResponseMeta }> {
  return postJson<CloudFolderRow, CreateFolderRequest>(
    "/folders",
    body,
    opts,
  );
}

/**
 * Update a folder — rename, move (via `parent_id`), or change visibility.
 * The backend cascades `folder_path` updates to descendants on the server
 * side; we don't replay that on the client.
 */
export async function patchFolder(
  folderId: string,
  body: FolderPatchRequest,
  opts: RequestOptions = {},
): Promise<{ data: CloudFolderRow; meta: ResponseMeta }> {
  return patchJson<CloudFolderRow, FolderPatchRequest>(
    `/folders/${folderId}`,
    body,
    opts,
  );
}

/**
 * Soft-delete a folder. Pass `?hard_delete=true` to bypass the trash. The
 * backend cascades to all descendants.
 */
export async function deleteFolder(
  folderId: string,
  params: { hardDelete?: boolean } = {},
  opts: RequestOptions = {},
): Promise<{ data: null; meta: ResponseMeta }> {
  const q = params.hardDelete ? "?hard_delete=true" : "";
  return del<null>(`/folders/${folderId}${q}`, opts);
}

// ---------------------------------------------------------------------------
// Bulk (Python P-7)
// ---------------------------------------------------------------------------

/**
 * Move many folders to a new parent in one call. Returns a per-item
 * succeeded/failed envelope so the caller can show per-row error chips
 * without aborting the whole batch.
 */
export async function bulkMoveFolders(
  body: BulkMoveFoldersRequest,
  opts: RequestOptions = {},
): Promise<{ data: BulkResponse; meta: ResponseMeta }> {
  return postJson<BulkResponse, BulkMoveFoldersRequest>(
    "/folders/bulk/move",
    body,
    opts,
  );
}
