/**
 * Org-shared resources — count/list helpers
 *
 * These helpers query the canonical `permissions` table for items explicitly
 * shared with a given organization. They are intentionally generic across
 * resource types (driven by `shareable_resource_registry`).
 *
 * Pairs with utils/permissions/service.ts (which handles user-level grants).
 *
 * Counts include rows in `permissions` where `granted_to_organization_id = orgId`
 * for the specified resource_type. They do NOT count items owned by the org
 * via a `resource.organization_id` column — that's a per-feature concept and
 * each org page that needs it composes the two queries.
 */

import { supabase } from "@/utils/supabase/client";
import type { ResourceType } from "./registry";
import { resolveTableName } from "./registry";

export interface OrgSharedResourceRef {
  resourceId: string;
  permissionLevel: "viewer" | "editor" | "admin";
  permissionId: string;
  createdAt: string | null;
}

/**
 * Count distinct resources of `resourceType` explicitly shared with `orgId`.
 * Returns 0 on any failure — this powers tile counts where a hard error
 * shouldn't blank the whole org overview.
 */
export async function countOrgSharedResources(
  orgId: string,
  resourceType: ResourceType,
): Promise<number> {
  if (!orgId) return 0;
  const canonicalType = resolveTableName(resourceType);
  const { count, error } = await supabase
    .from("permissions")
    .select("resource_id", { count: "exact", head: true })
    .eq("granted_to_organization_id", orgId)
    .eq("resource_type", canonicalType);
  if (error) {
    console.error(
      `[orgResources] count(${resourceType}) failed:`,
      error.message,
    );
    return 0;
  }
  return count ?? 0;
}

/**
 * List all resources of `resourceType` shared with `orgId`. Each row is a
 * lightweight reference — callers join back to the actual resource table to
 * load display fields. Sorted newest-shared first.
 */
export async function listOrgSharedResources(
  orgId: string,
  resourceType: ResourceType,
): Promise<OrgSharedResourceRef[]> {
  if (!orgId) return [];
  const canonicalType = resolveTableName(resourceType);
  const { data, error } = await supabase
    .from("permissions")
    .select("id, resource_id, permission_level, created_at")
    .eq("granted_to_organization_id", orgId)
    .eq("resource_type", canonicalType)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(
      `[orgResources] list(${resourceType}) failed:`,
      error.message,
    );
    return [];
  }
  return (data ?? []).map((row) => ({
    resourceId: row.resource_id,
    permissionLevel: row.permission_level as "viewer" | "editor" | "admin",
    permissionId: row.id,
    createdAt: row.created_at ?? null,
  }));
}
