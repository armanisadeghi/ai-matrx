/**
 * Organization Service
 *
 * Complete service layer for organization management including:
 * - Organization CRUD operations
 * - Member management
 * - Invitation system
 * - Role management
 *
 * Based on specifications from docs/pending/org-management.md
 */

import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import { requireUserId } from "@/utils/auth/getUserId";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import {
  invitationsService,
  type Invitation,
} from "@/features/organizations/service/invitationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { Database } from "@/types/database.types";
import { isJsonObject } from "@/types/json";
import {
  Organization,
  OrganizationWithRole,
  OrganizationMember,
  OrganizationMemberWithUser,
  OrganizationInvitation,
  OrganizationInvitationWithOrg,
  OrgRole,
  CreateOrganizationOptions,
  UpdateOrganizationOptions,
  InviteMemberOptions,
  OrganizationResult,
  InvitationResult,
  OperationResult,
  validateOrgName,
  validateOrgSlug,
  validateEmail,
  generateSlug,
  toOrgRole,
} from "./types";

// ============================================================================
// Organization CRUD Operations
// ============================================================================

/**
 * Create a new organization
 * @param options Organization creation options
 * @returns Organization result
 */
export async function createOrganization(
  options: CreateOrganizationOptions,
): Promise<OrganizationResult> {
  try {
    const { name, slug, description, logoUrl, logoFileId, website, settings } =
      options;

    // Validate
    const nameValidation = validateOrgName(name);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    const slugValidation = validateOrgSlug(slug);
    if (!slugValidation.valid) {
      return { success: false, error: slugValidation.error };
    }

    // Check slug availability
    const slugAvailable = await isSlugAvailable(slug);
    if (!slugAvailable) {
      return { success: false, error: "Slug is already taken" };
    }

    // The organization and first owner membership are created in one database
    // transaction. The RPC derives the owner from auth.uid(); callers cannot
    // create an ownerless organization or name a different initial owner.
    const { data: org, error: orgError } = await supabase.rpc("org_create", {
      p_name: name,
      p_slug: slug,
      p_description: description,
      p_logo_url: logoUrl,
      p_logo_file_id: logoFileId,
      p_website: website,
      p_settings: settings || {},
    });

    if (orgError) {
      console.error("Error creating organization:", orgError.message);
      // PostgreSQL unique violation (23505) on the slug column
      if (
        orgError.code === "23505" &&
        orgError.message?.toLowerCase().includes("slug")
      ) {
        return {
          success: false,
          error:
            "That URL slug is already taken. Please choose a different one.",
        };
      }
      return {
        success: false,
        error: orgError.message || "Failed to create organization",
      };
    }

    if (!org) {
      console.error("Organization created but no data returned");
      return {
        success: false,
        error: "Organization created but no data returned",
      };
    }

    return {
      success: true,
      message: "Organization created successfully",
      organization: transformOrganizationFromDb(org),
    };
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error creating organization:", err);
    return {
      success: false,
      error: err.message || "Failed to create organization",
    };
  }
}

/**
 * Update an organization
 * @param orgId Organization ID
 * @param updates Update options
 * @returns Organization result
 */
export async function updateOrganization(
  orgId: string,
  updates: UpdateOrganizationOptions,
): Promise<OrganizationResult> {
  try {
    const updateData: Database["iam"]["Tables"]["organizations"]["Update"] = {};

    if (updates.name) {
      const validation = validateOrgName(updates.name);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      updateData.name = updates.name;
    }

    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.logoUrl !== undefined) updateData.logo_url = updates.logoUrl;
    if (updates.logoFileId !== undefined)
      updateData.logo_file_id = updates.logoFileId;
    if (updates.website !== undefined) updateData.website = updates.website;
    if (updates.settings !== undefined) updateData.settings = updates.settings;

    const { data, error } = await supabase
      .schema("iam")
      .from("organizations")
      .update(updateData)
      .eq("id", orgId)
      .select()
      .single();

    if (error) throw pgErrorToError(error);

    return {
      success: true,
      message: "Organization updated successfully",
      organization: transformOrganizationFromDb(data),
    };
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error updating organization:", err);
    return {
      success: false,
      error: err.message || "Failed to update organization",
    };
  }
}

/**
 * Delete an organization (owner only)
 * @param orgId Organization ID
 * @returns Operation result
 */
export async function deleteOrganization(
  orgId: string,
): Promise<OperationResult> {
  try {
    // Check if personal org
    const { data: org } = await supabase
      .schema("iam")
      .from("organizations")
      .select("is_personal")
      .eq("id", orgId)
      .single();

    if (org?.is_personal) {
      return { success: false, error: "Cannot delete personal organization" };
    }

    const { error } = await supabase
      .schema("iam")
      .from("organizations")
      .delete()
      .eq("id", orgId);

    if (error) throw pgErrorToError(error);

    return {
      success: true,
      message: "Organization deleted successfully",
    };
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error deleting organization:", err);
    return {
      success: false,
      error: err.message || "Failed to delete organization",
    };
  }
}

/**
 * Get a single organization
 * @param orgId Organization ID
 * @returns Organization or null
 */
export async function getOrganization(
  orgId: string,
): Promise<Organization | null> {
  try {
    const { data, error } = await supabase
      .schema("iam")
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .single();

    if (error) throw pgErrorToError(error);
    return transformOrganizationFromDb(data);
  } catch (error) {
    console.error("Error fetching organization:", error);
    return null;
  }
}

/**
 * Get an organization by slug
 * @param slug Organization slug
 * @returns Organization or null
 */
export async function getOrganizationBySlug(
  slug: string,
): Promise<Organization | null> {
  const { data, error } = await supabase
    .schema("iam")
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error(
      "Error fetching organization by slug:",
      pgErrorToError(error),
    );
    return null;
  }
  if (!data) return null;
  return transformOrganizationFromDb(data);
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an organization from either a UUID or a slug.
 * UUID format is detected via regex; anything else is treated as a slug.
 */
export async function getOrganizationBySlugOrId(
  slugOrId: string,
): Promise<Organization | null> {
  if (UUID_REGEX.test(slugOrId)) {
    return getOrganization(slugOrId);
  }
  return getOrganizationBySlug(slugOrId);
}

/**
 * Get all organizations for current user
 * @returns Array of organizations with user's role
 */
export async function getUserOrganizations(): Promise<OrganizationWithRole[]> {
  try {
    requireUserId();

    // Canonical membership read — the current user's org memberships from
    // iam.memberships via the mbr_* RPCs (org membership row: container_type
    // 'organization', container_id = organization_id). No cross-schema embed of
    // `organizations` — we resolve those in a second public-table read.
    const membersResult = await membershipsService.forUser("organization");
    if (isScopesRpcErr(membersResult)) {
      console.error("Error fetching user organizations:", membersResult.error);
      return [];
    }

    const memberships = membersResult.data.memberships;
    if (memberships.length === 0) return [];

    const roleByOrgId = new Map<string, OrgRole>();
    for (const m of memberships) {
      roleByOrgId.set(m.containerId, toOrgRole(m.role));
    }
    const orgIds = [...roleByOrgId.keys()];

    // Resolve the org rows (public table — direct read, RLS-scoped).
    const { data: orgRows, error: orgsError } = await supabase
      .schema("iam")
      .from("organizations")
      .select("*")
      .in("id", orgIds);
    if (orgsError) {
      console.error("Error fetching organizations:", orgsError.message);
      throw pgErrorToError(orgsError);
    }

    // Batch member counts — one round-trip instead of N.
    const countsResult = await membershipsService.counts(
      "organization",
      orgIds,
    );
    const countByOrgId = new Map<string, number>();
    if (!isScopesRpcErr(countsResult)) {
      for (const c of countsResult.data.counts) {
        countByOrgId.set(c.containerId, c.memberCount);
      }
    }

    const orgs: OrganizationWithRole[] = (orgRows ?? []).map((row) => {
      const org = transformOrganizationFromDb(row);
      return {
        ...org,
        role: roleByOrgId.get(org.id) ?? "member",
        memberCount: countByOrgId.get(org.id) ?? 0,
      };
    });

    // Sort: personal first, then by name
    return orgs.sort((a, b) => {
      if (a.isPersonal && !b.isPersonal) return -1;
      if (!a.isPersonal && b.isPersonal) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error: unknown) {
    // Silently handle if organizations table doesn't exist yet
    const err = pgErrorToError(error);
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (
      code === "42P01" ||
      err.message.includes("relation") ||
      err.message.includes("does not exist")
    ) {
      return [];
    }
    console.error("Error in getUserOrganizations:", err);
    return [];
  }
}

/**
 * Check if a slug is available.
 * Uses a SECURITY DEFINER RPC so the check bypasses RLS — otherwise the
 * client-side Supabase query can only see orgs the current user belongs to,
 * which makes every slug look "available" even when it isn't.
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("check_org_slug_available", {
      slug_to_check: slug,
    });

    if (error) {
      console.warn("isSlugAvailable RPC error:", error.message);
      // Fall back to optimistic "available"; the insert will catch duplicates.
      return true;
    }

    return data === true;
  } catch {
    return true;
  }
}

// ============================================================================
// Member Management
// ============================================================================

/**
 * Get all members of an organization
 * Uses RPC function to securely fetch user details from auth.users
 * @param orgId Organization ID
 * @returns Array of members with user details
 */
export async function getOrganizationMembers(
  orgId: string,
): Promise<OrganizationMemberWithUser[]> {
  try {
    const { data, error } = await supabase.rpc(
      "get_organization_members_with_users",
      { p_org_id: orgId },
    );

    if (error) throw pgErrorToError(error);

    // Transform RPC result to application format
    return data.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: toOrgRole(row.role),
      joinedAt: row.joined_at,
      invitedBy: row.invited_by,
      user: {
        id: row.user_id,
        email: row.user_email || "",
        displayName: row.user_display_name || undefined,
        avatarUrl: row.user_avatar_url || undefined,
      },
    }));
  } catch (error) {
    console.error("Error fetching organization members:", error);
    return [];
  }
}

/**
 * Update a member's role
 * @param orgId Organization ID
 * @param userId User ID
 * @param newRole New role
 * @returns Operation result
 */
export async function updateMemberRole(
  orgId: string,
  userId: string,
  newRole: OrgRole,
): Promise<OperationResult> {
  try {
    // Prevent changing the last owner. Read the org's members via the canonical
    // membership RPC (iam.memberships).
    if (newRole !== "owner") {
      const membersResult = await membershipsService.listForContainer(
        "organization",
        orgId,
      );
      if (isScopesRpcErr(membersResult)) {
        return { success: false, error: membersResult.error.message };
      }
      const owners = membersResult.data.members.filter(
        (m) => m.role === "owner",
      );
      const target = membersResult.data.members.find(
        (m) => m.userId === userId,
      );
      if (owners.length === 1 && target?.role === "owner") {
        return {
          success: false,
          error: "Cannot change role of the last owner",
        };
      }
    }

    // Canonical role update (org-access checked inside the RPC).
    const updateResult = await membershipsService.updateRole({
      containerType: "organization",
      containerId: orgId,
      userId,
      role: newRole,
    });

    if (isScopesRpcErr(updateResult)) {
      console.error("Error updating member role:", updateResult.error);
      return {
        success: false,
        error:
          updateResult.error.message ||
          "Unable to update member role. You may not have permission to perform this action.",
      };
    }

    return {
      success: true,
      message: "Member role updated successfully",
    };
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error updating member role:", err);
    return {
      success: false,
      error: err.message || "Failed to update member role",
    };
  }
}

/**
 * Remove a member from an organization
 * @param orgId Organization ID
 * @param userId User ID
 * @returns Operation result
 */
export async function removeMember(
  orgId: string,
  userId: string,
): Promise<OperationResult> {
  try {
    // Prevent removing the last owner. Read members via the canonical RPC.
    const membersResult = await membershipsService.listForContainer(
      "organization",
      orgId,
    );
    if (isScopesRpcErr(membersResult)) {
      return { success: false, error: membersResult.error.message };
    }
    const target = membersResult.data.members.find((m) => m.userId === userId);
    if (target?.role === "owner") {
      const owners = membersResult.data.members.filter(
        (m) => m.role === "owner",
      );
      if (owners.length === 1) {
        return { success: false, error: "Cannot remove the last owner" };
      }
    }

    // Canonical soft-delete (org-access checked inside the RPC).
    const removeResult = await membershipsService.remove({
      containerType: "organization",
      containerId: orgId,
      userId,
    });

    if (isScopesRpcErr(removeResult)) {
      console.error("Error removing member:", removeResult.error);
      return {
        success: false,
        error:
          removeResult.error.message ||
          "Unable to remove member. You may not have permission to perform this action.",
      };
    }

    return {
      success: true,
      message: "Member removed successfully",
    };
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error removing member:", err);
    return {
      success: false,
      error: err.message || "Failed to remove member",
    };
  }
}

/**
 * Leave an organization
 * @param orgId Organization ID
 * @returns Operation result
 */
export async function leaveOrganization(
  orgId: string,
): Promise<OperationResult> {
  try {
    const currentUserId = requireUserId();

    return await removeMember(orgId, currentUserId);
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error leaving organization:", err);
    return {
      success: false,
      error: err.message || "Failed to leave organization",
    };
  }
}

/**
 * Get current user's role in an organization
 * @param orgId Organization ID
 * @returns Role or null
 */
export async function getUserRole(orgId: string): Promise<OrgRole | null> {
  try {
    requireUserId();

    // The current user's org memberships (canonical RPC); find this org.
    const membersResult = await membershipsService.forUser("organization");
    if (isScopesRpcErr(membersResult)) return null;
    const membership = membersResult.data.memberships.find(
      (m) => m.containerId === orgId,
    );
    return membership ? toOrgRole(membership.role) : null;
  } catch (error) {
    console.error("Error fetching user role:", error);
    return null;
  }
}

// ============================================================================
// Invitation System
//
// Canonical path only: every read/write goes through `invitationsService`
// (`inv_*` SECURITY DEFINER RPCs). The client has NO direct grant on
// `iam.invitations`. API routes below are email-only — they never touch the
// invitation table. Mirrors `features/projects/service.ts`.
// ============================================================================

/**
 * Invite a user to an organization.
 * Client creates/refreshes the row via `inv_create`; the API route only sends email.
 */
export async function inviteToOrganization(
  options: InviteMemberOptions,
): Promise<InvitationResult> {
  try {
    const { organizationId, email, role = "member" } = options;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return { success: false, error: emailValidation.error };
    }

    const normalizedEmail = email.toLowerCase().trim();

    const createResult = await invitationsService.create({
      targetType: "organization",
      targetId: organizationId,
      email: normalizedEmail,
      role,
      orgId: organizationId,
    });

    if (isScopesRpcErr(createResult)) {
      return { success: false, error: createResult.error.message };
    }

    const invitation = createResult.data.invitation;

    // Fire the email-only route. A delivery failure does NOT fail the invite —
    // the row exists and is acceptable via its token / the user's invites list.
    try {
      await fetch("/api/organizations/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: invitation.id,
        }),
      });
    } catch (emailError) {
      console.warn("Organization invitation email send failed:", emailError);
    }

    return {
      success: true,
      message: "Invitation sent successfully",
      invitation: invitationToOrganizationInvitation(invitation),
    };
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error inviting to organization:", err);
    return {
      success: false,
      error: err.message || "Failed to send invitation",
    };
  }
}

/**
 * Get all invitations for an organization (including expired)
 */
export async function getOrganizationInvitations(
  orgId: string,
): Promise<OrganizationInvitation[]> {
  const result = await invitationsService.listForTarget("organization", orgId);
  if (isScopesRpcErr(result)) {
    console.error(
      "Error fetching organization invitations:",
      result.error.message,
    );
    return [];
  }
  return result.data.invitations.map(invitationToOrganizationInvitation);
}

/**
 * Cancel an invitation
 */
export async function cancelInvitation(
  invitationId: string,
): Promise<OperationResult> {
  const result = await invitationsService.revoke(invitationId);
  if (isScopesRpcErr(result)) {
    console.error("Error cancelling invitation:", result.error.message);
    return { success: false, error: result.error.message };
  }
  return { success: true, message: "Invitation cancelled successfully" };
}

/**
 * Resend an invitation. Row refresh (new expiry + fresh token) via `inv_resend`;
 * the email-only route rebuilds + sends the accept link. Pass `organizationId` +
 * `email` so the route never has to read `iam.invitations`.
 */
export async function resendInvitation(
  invitationId: string,
  _context?: { organizationId: string; email: string },
): Promise<OperationResult> {
  try {
    const resendResult = await invitationsService.resend(invitationId);
    if (isScopesRpcErr(resendResult)) {
      return { success: false, error: resendResult.error.message };
    }

    const response = await fetch("/api/organizations/invitations/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationId,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || "Failed to resend invitation",
      };
    }

    return { success: true, message: "Invitation resent successfully" };
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error resending invitation:", err);
    return {
      success: false,
      error: err.message || "Failed to resend invitation",
    };
  }
}

/**
 * Accept an invitation. Atomic `inv_accept` creates the membership AND marks
 * the invite accepted — no separate membership write.
 */
export async function acceptInvitation(
  token: string,
): Promise<OrganizationResult> {
  try {
    requireUserId();

    const acceptResult = await invitationsService.accept(token);
    if (isScopesRpcErr(acceptResult)) {
      return {
        success: false,
        error:
          acceptResult.error.code === "not_found"
            ? "Invalid or expired invitation"
            : acceptResult.error.message,
      };
    }

    const orgId =
      acceptResult.data.accepted.organizationId ??
      acceptResult.data.accepted.targetId;
    const organization = await getOrganization(orgId);
    if (!organization) {
      return { success: true, message: "Successfully joined organization" };
    }

    return {
      success: true,
      message: "Successfully joined organization",
      organization,
    };
  } catch (error: unknown) {
    const err = pgErrorToError(error);
    console.error("Error accepting invitation:", err);
    return {
      success: false,
      error: err.message || "Failed to accept invitation",
    };
  }
}

/**
 * Get invitations for current user (org targets only)
 */
export async function getUserInvitations(): Promise<
  OrganizationInvitationWithOrg[]
> {
  try {
    requireUserId();

    const result = await invitationsService.forMe();
    if (isScopesRpcErr(result)) {
      console.error("Error fetching user invitations:", result.error.message);
      return [];
    }

    const invitations = result.data.invitations.filter(
      (inv) => inv.targetType === "organization",
    );

    return await Promise.all(
      invitations.map(async (inv) => ({
        ...invitationToOrganizationInvitation(inv),
        organization: (await getOrganization(inv.targetId)) ?? undefined,
      })),
    );
  } catch (error) {
    console.error("Error fetching user invitations:", error);
    return [];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

type OrganizationRow = Database["iam"]["Tables"]["organizations"]["Row"];

/**
 * Transform database organization record to application format
 */
function transformOrganizationFromDb(dbRecord: OrganizationRow): Organization {
  return {
    id: dbRecord.id,
    name: dbRecord.name,
    slug: dbRecord.slug,
    description: dbRecord.description,
    logoUrl: dbRecord.logo_url,
    logoFileId: dbRecord.logo_file_id,
    website: dbRecord.website,
    createdAt: dbRecord.created_at ?? "",
    updatedAt: dbRecord.updated_at ?? "",
    createdBy: dbRecord.created_by,
    isPersonal: dbRecord.is_personal ?? false,
    settings: isJsonObject(dbRecord.settings) ? dbRecord.settings : {},
  };
}

function invitationToOrganizationInvitation(
  inv: Invitation,
): OrganizationInvitation {
  return {
    id: inv.id,
    organizationId: inv.organizationId ?? inv.targetId,
    email: inv.email,
    token: inv.token ?? "",
    role: toOrgRole(inv.role),
    invitedAt: inv.createdAt,
    invitedBy: inv.createdBy,
    expiresAt: inv.expiresAt,
  };
}

/**
 * Generate slug suggestion from name
 * @param name Organization name
 * @returns Suggested slug
 */
export function suggestSlug(name: string): string {
  return generateSlug(name);
}
