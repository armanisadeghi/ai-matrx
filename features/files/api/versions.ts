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
  // Empty-body POST, so we pass `{}` to satisfy the typed `postJson` signature.
  return postJson<FileRecordApi, Record<string, never>>(
    `/files/${fileId}/versions/${versionNumber}/restore`,
    {},
    opts,
  );
}
