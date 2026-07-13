/**
 * features/files/api/versions.ts
 *
 * File-version endpoints.
 *
 * Backend contract: features/files/cld_files_frontend.md §6 (Versions).
 */

import {
  downloadBlob,
  getJson,
  postJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";
import type { CloudFileVersionRow, FileRecordApi } from "@/features/files/types";

// list/get stay on the raw client: the contract response is `FileVersionRecord`
// (all-optional + index-signature), whereas consumers read the concrete DB-row
// `CloudFileVersionRow`. Binding would erase the row's concrete fields.
export async function listVersions(
  fileId: string,
  opts: RequestOptions = {},
): Promise<{ data: CloudFileVersionRow[]; meta: ResponseMeta }> {
  return getJson<CloudFileVersionRow[]>(
    `/files/${fileId}/versions`,
    opts,
  );
}

export async function getVersion(
  fileId: string,
  versionNumber: number,
  opts: RequestOptions = {},
): Promise<{ data: CloudFileVersionRow; meta: ResponseMeta }> {
  return getJson<CloudFileVersionRow>(
    `/files/${fileId}/versions/${versionNumber}`,
    opts,
  );
}

// Binary download (blob bytes, not JSON) — stays on the raw `downloadBlob` helper;
// the typed client only covers JSON responses.
export async function downloadVersion(
  fileId: string,
  versionNumber: number,
  opts: RequestOptions = {},
): Promise<{ blob: Blob; filename: string | null; meta: ResponseMeta }> {
  return downloadBlob(
    `/files/${fileId}/versions/${versionNumber}/download`,
    opts,
  );
}

export async function restoreVersion(
  fileId: string,
  versionNumber: number,
  opts: RequestOptions = {},
): Promise<{ data: FileRecordApi; meta: ResponseMeta }> {
  // Stays on the raw client: the contract declares NO request body for this
  // operation, but the server accepts (and this call sends) an empty `{}` — routing
  // through `apiPost` would type the body as `undefined` and could change the wire.
  // The response type is already contract-bound: `FileRecordApi` is an alias of
  // `components["schemas"]["FileRecord"]`, exactly what the operation returns.
  return postJson<FileRecordApi, Record<string, never>>(
    `/files/${fileId}/versions/${versionNumber}/restore`,
    {},
    opts,
  );
}
