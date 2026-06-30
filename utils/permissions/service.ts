/**
 * Permission Service
 *
 * Every write operation routes through a SECURITY DEFINER RPC — no client ever
 * writes to the permissions table or resource visibility columns directly.
 *
 * Full RPC inventory:
 *   share_resource_with_user()    — grant user access (validates ownership)
 *   share_resource_with_org()     — grant org access (validates ownership + membership)
 *   update_permission_level()     — change user or org permission level (validates ownership)
 *   revoke_resource_access()      — remove a user's grant (validates ownership)
 *   revoke_resource_org_access()  — remove an org's grant (validates ownership)
 *   make_resource_public()        — set is_public = true on resource row (validates ownership)
 *   make_resource_private()       — set is_public = false on resource row (validates ownership)
 *   get_resource_permissions()    — list all grants with user/org details (owner-only)
 *   is_resource_owner()           — check ownership for any table
 *
 * Canonical-visibility resources (see VISIBILITY_ENUM_RESOURCE_TYPES, e.g.
 * `cx_conversation`): the row carries the `platform.visibility` enum
 * (`private < internal < link < public`) read by RLS via `iam.has_access`, and
 * the legacy `is_public` column is deprecated/ignored. For these, public toggle
 * read/write goes DIRECTLY to the `visibility` column (owner-only via the
 * owner-UPDATE RLS policy), NOT the `make_resource_*` RPCs.
 *
 * Visibility model (two tiers only):
 *   - Private: accessible only to owner + explicit user/org grants + hierarchy members
 *   - Public:  is_public = true on the resource row — readable by anyone including unauthenticated
 *   - is_public lives on the resource row, NOT the permissions table.
 *     Always read it via getResourceVisibility() — never from the permissions table.
 *   - The permissions table stores only explicit user/org grants.
 *   - check_resource_access() is the single RLS engine: evaluates all access paths
 *     (owner, assignee, direct grant, project, workspace, org hierarchy) in one query.
 */

import { supabase } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import {
  Permission,
  PermissionWithDetails,
  ResourceType,
  PermissionLevel,
  ShareWithUserOptions,
  ShareWithOrgOptions,
  MakePublicOptions,
  UpdatePermissionOptions,
  RevokeAccessOptions,
  CheckPermissionOptions,
  PermissionCheckResult,
  ShareActionResult,
  satisfiesPermissionLevel,
} from "./types";
import { getShareableResource } from "./registry";

type RpcPermissionRow =
  Database["public"]["Functions"]["get_resource_permissions"]["Returns"][number];
type PermissionsTableRow = Database["iam"]["Tables"]["permissions"]["Row"];

function errMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Unknown error";
}

/** Share / visibility RPCs return `Json` — narrow without assuming shape beyond optional success/error/message. */
function parseShareRpcResult(data: Json | null | undefined): {
  success: boolean;
  error?: string;
  message?: string;
} {
  if (
    data === null ||
    data === undefined ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return { success: false, error: "Invalid response" };
  }
  const o = data as Record<string, unknown>;
  const success = o.success === true;
  const err = typeof o.error === "string" ? o.error : undefined;
  const message = typeof o.message === "string" ? o.message : undefined;
  return { success, error: err, message };
}

// ============================================================================
// Resource Visibility (is_public lives on the resource row)
// ============================================================================

export interface ResourceVisibility {
  isPublic: boolean;
}

/**
 * Resource types whose row carries the canonical `platform.visibility` enum
 * (`private < internal < link < public`) instead of the legacy `is_public`
 * boolean. RLS reads `visibility` (via `iam.has_access`) for these; `is_public`
 * is deprecated and ignored. The owner-UPDATE RLS policy lets the owner write
 * `visibility` directly — so for these types we bypass the `make_resource_*`
 * RPCs (which only touch the now-ignored `is_public` column) and read/write the
 * `visibility` column directly. Public read works via the public-SELECT policy.
 *
 * Other resource types still flow through the registry + RPCs unchanged.
 */
const VISIBILITY_ENUM_RESOURCE_TYPES = new Set<string>([
  "cx_conversation",
  // The 2026 file-system canonicalization moved `files.files`/`files.folders`
  // onto the `platform.visibility` enum read by `iam.has_access` RLS. The
  // owner-UPDATE policy lets the owner write `visibility` directly, so public
  // toggles go straight to the column (via `.schema('files')`) — never the
  // `make_resource_*` RPCs, which only touch the now-ignored `is_public`.
  "file",
  "folder",
  // The 2026 canonical reorg moved these tables onto the platform.visibility
  // enum. RLS uses `visibility` (via iam.has_access), not `is_public`. The
  // make_resource_public/private RPCs still update visibility correctly via
  // the DB's resolve_shareable_resource, but isResourceOwner() on the FE must
  // use ownerColumn = "created_by", which the registry already reflects.
  "task",
  "agent",
  "agent_app",
  // 2026 reorg: notes moved public→workbench AND onto the platform.visibility enum.
  // Live workbench.notes has created_by + visibility only (no user_id / is_public),
  // so ownership must read created_by and public toggles write `visibility` directly.
  // The DB shareable_resource_registry row is still stale (user_id/is_public); this
  // override is the canonical handling, matching task/file/folder/agent.
  "note",
]);

function usesVisibilityEnum(resourceType: ResourceType): boolean {
  return VISIBILITY_ENUM_RESOURCE_TYPES.has(resourceType);
}

/**
 * Direct read/write of a `visibility`-enum resource's row. Owner-only writes are
 * enforced by RLS (`cx_conv_update`: `created_by = auth.uid()`), so a non-owner
 * UPDATE silently affects zero rows — surfaced as an error by the callers below.
 */
async function setVisibilityColumn(
  resourceType: ResourceType,
  resourceId: string,
  visibility: "private" | "internal" | "link" | "public",
): Promise<ShareActionResult> {
  const entry = getShareableResource(resourceType);
  const tableName = entry?.physicalTable ?? entry?.tableName ?? resourceType;
  const idColumn = entry?.idColumn ?? "id";
  const base = supabase as unknown as {
    schema: (s: string) => unknown;
  };
  const scoped = (entry?.schemaName ? base.schema(entry.schemaName) : supabase) as unknown as {
    from: (t: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (
          k: string,
          v: string,
        ) => {
          select: (col: string) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await scoped
    .from(tableName)
    .update({ visibility })
    .eq(idColumn, resourceId)
    .select("id");
  if (error) {
    return { success: false, error: errMessage(error) };
  }
  if (!data || data.length === 0) {
    return {
      success: false,
      error: "Not allowed — only the owner can change visibility.",
    };
  }
  return { success: true };
}

/**
 * Fetch is_public directly from the resource row.
 * Single cheap query — safe to call from list-item components like ShareButton.
 *
 * Uses the shareable_resource_registry to find the canonical table name AND
 * the actual is_public column name (some tables use `public` instead of
 * `is_public`). Returns `{ isPublic: false }` when the resource type either
 * isn't registered or has no public-visibility column.
 */
export async function getResourceVisibility(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ResourceVisibility> {
  try {
    const entry = getShareableResource(resourceType);
    // Canonical `visibility`-enum resources: "public" ⇒ isPublic. The legacy
    // `is_public` column is no longer read by RLS, so reading it would lie.
    if (usesVisibilityEnum(resourceType)) {
      const tableName = entry?.physicalTable ?? entry?.tableName ?? resourceType;
      const idColumn = entry?.idColumn ?? "id";
      const visBase = supabase as unknown as { schema: (s: string) => unknown };
      const visClient = (entry?.schemaName ? visBase.schema(entry.schemaName) : supabase) as unknown as {
        from: (t: string) => {
          select: (col: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
            };
          };
        };
      };
      const { data, error } = await visClient
        .from(tableName)
        .select("visibility")
        .eq(idColumn, resourceId)
        .maybeSingle<Record<string, string | null>>();
      if (error || !data) return { isPublic: false };
      return { isPublic: data["visibility"] === "public" };
    }
    if (!entry || !entry.isPublicColumn) {
      return { isPublic: false };
    }
    const pubBase = supabase as unknown as { schema: (s: string) => unknown };
    const client = (entry.schemaName ? pubBase.schema(entry.schemaName) : supabase) as unknown as {
      from: (t: string) => {
        select: (col: string) => {
          eq: (
            k: string,
            v: string,
          ) => {
            maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
          };
        };
      };
    };
    const { data, error } = await client
      .from(entry.physicalTable ?? entry.tableName)
      .select(entry.isPublicColumn)
      .eq(entry.idColumn, resourceId)
      .maybeSingle<Record<string, boolean | null>>();

    if (error || !data) return { isPublic: false };
    return { isPublic: data[entry.isPublicColumn] ?? false };
  } catch {
    return { isPublic: false };
  }
}

// ============================================================================
// Share — all routes through SECURITY DEFINER RPCs
// ============================================================================

/**
 * Grant a user access to a resource.
 * RPC validates: authenticated, valid level, resource exists, caller is owner, no duplicate.
 */
export async function shareWithUser(
  options: ShareWithUserOptions,
): Promise<ShareActionResult> {
  try {
    const { resourceType, resourceId, userId, permissionLevel } = options;

    const { data, error } = await supabase.rpc("share_resource_with_user", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_user_id: userId,
      p_permission_level: permissionLevel,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to share with user",
      };

    // Fire-and-forget notification — failure doesn't affect the grant
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const sharerName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email ||
          "Someone";
        fetch("/api/sharing/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientUserId: userId,
            resourceType,
            resourceId,
            sharerName,
          }),
        }).catch((err) => console.error("Sharing notification failed:", err));
      }
    });

    return {
      success: true,
      message: parsed.message || "Successfully shared with user",
    };
  } catch (error: unknown) {
    console.error("shareWithUser error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to share with user",
    };
  }
}

/**
 * Grant an organization access to a resource.
 * RPC validates: authenticated, valid level, resource exists, caller is owner,
 * caller is a member of the target org, no duplicate.
 */
export async function shareWithOrg(
  options: ShareWithOrgOptions,
): Promise<ShareActionResult> {
  try {
    const { resourceType, resourceId, organizationId, permissionLevel } =
      options;

    const { data, error } = await supabase.rpc("share_resource_with_org", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_org_id: organizationId,
      // omit → server applies the org module's default_permission.
      p_permission_level: permissionLevel,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to share with organization",
      };

    return {
      success: true,
      message: parsed.message || "Successfully shared with organization",
    };
  } catch (error: unknown) {
    console.error("shareWithOrg error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to share with organization",
    };
  }
}

/**
 * Make a resource readable by unauthenticated users.
 * Sets is_public = true on the resource row. RPC validates ownership.
 * The permissions table is NOT written to — is_public on the resource row is the source of truth.
 */
export async function makePublic(
  options: MakePublicOptions,
): Promise<ShareActionResult> {
  try {
    const { resourceType, resourceId } = options;

    // Canonical `visibility`-enum resources write `visibility = 'public'`
    // directly (owner-only via RLS). The `make_resource_public` RPC only sets
    // the deprecated `is_public`, which RLS no longer reads.
    if (usesVisibilityEnum(resourceType)) {
      const res = await setVisibilityColumn(resourceType, resourceId, "public");
      if (!res.success) {
        return { success: false, error: res.error || "Failed to make public" };
      }
      return { success: true, message: "Resource is now public" };
    }

    const { data, error } = await supabase.rpc("make_resource_public", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return { success: false, error: parsed.error || "Failed to make public" };

    return { success: true, message: "Resource is now public" };
  } catch (error: unknown) {
    console.error("makePublic error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to make public",
    };
  }
}

/**
 * Restrict a resource to explicit grants only.
 * Sets is_public = false on the resource row. RPC validates ownership.
 */
export async function makePrivate(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ShareActionResult> {
  try {
    // Canonical `visibility`-enum resources write `visibility = 'private'`
    // directly (owner-only via RLS); the RPC only touches deprecated `is_public`.
    if (usesVisibilityEnum(resourceType)) {
      const res = await setVisibilityColumn(resourceType, resourceId, "private");
      if (!res.success) {
        return { success: false, error: res.error || "Failed to make private" };
      }
      return { success: true, message: "Resource is now private" };
    }

    const { data, error } = await supabase.rpc("make_resource_private", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to make private",
      };

    return { success: true, message: "Resource is now private" };
  } catch (error: unknown) {
    console.error("makePrivate error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to make private",
    };
  }
}

// ============================================================================
// Revoke — all routes through SECURITY DEFINER RPCs
// ============================================================================

/**
 * Remove a user's explicit access grant.
 * RPC validates ownership before deleting.
 */
export async function revokeUserAccess(
  resourceType: ResourceType,
  resourceId: string,
  userId: string,
): Promise<ShareActionResult> {
  try {
    const { data, error } = await supabase.rpc("revoke_resource_access", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_user_id: userId,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to revoke access",
      };

    return { success: true, message: "Access revoked" };
  } catch (error: unknown) {
    console.error("revokeUserAccess error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to revoke user access",
    };
  }
}

/**
 * Remove an organization's explicit access grant.
 * RPC validates ownership before deleting.
 */
export async function revokeOrgAccess(
  resourceType: ResourceType,
  resourceId: string,
  organizationId: string,
): Promise<ShareActionResult> {
  try {
    const { data, error } = await supabase.rpc("revoke_resource_org_access", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_org_id: organizationId,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to revoke org access",
      };

    return { success: true, message: "Organization access revoked" };
  } catch (error: unknown) {
    console.error("revokeOrgAccess error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to revoke org access",
    };
  }
}

/**
 * Remove public access — alias for makePrivate.
 */
export async function revokePublicAccess(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ShareActionResult> {
  return makePrivate(resourceType, resourceId);
}

/**
 * Generic dispatcher — routes to the correct revoke function.
 */
export async function revokeAccess(
  options: RevokeAccessOptions,
): Promise<ShareActionResult> {
  const { resourceType, resourceId, userId, organizationId, isPublic } =
    options;

  if (userId) return revokeUserAccess(resourceType, resourceId, userId);
  if (organizationId)
    return revokeOrgAccess(resourceType, resourceId, organizationId);
  if (isPublic) return revokePublicAccess(resourceType, resourceId);

  return {
    success: false,
    error: "Must specify userId, organizationId, or isPublic",
  };
}

// ============================================================================
// Update — routes through SECURITY DEFINER RPC
// ============================================================================

/**
 * Change the permission level for an existing user or org grant.
 * RPC validates ownership before updating.
 */
export async function updatePermissionLevel(
  options: UpdatePermissionOptions,
): Promise<ShareActionResult> {
  try {
    const { resourceType, resourceId, userId, organizationId, newLevel } =
      options;

    if (!userId && !organizationId) {
      return { success: false, error: "Must specify userId or organizationId" };
    }

    const { data, error } = await supabase.rpc("update_permission_level", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_user_id: userId,
      p_target_org_id: organizationId,
      p_new_level: newLevel,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to update permission level",
      };

    return {
      success: true,
      message: parsed.message || "Permission level updated",
    };
  } catch (error: unknown) {
    console.error("updatePermissionLevel error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to update permission level",
    };
  }
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * List all grants for a resource (owner-only).
 * Uses get_resource_permissions() SECURITY DEFINER RPC — includes resolved
 * user/org display names. Returns empty for non-owners (RPC silently returns nothing).
 *
 * NOTE: Does not include is_public state — use getResourceVisibility() for that.
 */
export async function listPermissions(
  resourceType: ResourceType,
  resourceId: string,
): Promise<PermissionWithDetails[]> {
  try {
    const { data, error } = await supabase.rpc("get_resource_permissions", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });

    if (error) throw error;

    return (data || []).map(transformPermissionFromRpcRow);
  } catch (error: unknown) {
    console.error("listPermissions error:", error);
    return [];
  }
}

/** Alias kept for compatibility */
export const getResourcePermissions = listPermissions;

/**
 * Check if the current user is the owner of a resource.
 * Reads owner_column directly from the resource row — single index scan, no
 * RPC round-trip required.
 *
 * Uses the registry to find the canonical table name, id column, and owner
 * column so tables like flashcard_sets (set_id, not id) work correctly the
 * day they're added to the registry — without a code change here.
 */
export async function isResourceOwner(
  resourceType: ResourceType,
  resourceId: string,
): Promise<boolean> {
  try {
    const entry = getShareableResource(resourceType);
    if (!entry) return false;

    // Canonical `visibility`-enum resources own via `created_by` (trigger-stamped,
    // RLS-canonical), not the deprecated `user_id`/`owner_id` columns. The
    // registry's `ownerColumn` is already `created_by` for file/folder, but keep
    // the explicit guard so any other enum resource added later is covered too.
    const ownerColumn = usesVisibilityEnum(resourceType)
      ? "created_by"
      : entry.ownerColumn;

    // Resolve the real physical table + schema (file/folder live in `files.*`,
    // not `public`, and their `tableName` is the RLS key, not the table name).
    const tableName = entry.physicalTable ?? entry.tableName;
    const base = supabase as unknown as { schema: (s: string) => unknown };
    const client = (entry.schemaName ? base.schema(entry.schemaName) : supabase) as unknown as {
      from: (t: string) => {
        select: (col: string) => {
          eq: (
            k: string,
            v: string,
          ) => {
            maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
          };
        };
      };
    };
    const [
      { data: row },
      {
        data: { user },
      },
    ] = await Promise.all([
      client
        .from(tableName)
        .select(ownerColumn)
        .eq(entry.idColumn, resourceId)
        .maybeSingle<Record<string, string | null>>(),
      supabase.auth.getUser(),
    ]);

    return !!user && !!row && row[ownerColumn] === user.id;
  } catch {
    return false;
  }
}

/**
 * Get all resources explicitly shared with the current user.
 * Reads from the permissions table — reflects direct grants only,
 * not hierarchy-inherited access (project/workspace/org membership).
 */
export async function getSharedWithMe(
  resourceType?: ResourceType,
): Promise<Permission[]> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return [];

    let query = supabase
      .schema("iam").from("permissions")
      .select("*")
      .eq("granted_to_user_id", user.id);

    if (resourceType) query = query.eq("resource_type", resourceType);

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error) throw error;

    return (data || []).map(transformPermissionFromTableRow);
  } catch (error) {
    console.error("getSharedWithMe error:", error);
    return [];
  }
}

/**
 * Check if current user has a specific permission level on a resource.
 * Used for client-side gating — not a substitute for RLS.
 */
export async function checkPermission(
  options: CheckPermissionOptions,
): Promise<PermissionCheckResult> {
  try {
    const { resourceType, resourceId, requiredLevel = "viewer" } = options;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user)
      return { hasAccess: false, isOwner: false, reason: "Not authenticated" };

    const permissions = await listPermissions(resourceType, resourceId);

    const userPermission = permissions.find(
      (p) => p.grantedToUserId === user.id,
    );
    if (userPermission) {
      const hasAccess = satisfiesPermissionLevel(
        userPermission.permissionLevel,
        requiredLevel,
      );
      return {
        hasAccess,
        level: userPermission.permissionLevel,
        isOwner: false,
        reason: hasAccess
          ? "Direct user permission"
          : "Insufficient permission level",
      };
    }

    return {
      hasAccess: false,
      isOwner: false,
      reason: "No direct permission found",
    };
  } catch (error) {
    console.error("checkPermission error:", error);
    return {
      hasAccess: false,
      isOwner: false,
      reason: "Error checking permission",
    };
  }
}

/**
 * Batch grant access to multiple users in parallel.
 */
export async function batchShareWithUsers(
  resourceType: ResourceType,
  resourceId: string,
  userIds: string[],
  permissionLevel: PermissionLevel,
): Promise<ShareActionResult[]> {
  return Promise.all(
    userIds.map((userId) =>
      shareWithUser({ resourceType, resourceId, userId, permissionLevel }),
    ),
  );
}

// ============================================================================
// Internal Helpers
// ============================================================================

function parseNestedUser(
  j: Json,
): PermissionWithDetails["grantedToUser"] | undefined {
  if (
    j === null ||
    j === undefined ||
    typeof j !== "object" ||
    Array.isArray(j)
  )
    return undefined;
  const o = j as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.email !== "string") return undefined;
  return {
    id: o.id,
    email: o.email,
    displayName: typeof o.displayName === "string" ? o.displayName : undefined,
    avatarUrl: typeof o.avatarUrl === "string" ? o.avatarUrl : undefined,
  };
}

function parseNestedOrg(
  j: Json,
): PermissionWithDetails["grantedToOrganization"] | undefined {
  if (
    j === null ||
    j === undefined ||
    typeof j !== "object" ||
    Array.isArray(j)
  )
    return undefined;
  const o = j as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.name !== "string" ||
    typeof o.slug !== "string"
  )
    return undefined;
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    logoUrl: typeof o.logoUrl === "string" ? o.logoUrl : undefined,
  };
}

function transformPermissionFromRpcRow(
  row: RpcPermissionRow,
): PermissionWithDetails {
  return {
    id: row.id,
    resourceType: row.resource_type as ResourceType,
    resourceId: row.resource_id,
    grantedToUserId: row.granted_to_user_id || undefined,
    grantedToOrganizationId: row.granted_to_organization_id || undefined,
    isPublic: row.is_public,
    permissionLevel: row.permission_level as PermissionLevel,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    createdBy: undefined,
    grantedToUser: parseNestedUser(row.granted_to_user),
    grantedToOrganization: parseNestedOrg(row.granted_to_organization),
  };
}

function transformPermissionFromTableRow(row: PermissionsTableRow): Permission {
  return {
    id: row.id,
    resourceType: row.resource_type as ResourceType,
    resourceId: row.resource_id,
    grantedToUserId: row.granted_to_user_id,
    grantedToOrganizationId: row.granted_to_organization_id,
    isPublic: row.is_public ?? undefined,
    permissionLevel: row.permission_level as PermissionLevel,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    createdBy: row.created_by ?? undefined,
  };
}

// Legacy getTableName() removed — the registry (utils/permissions/registry.ts)
// is the single source of truth. Use getShareableResource() / resolveTableName()
// from './registry' if you need the canonical table name on the client.
