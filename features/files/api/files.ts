/**
 * features/files/api/files.ts
 *
 * REST endpoints under /files/*. Wraps the typed client with endpoint-specific
 * args/returns so thunks don't hand-craft URLs or bodies.
 *
 * Backend contract: features/files/cld_files_frontend.md §6 (Files).
 */

import {
  del,
  delJson,
  downloadBlob,
  downloadBlobWithProgress,
  getJson,
  patchJson,
  postJson,
  postMultipart,
  uploadWithProgress,
  type DownloadProgressEvent,
  type RequestOptions,
  type ResponseMeta,
  type UploadProgressEvent,
} from "@/lib/python-client";
import type {
  BulkDeleteFilesRequest,
  BulkMoveFilesRequest,
  BulkResponse,
  CopyFileRequest,
  FilePatchRequest,
  FileRecordApi,
  FileUploadResponse,
  MigrateGuestToUserRequest,
  MigrateGuestToUserResponse,
  PermissionLevel,
  RenameFileRequest,
  SearchFilesParams,
  SearchFilesResponse,
  SignedUrlResponse,
  StorageUsageResponse,
  TrashListResponse,
  Visibility,
} from "@/features/files/types";

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface UploadFileParams {
  file: File;
  filePath: string;
  visibility?: Visibility;
  shareWith?: string[];
  shareLevel?: PermissionLevel;
  changeSummary?: string;
  metadata?: Record<string, unknown>;
}

export async function uploadFile(
  params: UploadFileParams,
  opts: RequestOptions = {},
): Promise<{ data: FileUploadResponse; meta: ResponseMeta }> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("file_path", params.filePath);
  if (params.visibility) form.append("visibility", params.visibility);
  if (params.shareWith?.length)
    form.append("share_with", params.shareWith.join(","));
  if (params.shareLevel) form.append("share_level", params.shareLevel);
  if (params.changeSummary) form.append("change_summary", params.changeSummary);
  if (params.metadata)
    form.append("metadata_json", JSON.stringify(params.metadata));

  return postMultipart<FileUploadResponse>("/files/upload", form, opts);
}

export async function uploadFileWithProgress(
  params: UploadFileParams,
  onProgress: (event: UploadProgressEvent) => void,
  opts: RequestOptions = {},
): Promise<{ data: FileUploadResponse; meta: ResponseMeta }> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("file_path", params.filePath);
  if (params.visibility) form.append("visibility", params.visibility);
  if (params.shareWith?.length)
    form.append("share_with", params.shareWith.join(","));
  if (params.shareLevel) form.append("share_level", params.shareLevel);
  if (params.changeSummary) form.append("change_summary", params.changeSummary);
  if (params.metadata)
    form.append("metadata_json", JSON.stringify(params.metadata));

  return uploadWithProgress<FileUploadResponse>(
    "/files/upload",
    form,
    onProgress,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * List files. Reading via supabase-js is preferred (RLS-filtered, no roundtrip
 * through the backend). Exposed here for parity with the REST contract.
 *
 * Pagination is supported on the backend side (1–1000, default 100).
 */
export async function listFiles(
  params: { folderPath?: string; limit?: number; offset?: number } = {},
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi[]; meta: ResponseMeta }> {
  const qs: string[] = [];
  if (params.folderPath)
    qs.push(`folder_path=${encodeURIComponent(params.folderPath)}`);
  if (params.limit !== undefined) qs.push(`limit=${params.limit}`);
  if (params.offset !== undefined) qs.push(`offset=${params.offset}`);
  const q = qs.length ? `?${qs.join("&")}` : "";
  return getJson<FileRecordApi[]>(`/files${q}`, opts);
}

export async function getFile(
  fileId: string,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  return getJson<FileRecordApi>(`/files/${fileId}`, opts);
}

export async function getFileByPath(
  filePath: string,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  return getJson<FileRecordApi>(
    `/files/by-path/${encodeURIComponent(filePath)}`,
    opts,
  );
}

/**
 * Full tree via the RPC. Prefer calling the RPC directly via supabase-js in
 * thunks (reducer dispatches don't need a round-trip through the backend).
 * This is provided for backend-mediated contexts only.
 */
export async function getFileTree(
  opts: RequestOptions = {},
): Promise<{ data: unknown[]; meta: ResponseMeta }> {
  return getJson<unknown[]>("/files/tree", opts);
}

// ---------------------------------------------------------------------------
// Mutate
// ---------------------------------------------------------------------------

/**
 * Patch a file. Union body (A.2 — landed in matrx-utils v1.1.0): can rename,
 * move (`folder`), change visibility, merge metadata, grant/revoke share,
 * grant/revoke permissions, request variants, restore a version, restore
 * from trash, or copy — in any combination, in a single round-trip.
 *
 * Sub-operations run sequentially with best-effort atomicity: the upload
 * piece always lands, but downstream sub-ops can fail individually and
 * surface in the response envelope's `errors[]` array (FE handles partial
 * success — see useFileMutation in Phase 1).
 *
 * **Metadata is MERGED by default** — only the keys you send are touched
 * on the server-side jsonb blob. For the rare "rewrite the whole metadata
 * blob" tool, use `patchFileReplaceMetadata` below.
 *
 * `share_revoke` and `restore_from_trash` default to false; callers only
 * need to set them when intentionally invoking that sub-op.
 */
export type FilePatchBody = Partial<FilePatchRequest>;

export async function patchFile(
  fileId: string,
  body: FilePatchBody,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  const fullBody: FilePatchRequest = {
    share_revoke: false,
    restore_from_trash: false,
    ...body,
  };
  return patchJson<FileRecordApi, FilePatchRequest>(
    `/files/${fileId}`,
    fullBody,
    opts,
  );
}

/**
 * Same as `patchFile` but uses the legacy "replace whole metadata jsonb"
 * semantics. Use ONLY for explicit overwrite-the-whole-blob tools — never
 * for incremental edits where you'd lose every key the user didn't send.
 */
export async function patchFileReplaceMetadata(
  fileId: string,
  body: FilePatchBody,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  const fullBody: FilePatchRequest = {
    share_revoke: false,
    restore_from_trash: false,
    ...body,
  };
  return patchJson<FileRecordApi, FilePatchRequest>(
    `/files/${fileId}?metadata_merge=false`,
    fullBody,
    opts,
  );
}

export async function deleteFile(
  fileId: string,
  params: { hardDelete?: boolean } = {},
  opts: RequestOptions = {},
): Promise<{ data: null; meta: ResponseMeta }> {
  const q = params.hardDelete ? "?hard_delete=true" : "";
  return del<null>(`/files/${fileId}${q}`, opts);
}

// ---------------------------------------------------------------------------
// Bytes + signed URL
// ---------------------------------------------------------------------------

export async function downloadFile(
  fileId: string,
  params: { version?: number; inline?: boolean } = {},
  opts: RequestOptions = {},
): Promise<{ blob: Blob; filename: string | null; meta: ResponseMeta }> {
  const qs: string[] = [];
  if (params.version !== undefined) qs.push(`version=${params.version}`);
  // `?inline=true` only honoured for image/video/audio/PDF — other types
  // are served as `attachment` regardless. Useful for `<a href>` previews
  // where we want the browser tab to render rather than auto-download.
  if (params.inline) qs.push("inline=true");
  const q = qs.length ? `?${qs.join("&")}` : "";
  return downloadBlob(`/files/${fileId}/download${q}`, opts);
}

/**
 * Same as `downloadFile` but reports byte-level progress via `onProgress`.
 * Use this when the UI needs a "Downloading 6.2 / 10 MB…" indicator —
 * notably for `useFileBlob`, which feeds previewers that may pull
 * multi-megabyte payloads.
 */
export async function downloadFileWithProgress(
  fileId: string,
  onProgress: (event: DownloadProgressEvent) => void,
  params: { version?: number; inline?: boolean } = {},
  opts: RequestOptions = {},
): Promise<{ blob: Blob; filename: string | null; meta: ResponseMeta }> {
  const qs: string[] = [];
  if (params.version !== undefined) qs.push(`version=${params.version}`);
  if (params.inline) qs.push("inline=true");
  const q = qs.length ? `?${qs.join("&")}` : "";
  return downloadBlobWithProgress(
    `/files/${fileId}/download${q}`,
    onProgress,
    opts,
  );
}

export async function getSignedUrl(
  fileId: string,
  params: { expiresIn?: number } = {},
  opts: RequestOptions = {},
): Promise<{ data: SignedUrlResponse; meta: ResponseMeta }> {
  const expiresIn = params.expiresIn ?? 3600;
  return getJson<SignedUrlResponse>(
    `/files/${fileId}/url?expires_in=${expiresIn}`,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/**
 * Soft-delete (or hard-delete with `hard_delete: true`) many files in one
 * call. Returns the standard `BulkResponse` envelope:
 *
 *   { results: [{ id, ok, error }], succeeded: N, failed: M }
 *
 * Per-request size capped at the user's tier `max_bulk_items` (free=200,
 * pro=500). Concurrency is capped server-side at 10 in-flight.
 */
export async function bulkDeleteFiles(
  body: BulkDeleteFilesRequest,
  opts: RequestOptions = {},
): Promise<{ data: BulkResponse | null; meta: ResponseMeta }> {
  return delJson<BulkResponse, BulkDeleteFilesRequest>(
    "/files/bulk",
    body,
    opts,
  );
}

/**
 * Move many files to a new parent folder in one call.
 *
 * The backend verifies every target file belongs to the same owner as the
 * destination folder; cross-owner moves are refused with `403`. Returns
 * the standard `BulkResponse` envelope.
 */
export async function bulkMoveFiles(
  body: BulkMoveFilesRequest,
  opts: RequestOptions = {},
): Promise<{ data: BulkResponse; meta: ResponseMeta }> {
  return postJson<BulkResponse, BulkMoveFilesRequest>(
    "/files/bulk/move",
    body,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Guest → user migration
// ---------------------------------------------------------------------------

/**
 * Claim every file/folder/group/permission/share owned by a guest
 * fingerprint for the currently authenticated user.
 *
 * Contract:
 *   - Body: `{ new_user_id, guest_id? }` — `new_user_id` MUST equal the
 *     authed user_id (server enforces). `guest_id` is optional; when
 *     provided, the backend cross-checks against the resolved fingerprint.
 *   - Header: `X-Guest-Fingerprint` (passed via `opts.guestFingerprint`)
 *     is REQUIRED — it's the server-bound proof of guest identity.
 *   - Idempotent on `(authed_user_id, fingerprint)`. Re-calls with the
 *     same `new_user_id` return the original payload. Re-calls with a
 *     DIFFERENT `new_user_id` return `409 guest_locked`.
 */
export async function migrateGuestToUser(
  body: MigrateGuestToUserRequest,
  opts: RequestOptions = {},
): Promise<{ data: MigrateGuestToUserResponse; meta: ResponseMeta }> {
  if (!opts.guestFingerprint) {
    throw new Error(
      "migrateGuestToUser: opts.guestFingerprint is required (sent as X-Guest-Fingerprint).",
    );
  }
  return postJson<MigrateGuestToUserResponse, MigrateGuestToUserRequest>(
    "/files/migrate-guest-to-user",
    body,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Tier / quotas / usage
// ---------------------------------------------------------------------------

/**
 * Read the authenticated user's account tier + current storage usage.
 * Drives the storage indicator + tier badge + feature gating in the UI.
 */
export async function getStorageUsage(
  opts: RequestOptions = {},
): Promise<{ data: StorageUsageResponse; meta: ResponseMeta }> {
  return getJson<StorageUsageResponse>("/files/usage", opts);
}

// ---------------------------------------------------------------------------
// Trash + restore
// ---------------------------------------------------------------------------

/**
 * List soft-deleted files + folders for the authenticated user.
 * Renders the trash view; pair with `restoreFile` to undo.
 */
export async function listTrash(
  opts: RequestOptions = {},
): Promise<{ data: TrashListResponse; meta: ResponseMeta }> {
  return getJson<TrashListResponse>("/files/trash", opts);
}

/**
 * Restore a soft-deleted file. Owner or admin grantee only — others
 * get `403 permission_denied`.
 */
export async function restoreFile(
  fileId: string,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  return postJson<FileRecordApi, Record<string, never>>(
    `/files/${fileId}/restore`,
    {},
    opts,
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Filename / path substring search across the authenticated user's
 * non-deleted files. `mimePrefix` filters by `mime_type LIKE 'prefix%'`
 * (e.g. `image/`, `video/mp4`).
 */
export async function searchFiles(
  params: SearchFilesParams,
  opts: RequestOptions = {},
): Promise<{ data: SearchFilesResponse; meta: ResponseMeta }> {
  const qs: string[] = [`q=${encodeURIComponent(params.q)}`];
  if (params.mimePrefix)
    qs.push(`mime_prefix=${encodeURIComponent(params.mimePrefix)}`);
  if (params.limit !== undefined) qs.push(`limit=${params.limit}`);
  if (params.offset !== undefined) qs.push(`offset=${params.offset}`);
  return getJson<SearchFilesResponse>(
    `/files/search?${qs.join("&")}`,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Rename + copy (path-changing operations)
// ---------------------------------------------------------------------------

/**
 * Rename / move a file by changing its full logical path. The backend
 * auto-creates any missing parent folders. Replaces the FE's earlier
 * "metadata hack" approach.
 *
 * The new path is the FULL path including the filename — e.g.
 * `Reports/2026/Q1/forecast.pdf`. Just changing the leaf renames in
 * place; changing intermediate segments moves into a different folder.
 */
export async function renameFile(
  fileId: string,
  body: RenameFileRequest,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  return postJson<FileRecordApi, RenameFileRequest>(
    `/files/${fileId}/rename`,
    body,
    opts,
  );
}

/**
 * Copy a file to a new logical path. Backend auto-creates parent folders.
 * The copy counts against the caller's storage + file-count quota; refused
 * uploads come back as 413 with the relevant quota code.
 *
 * `overwrite: true` replaces an existing file at `target_path`; the
 * default (false) returns `409 file_already_exists` on conflict.
 */
export async function copyFile(
  fileId: string,
  body: CopyFileRequest,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  return postJson<FileRecordApi, CopyFileRequest>(
    `/files/${fileId}/copy`,
    body,
    opts,
  );
}
