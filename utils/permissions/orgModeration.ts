/**
 * Org-share moderation helpers.
 *
 * When a member shares one of *their own* resources with an org, it lands in
 * the shared `permissions` table as an org grant. Org owners/admins can review
 * those grants — leave them active, hold them as pending, or reject them.
 * Rejected grants stop conferring access (enforced in `has_permission` /
 * `check_resource_access`) and drop out of the org's resource listings.
 *
 * Reads go straight through the (RLS-guarded) `permissions` table — any org
 * member may see grants targeting their org. The write goes through the
 * `review_org_share` SECURITY DEFINER RPC, which enforces owner/admin.
 */

import { supabase } from "@/utils/supabase/client";

export type OrgShareStatus = "active" | "pending" | "rejected";

export interface OrgShareGrant {
  permissionId: string;
  /** Canonical Postgres table name stored in permissions.resource_type. */
  resourceTable: string;
  resourceId: string;
  permissionLevel: "viewer" | "editor" | "admin";
  status: OrgShareStatus;
  /** The member who contributed the resource (auth.users id). */
  sharedBy: string | null;
  createdAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

/**
 * All resources contributed to an org via the permissions table, every status
 * included (so admins can see + restore rejected ones).
 */
export async function listOrgShareGrants(
  orgId: string,
): Promise<OrgShareGrant[]> {
  if (!orgId) return [];
  const { data, error } = await supabase
    .schema("iam").from("permissions")
    .select(
      "id, resource_type, resource_id, permission_level, status, created_by, created_at, reviewed_by, reviewed_at, review_note",
    )
    .eq("granted_to_organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orgModeration] listOrgShareGrants failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      permissionId: String(r.id),
      resourceTable: String(r.resource_type),
      resourceId: String(r.resource_id),
      permissionLevel: (r.permission_level as OrgShareGrant["permissionLevel"]) ?? "viewer",
      status: (r.status as OrgShareStatus) ?? "active",
      sharedBy: (r.created_by as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      reviewedBy: (r.reviewed_by as string | null) ?? null,
      reviewedAt: (r.reviewed_at as string | null) ?? null,
      reviewNote: (r.review_note as string | null) ?? null,
    };
  });
}

/**
 * Resource ids of one canonical table already shared (non-rejected) with an
 * org. Keyed by table name directly — no dependency on the TS shareable-type
 * mirror, so it works for every registered table. Used to disable
 * already-shared items in the contribute picker.
 */
export async function listOrgSharedIdsForTable(
  orgId: string,
  tableName: string,
): Promise<Set<string>> {
  if (!orgId || !tableName) return new Set();
  const { data, error } = await supabase
    .schema("iam").from("permissions")
    .select("resource_id")
    .eq("granted_to_organization_id", orgId)
    .eq("resource_type", tableName)
    .neq("status", "rejected");
  if (error) {
    console.error("[orgModeration] listOrgSharedIdsForTable failed:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? []).map((r) => String((r as { resource_id: string }).resource_id)),
  );
}

export interface ReviewResult {
  success: boolean;
  status?: OrgShareStatus;
  error?: string;
}

/**
 * Remove an org's access to a resource (the owner unsharing it). Keyed on the
 * canonical table name; the `revoke_resource_org_access` RPC resolver accepts
 * it and enforces that the caller owns the resource.
 */
export async function revokeOrgShare(
  resourceTable: string,
  resourceId: string,
  orgId: string,
): Promise<ReviewResult> {
  try {
    const { data, error } = await supabase.rpc("revoke_resource_org_access", {
      p_resource_type: resourceTable,
      p_resource_id: resourceId,
      p_target_org_id: orgId,
    });
    if (error) throw error;
    const parsed = (data ?? {}) as { success?: boolean; error?: string };
    if (!parsed.success) {
      return { success: false, error: parsed.error ?? "Failed to unshare" };
    }
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to unshare";
    console.error("[orgModeration] revokeOrgShare failed:", message);
    return { success: false, error: message };
  }
}

/** Set the moderation status of a single org grant. Owner/admin only (RPC-enforced). */
export async function reviewOrgShare(
  permissionId: string,
  status: OrgShareStatus,
  note?: string,
): Promise<ReviewResult> {
  try {
    const { data, error } = await supabase.rpc("review_org_share", {
      p_permission_id: permissionId,
      p_status: status,
      p_note: note ?? null,
    });
    if (error) throw error;
    const parsed = (data ?? {}) as { success?: boolean; error?: string; status?: OrgShareStatus };
    if (!parsed.success) {
      return { success: false, error: parsed.error ?? "Failed to update share" };
    }
    return { success: true, status: parsed.status ?? status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update share";
    console.error("[orgModeration] reviewOrgShare failed:", message);
    return { success: false, error: message };
  }
}
