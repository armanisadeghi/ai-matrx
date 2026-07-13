/**
 * features/files/api/permissions.ts
 *
 * Grant / revoke permissions on files and folders. Direct-to-Supabase:
 * `iam.fn_list_resource_permissions` / `fn_grant_resource_permission` /
 * `fn_revoke_resource_permission` mirror the retired Python
 * `PermissionsManager` exactly — every call requires 'admin' access on the
 * resource via `iam.has_access(type, id, 'admin')`, the same auth.uid()-based
 * resolver RLS itself calls. Identity from auth.uid() only.
 */

import { createClient } from "@/utils/supabase/client";
import { iamDb } from "@/utils/supabase/iamDb";
import type { CloudFilePermissionRow, GrantPermissionRequest } from "@/features/files/types";

interface RpcPermissionRow {
  resource_id: string;
  resource_type: string;
  grantee_id: string;
  grantee_type: string;
  permission_level: string;
  granted_by: string | null;
  expires_at: string | null;
}

async function listPermissions(
  resourceType: "file" | "folder",
  resourceId: string,
): Promise<CloudFilePermissionRow[]> {
  const supabase = createClient();
  const { data, error } = await iamDb(supabase).rpc("fn_list_resource_permissions", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
  });
  if (error) throw new Error(error.message);
  return (data as unknown as RpcPermissionRow[]) ?? [];
}

async function grantPermission(
  resourceType: "file" | "folder",
  resourceId: string,
  body: GrantPermissionRequest,
): Promise<CloudFilePermissionRow> {
  const supabase = createClient();
  const { data, error } = await iamDb(supabase).rpc("fn_grant_resource_permission", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_grantee_id: body.grantee_id,
    p_grantee_type: body.grantee_type ?? "user",
    p_level: body.level ?? "read",
    p_expires_at: body.expires_at ?? undefined,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CloudFilePermissionRow;
}

async function revokePermission(
  resourceType: "file" | "folder",
  resourceId: string,
  granteeId: string,
  granteeType: "user" | "group" = "user",
): Promise<{ deleted: boolean }> {
  const supabase = createClient();
  const { data, error } = await iamDb(supabase).rpc("fn_revoke_resource_permission", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_grantee_id: granteeId,
    // The user-group ACL tier is removed DB-side; 'group' has no meaningful
    // target column, so it's treated the same as the default 'user' grantee.
    p_grantee_type: granteeType === "group" ? "user" : granteeType,
  });
  if (error) throw new Error(error.message);
  return { deleted: Boolean(data) };
}

// ---------------------------------------------------------------------------
// File permissions
// ---------------------------------------------------------------------------

// `opts` is accepted-and-ignored on every export below — callers still pass
// the old python-client `{ requestId }` shape (features/files/redux/thunks.ts
// uses it for its own request ledger, not the network call itself), and
// dropping the parameter would force every call site to change for no
// behavioral gain. It plays no role in a direct-Supabase call.

export async function listFilePermissions(
  fileId: string,
  _opts?: unknown,
): Promise<{ data: CloudFilePermissionRow[] }> {
  return { data: await listPermissions("file", fileId) };
}

export async function grantFilePermission(
  fileId: string,
  body: GrantPermissionRequest,
  _opts?: unknown,
): Promise<{ data: CloudFilePermissionRow }> {
  return { data: await grantPermission("file", fileId, body) };
}

export async function revokeFilePermission(
  fileId: string,
  granteeId: string,
  params: { granteeType?: "user" | "group" } = {},
  _opts?: unknown,
): Promise<{ data: { deleted: boolean } }> {
  return {
    data: await revokePermission("file", fileId, granteeId, params.granteeType ?? "user"),
  };
}

// ---------------------------------------------------------------------------
// Folder permissions (cascade to contents)
// ---------------------------------------------------------------------------

export async function listFolderPermissions(
  folderId: string,
  _opts?: unknown,
): Promise<{ data: CloudFilePermissionRow[] }> {
  return { data: await listPermissions("folder", folderId) };
}

export async function grantFolderPermission(
  folderId: string,
  body: GrantPermissionRequest,
  _opts?: unknown,
): Promise<{ data: CloudFilePermissionRow }> {
  return { data: await grantPermission("folder", folderId, body) };
}

export async function revokeFolderPermission(
  folderId: string,
  granteeId: string,
  params: { granteeType?: "user" | "group" } = {},
  _opts?: unknown,
): Promise<{ data: { deleted: boolean } }> {
  return {
    data: await revokePermission("folder", folderId, granteeId, params.granteeType ?? "user"),
  };
}
