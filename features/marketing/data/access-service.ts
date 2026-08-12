import { createClient } from "@/utils/supabase/client";
import { iamDb } from "@/utils/supabase/iamDb";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { operationFailed } from "@/utils/errors";

export type SiteGrantTarget = "user" | "organization";
export type SiteGrantLevel = "viewer" | "editor" | "admin";

export interface SitePermissionGrant {
  resource_id: string;
  resource_type: string;
  grantee_id: string;
  grantee_type: string;
  permission_level: string;
  granted_by: string | null;
  expires_at: string | null;
}

function permissionRows(value: unknown): SitePermissionGrant[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is SitePermissionGrant =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as Record<string, unknown>).grantee_id === "string" &&
      typeof (row as Record<string, unknown>).grantee_type === "string" &&
      typeof (row as Record<string, unknown>).permission_level === "string",
  );
}

function permissionRow(value: unknown): SitePermissionGrant {
  const row = permissionRows(Array.isArray(value) ? value : [value])[0];
  if (!row) {
    throw new Error("The permission service returned an invalid grant.");
  }
  return row;
}

export async function listSitePermissions(
  siteId: string,
): Promise<SitePermissionGrant[]> {
  const supabase = createClient();
  await requireAuthenticatedSupabaseSession(supabase);
  const { data, error } = await iamDb(supabase).rpc(
    "fn_list_resource_permissions",
    {
      p_resource_type: "web_site",
      p_resource_id: siteId,
    },
  );
  if (error) throw operationFailed("load who can reach this site", error);
  return permissionRows(data);
}

export async function grantSitePermission(input: {
  siteId: string;
  granteeId: string;
  granteeType: SiteGrantTarget;
  level: SiteGrantLevel;
  expiresAt?: string | null;
}): Promise<SitePermissionGrant> {
  const supabase = createClient();
  await requireAuthenticatedSupabaseSession(supabase);
  const { data, error } = await iamDb(supabase).rpc(
    "fn_grant_resource_permission",
    {
      p_resource_type: "web_site",
      p_resource_id: input.siteId,
      p_grantee_id: input.granteeId,
      p_grantee_type: input.granteeType,
      p_level: input.level,
      p_expires_at: input.expiresAt || undefined,
    },
  );
  if (error) throw operationFailed("share this site", error);
  return permissionRow(data);
}

export async function revokeSitePermission(input: {
  siteId: string;
  granteeId: string;
  granteeType: SiteGrantTarget;
}): Promise<boolean> {
  const supabase = createClient();
  await requireAuthenticatedSupabaseSession(supabase);
  const { data, error } = await iamDb(supabase).rpc(
    "fn_revoke_resource_permission",
    {
      p_resource_type: "web_site",
      p_resource_id: input.siteId,
      p_grantee_id: input.granteeId,
      p_grantee_type: input.granteeType,
    },
  );
  if (error) throw operationFailed("remove that person's access", error);
  return Boolean(data);
}
