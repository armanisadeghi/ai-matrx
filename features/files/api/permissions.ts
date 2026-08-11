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
import type {
  GrantPermissionRequest,
  IamResourcePermissionRpcRow,
} from "@/features/files/types";

/**
 * What the user reads when one of the three RPCs fails. The driver's own text
 * ("permission denied for schema iam", "PGRST202 …") is never shown: the RPC
 * refuses unless the caller has 'admin' on the resource, so the only honest
 * thing to say is that the sharing settings didn't load or the change didn't
 * stick. The raw PostgREST error is still captured in full by the client-wide
 * proxy in `lib/diagnostics/supabaseErrorCapture.ts`, so nothing is lost — it
 * just lands in the Error Inspector instead of in front of a person.
 */
const SHARING_UNAVAILABLE = {
  file: {
    list: "We couldn't load who this file is shared with. You may not be allowed to manage its sharing.",
    grant: "We couldn't share this file. You may not be allowed to manage its sharing.",
    revoke: "We couldn't remove that person's access to this file. You may not be allowed to manage its sharing.",
  },
  folder: {
    list: "We couldn't load who this folder is shared with. You may not be allowed to manage its sharing.",
    grant: "We couldn't share this folder. You may not be allowed to manage its sharing.",
    revoke: "We couldn't remove that person's access to this folder. You may not be allowed to manage its sharing.",
  },
} as const;

function parsePermissionRpcRows(data: unknown): IamResourcePermissionRpcRow[] {
  if (!Array.isArray(data)) return [];
  return data as unknown as IamResourcePermissionRpcRow[];
}

function parsePermissionRpcRow(data: unknown): IamResourcePermissionRpcRow {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("fn_grant_resource_permission returned an invalid row");
  }
  return data as unknown as IamResourcePermissionRpcRow;
}

async function listPermissions(
  resourceType: "file" | "folder",
  resourceId: string,
): Promise<IamResourcePermissionRpcRow[]> {
  const supabase = createClient();
  const { data, error } = await iamDb(supabase).rpc(
    "fn_list_resource_permissions",
    {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    },
  );
  if (error) throw new Error(SHARING_UNAVAILABLE[resourceType].list);
  return parsePermissionRpcRows(data);
}

async function grantPermission(
  resourceType: "file" | "folder",
  resourceId: string,
  body: GrantPermissionRequest,
): Promise<IamResourcePermissionRpcRow> {
  const supabase = createClient();
  const { data, error } = await iamDb(supabase).rpc(
    "fn_grant_resource_permission",
    {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_grantee_id: body.grantee_id,
      p_grantee_type: body.grantee_type ?? "user",
      p_level: body.level ?? "read",
      p_expires_at: body.expires_at ?? undefined,
    },
  );
  if (error) throw new Error(SHARING_UNAVAILABLE[resourceType].grant);
  return parsePermissionRpcRow(data);
}

async function revokePermission(
  resourceType: "file" | "folder",
  resourceId: string,
  granteeId: string,
  granteeType: "user" | "group" = "user",
): Promise<{ deleted: boolean }> {
  const supabase = createClient();
  const { data, error } = await iamDb(supabase).rpc(
    "fn_revoke_resource_permission",
    {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_grantee_id: granteeId,
      // The user-group ACL tier is removed DB-side; 'group' has no meaningful
      // target column, so it's treated the same as the default 'user' grantee.
      p_grantee_type: granteeType === "group" ? "user" : granteeType,
    },
  );
  if (error) throw new Error(SHARING_UNAVAILABLE[resourceType].revoke);
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
): Promise<{ data: IamResourcePermissionRpcRow[] }> {
  return { data: await listPermissions("file", fileId) };
}

export async function grantFilePermission(
  fileId: string,
  body: GrantPermissionRequest,
  _opts?: unknown,
): Promise<{ data: IamResourcePermissionRpcRow }> {
  return { data: await grantPermission("file", fileId, body) };
}

export async function revokeFilePermission(
  fileId: string,
  granteeId: string,
  params: { granteeType?: "user" | "group" } = {},
  _opts?: unknown,
): Promise<{ data: { deleted: boolean } }> {
  return {
    data: await revokePermission(
      "file",
      fileId,
      granteeId,
      params.granteeType ?? "user",
    ),
  };
}

// ---------------------------------------------------------------------------
// Folder permissions (cascade to contents)
// ---------------------------------------------------------------------------

export async function listFolderPermissions(
  folderId: string,
  _opts?: unknown,
): Promise<{ data: IamResourcePermissionRpcRow[] }> {
  return { data: await listPermissions("folder", folderId) };
}

export async function grantFolderPermission(
  folderId: string,
  body: GrantPermissionRequest,
  _opts?: unknown,
): Promise<{ data: IamResourcePermissionRpcRow }> {
  return { data: await grantPermission("folder", folderId, body) };
}

export async function revokeFolderPermission(
  folderId: string,
  granteeId: string,
  params: { granteeType?: "user" | "group" } = {},
  _opts?: unknown,
): Promise<{ data: { deleted: boolean } }> {
  return {
    data: await revokePermission(
      "folder",
      folderId,
      granteeId,
      params.granteeType ?? "user",
    ),
  };
}
