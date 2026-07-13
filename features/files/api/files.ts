/**
 * features/files/api/files.ts
 *
 * REST endpoints under /files/*. Wraps the typed client with endpoint-specific
 * args/returns so thunks don't hand-craft URLs or bodies.
 *
 * Backend contract: features/files/cld_files_frontend.md §6 (Files).
 */

import {
  delJson,
  downloadBlob,
  downloadBlobWithProgress,
  getJson,
  patchJson,
  postJson,
  uploadWithProgress,
  type DownloadProgressEvent,
  type RequestOptions,
  type ResponseMeta,
  type UploadProgressEvent,
} from "@/lib/python-client";
import {
  apiDelete,
  apiGet,
  apiMultipart,
  apiPost,
  buildPath,
  withQuery,
} from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";
import type {
  BulkDeleteFilesRequest,
  BulkMoveFilesRequest,
  BulkResponse,
  CopyFileRequest,
  FilePatchRequest,
  FileRecordApi,
  FileUploadResponse,
  PermissionLevel,
  RenameFileRequest,
  SearchFilesParams,
  SearchFilesResponse,
  SignedUrlResponse,
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
  /**
   * Per-upload options the backend reads to alter post-upload behavior —
   * notably `rag.trigger_now` to run RAG immediately instead of waiting for
   * the scheduled auto-RAG sweep. Serialized to the `options_json` form
   * field alongside `metadata_json`.
   */
  options?: UploadOptions;
}

/** Mirrors the backend `options_json` envelope. Extend as new opts land. */
export interface UploadOptions {
  rag?: {
    /** Run RAG ingest immediately on upload (skip the scheduled sweep). */
    trigger_now?: boolean;
  };
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
  if (params.options)
    form.append("options_json", JSON.stringify(params.options));

  // Non-progress multipart POST with a JSON response → typed client. Response
  // (FileUploadResponse) is DERIVED from the contract, not asserted.
  return apiMultipart("/files/upload", form, opts);
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
  if (params.options)
    form.append("options_json", JSON.stringify(params.options));

  // Raw client: XHR progress upload — the typed client is JSON-only and has
  // no progress-capable multipart verb.
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
  return apiGet("/files", {
    ...opts,
    query: {
      folder_path: params.folderPath,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export async function getFile(
  fileId: string,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  return apiGet(buildPath("/files/{file_id}", { file_id: fileId }), opts);
}

export async function getFileByPath(
  filePath: string,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  return apiGet(
    buildPath("/files/by-path/{file_path}", { file_path: filePath }),
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
  return apiGet("/files/tree", opts);
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
  // Raw client: the contract types this 200 as `FileRecord | AssetCombinedOpResponse`
  // (union-body sub-ops / X-Idempotency-Key path). Consumers here deref plain
  // `FileRecord`, so routing through the typed client would surface the union
  // and break them. Kept raw pending a consumer that handles both arms.
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
  // Raw client: same union-response reason as `patchFile`.
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
): Promise<{
  data: components["schemas"]["DeleteResponse"];
  meta: ResponseMeta;
}> {
  return apiDelete(
    withQuery(buildPath("/files/{file_id}", { file_id: fileId }), {
      hard_delete: params.hardDelete ? true : undefined,
    }),
    opts,
  );
}

// ---------------------------------------------------------------------------
// Bytes + signed URL
// ---------------------------------------------------------------------------

// Raw client: `downloadFile` / `downloadFileWithProgress` stream file BYTES
// (Blob), not JSON — the typed client only wraps JSON verbs.
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
  // Clamp to the documented bounds (60s – 7d). An un-clamped value would
  // either be silently re-clamped server-side — desyncing the client cache's
  // expiry math from reality — or rejected outright.
  const requested = params.expiresIn ?? 3600;
  const expiresIn = Math.min(604800, Math.max(60, Math.floor(requested)));
  return apiGet(buildPath("/files/{file_id}/url", { file_id: fileId }), {
    ...opts,
    query: { expires_in: expiresIn },
  });
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
  // Raw client: DELETE-with-body. The typed client's `apiDelete` takes no
  // request body, so a bulk delete can't route through it.
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
  // Raw client: the contract's `BulkResultItem.error` is optional, but this
  // wrapper + its thunk consumers treat `BulkResponse.results[].error` as
  // required (`string | null`). Binding to the contract type would ripple that
  // optionality into the thunk payload + `toastBulkPartialFailure` outside
  // this file, so it's left raw pending a coordinated BulkResponse alignment.
  return postJson<BulkResponse, BulkMoveFilesRequest>(
    "/files/bulk/move",
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
): Promise<{
  data: components["schemas"]["StorageUsageResponse"];
  meta: ResponseMeta;
}> {
  return apiGet("/files/usage", opts);
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
): Promise<{
  data: components["schemas"]["TrashListResponse"];
  meta: ResponseMeta;
}> {
  return apiGet("/files/trash", opts);
}

/**
 * Restore a soft-deleted file. Owner or admin grantee only — others
 * get `403 permission_denied`.
 */
export async function restoreFile(
  fileId: string,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  // Raw client: this operation declares NO request body in the contract
  // (`apiPost` would demand `body: never`), and its 200 is `DeleteResponse`,
  // not `FileRecord` — see the drift note in the module report. Left raw so the
  // existing FileRecordApi assertion + empty-body POST are preserved verbatim.
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
  // Raw client: this call sends `q=` unconditionally (empty string included),
  // but the typed client's query serializer DROPS empty-string values — which
  // would change the wire request for an empty query. Left raw to preserve the
  // exact `?q=` behavior.
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
  return apiPost(
    buildPath("/files/{file_id}/rename", { file_id: fileId }),
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
): Promise<{ data: FileUploadResponse; meta: ResponseMeta }> {
  // Contract-bound: the copy 200 is `FileUploadResponse` (NOT `FileRecord` —
  // the pre-conversion assertion was wrong; see the module report). Deriving it
  // through the typed client fixes that lie and locks the shape to the contract.
  return apiPost(
    buildPath("/files/{file_id}/copy", { file_id: fileId }),
    body,
    opts,
  );
}
