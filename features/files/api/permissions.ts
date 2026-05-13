/**
 * features/files/api/permissions.ts
 *
 * Grant / revoke permissions on files and folders.
 *
 * Backend contract: features/files/cld_files_frontend.md §6 (Permissions).
 */

import {
  del,
  getJson,
  postJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";
import type { CloudFilePermissionRow, GrantPermissionRequest } from "@/features/files/types";

// ---------------------------------------------------------------------------
// File permissions
// ---------------------------------------------------------------------------

export async function listFilePermissions(
  fileId: string,
  opts: RequestOptions = {},
): Promise<{ data: CloudFilePermissionRow[]; meta: ResponseMeta }> {
  return getJson<CloudFilePermissionRow[]>(
    `/files/${fileId}/permissions`,
    opts,
  );
}

export async function grantFilePermission(
  fileId: string,
  body: GrantPermissionRequest,
  opts: RequestOptions = {},
): Promise<{ data: CloudFilePermissionRow; meta: ResponseMeta }> {
  return postJson<CloudFilePermissionRow, GrantPermissionRequest>(
    `/files/${fileId}/permissions`,
    body,
    opts,
  );
}

export async function revokeFilePermission(
  fileId: string,
  granteeId: string,
  params: { granteeType?: "user" | "group" } = {},
  opts: RequestOptions = {},
): Promise<{ data: null; meta: ResponseMeta }> {
  const granteeType = params.granteeType ?? "user";
  return del<null>(
    `/files/${fileId}/permissions/${granteeId}?grantee_type=${granteeType}`,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Folder permissions (cascade to contents)
// ---------------------------------------------------------------------------

export async function listFolderPermissions(
  folderId: string,
  opts: RequestOptions = {},
): Promise<{ data: CloudFilePermissionRow[]; meta: ResponseMeta }> {
  return getJson<CloudFilePermissionRow[]>(
    `/folders/${folderId}/permissions`,
    opts,
  );
}

export async function grantFolderPermission(
  folderId: string,
  body: GrantPermissionRequest,
  opts: RequestOptions = {},
): Promise<{ data: CloudFilePermissionRow; meta: ResponseMeta }> {
  return postJson<CloudFilePermissionRow, GrantPermissionRequest>(
    `/folders/${folderId}/permissions`,
    body,
    opts,
  );
}

export async function revokeFolderPermission(
  folderId: string,
  granteeId: string,
  params: { granteeType?: "user" | "group" } = {},
  opts: RequestOptions = {},
): Promise<{ data: null; meta: ResponseMeta }> {
  const granteeType = params.granteeType ?? "user";
  return del<null>(
    `/folders/${folderId}/permissions/${granteeId}?grantee_type=${granteeType}`,
    opts,
  );
}
