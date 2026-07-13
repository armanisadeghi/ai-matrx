/**
 * features/files/api/permissions.ts
 *
 * Grant / revoke permissions on files and folders.
 *
 * Backend contract: features/files/cld_files_frontend.md §6 (Permissions).
 */

import {
  getJson,
  postJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";
import { apiDelete, buildPath, withQuery } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";
import type { CloudFilePermissionRow, GrantPermissionRequest } from "@/features/files/types";

// ---------------------------------------------------------------------------
// File permissions
// ---------------------------------------------------------------------------

// list/grant stay on the raw client: their request body (`GrantPermissionRequest`)
// is already the generated schema, but the contract response is `PermissionRecord`
// (all-optional + index-signature), whereas consumers read the concrete DB-row
// `CloudFilePermissionRow`. Binding would erase the row's concrete fields.
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
): Promise<{ data: components["schemas"]["DeleteResponse"]; meta: ResponseMeta }> {
  const granteeType = params.granteeType ?? "user";
  // Contract-bound (`revoke_file_permission_...`). `grantee_type` is always sent
  // (default "user"), preserving the prior always-present query param.
  return apiDelete(
    withQuery(
      buildPath("/files/{file_id}/permissions/{grantee_id}", {
        file_id: fileId,
        grantee_id: granteeId,
      }),
      { grantee_type: granteeType },
    ),
    opts,
  );
}

// ---------------------------------------------------------------------------
// Folder permissions (cascade to contents)
// ---------------------------------------------------------------------------

// Same as the file variants: response deliberately typed as the DB-row
// `CloudFilePermissionRow`, which disagrees with the contract's `PermissionRecord`.
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
): Promise<{ data: components["schemas"]["DeleteResponse"]; meta: ResponseMeta }> {
  const granteeType = params.granteeType ?? "user";
  // Contract-bound (`revoke_folder_permission_...`).
  return apiDelete(
    withQuery(
      buildPath("/folders/{folder_id}/permissions/{grantee_id}", {
        folder_id: folderId,
        grantee_id: granteeId,
      }),
      { grantee_type: granteeType },
    ),
    opts,
  );
}
