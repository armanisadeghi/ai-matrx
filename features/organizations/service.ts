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
import { requireUserId, getUserEmail } from "@/utils/auth/getUserId";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { isScopesRpcErr } from "@/features/scopes/types";
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
    const { name, slug, description, logoUrl, logoFileId, website, settings } = options;

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

    // Get current user
    const currentUserId = requireUserId();

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name,
        slug,
        description,
        logo_url: logoUrl,
        logo_file_id: logoFileId,
        website,
        created_by: currentUserId,
        is_personal: false,
        settings: settings || {},
      })
      .select()
      .single();

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

    // Add creator as owner. Canonical membership write via the `mbr_*` RPCs
    // (iam.memberships) — the client has no direct grant on the table.
    // NOTE: bootstrapping the FIRST owner of a just-created org requires mbr_add
    // to accept the org's `created_by` as access (pending DB follow-up); until
    // that lands this raises 42501 and org creation fails here loudly.
    const ownerResult = await membershipsService.add({
      containerType: "organization",
      containerId: org.id,
      userId: currentUserId,
      organizationId: org.id,
      role: "owner",
    });

    if (isScopesRpcErr(ownerResult)) {
      console.error("Error adding owner membership:", ownerResult.error);
      return {
        success: false,
        error: "Failed to add you as organization owner",
      };
    }

    return {
      success: true,
      message: "Organization created successfully",
      organization: transformOrganizationFromDb(org),
    };
  } catch (error: any) {
    console.error("Error creating organization:", error);
    return {
      success: false,
      error: error?.message || "Failed to create organization",
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
    const updateData: any = {};

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
  } catch (error: any) {
    console.error("Error updating organization:", error);
    return {
      success: false,
      error: error.message || "Failed to update organization",
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
      .from("organizations")
      .select("is_personal")
      .eq("id", orgId)
      .single();

    if (org?.is_personal) {
      return { success: false, error: "Cannot delete personal organization" };
    }

    const { error } = await supabase
      .from("organizations")
      .delete()
      .eq("id", orgId);

    if (error) throw pgErrorToError(error);

    return {
      success: true,
      message: "Organization deleted successfully",
    };
  } catch (error: any) {
    console.error("Error deleting organization:", error);
    return {
      success: false,
      error: error.message || "Failed to delete organization",
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
      console.error(
        "Error fetching user organizations:",
        membersResult.error,
      );
      return [];
    }

    const memberships = membersResult.data.memberships;
    if (memberships.length === 0) return [];

    const roleByOrgId = new Map<string, OrgRole>();
    for (const m of memberships) {
      roleByOrgId.set(m.containerId, m.role as OrgRole);
    }
    const orgIds = [...roleByOrgId.keys()];

    // Resolve the org rows (public table — direct read, RLS-scoped).
    const { data: orgRows, error: orgsError } = await supabase
      .from("organizations")
      .select("*")
      .in("id", orgIds);
    if (orgsError) {
      console.error("Error fetching organizations:", orgsError.message);
      throw pgErrorToError(orgsError);
    }

    // Batch member counts — one round-trip instead of N.
    const countsResult = await membershipsService.counts("organization", orgIds);
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
        role: roleByOrgId.get(org.id) ?? ("member" as OrgRole),
        memberCount: countByOrgId.get(org.id) ?? 0,
      };
    });

    // Sort: personal first, then by name
    return orgs.sort((a, b) => {
      if (a.isPersonal && !b.isPersonal) return -1;
      if (!a.isPersonal && b.isPersonal) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error: any) {
    // Silently handle if organizations table doesn't exist yet
    if (
      error?.code === "42P01" ||
      error?.message?.includes("relation") ||
      error?.message?.includes("does not exist")
    ) {
      return [];
    }
    console.error("Error in getUserOrganizations:", error);
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
    return (data || []).map((row: any) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
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
  } catch (error: any) {
    console.error("Error updating member role:", error);
    return {
      success: false,
      error: error.message || "Failed to update member role",
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
  } catch (error: any) {
    console.error("Error removing member:", error);
    return {
      success: false,
      error: error.message || "Failed to remove member",
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
  } catch (error: any) {
    console.error("Error leaving organization:", error);
    return {
      success: false,
      error: error.message || "Failed to leave organization",
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
    return (membership?.role as OrgRole) ?? null;
  } catch (error) {
    console.error("Error fetching user role:", error);
    return null;
  }
}

// ============================================================================
// Invitation System
// ============================================================================

/**
 * Invite a user to an organization
 * Calls the API route to handle invitation creation and email sending on the server
 * @param options Invitation options
 * @returns Invitation result
 */
export async function inviteToOrganization(
  options: InviteMemberOptions,
): Promise<InvitationResult> {
  try {
    const { organizationId, email, role = "member" } = options;

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return { success: false, error: emailValidation.error };
    }

    // Call the API route to create invitation and send email
    // This runs on the server where EMAIL_FROM and RESEND_API_KEY are accessible
    const response = await fetch("/api/organizations/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId,
        email: email.toLowerCase().trim(),
        role,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || "Failed to send invitation",
      };
    }

    return {
      success: true,
      message: "Invitation sent successfully",
      invitation: transformInvitationFromDb(result.data),
    };
  } catch (error: any) {
    console.error("Error inviting to organization:", error);
    return {
      success: false,
      error: error.message || "Failed to send invitation",
    };
  }
}

/**
 * Get all invitations for an organization (including expired)
 * @param orgId Organization ID
 * @returns Array of invitations
 */
export async function getOrganizationInvitations(
  orgId: string,
): Promise<OrganizationInvitation[]> {
  try {
    const { data, error } = await supabase
      .from("organization_invitations")
      .select("*")
      .eq("organization_id", orgId)
      .order("invited_at", { ascending: false });

    if (error) throw pgErrorToError(error);

    return (data || []).map(transformInvitationFromDb);
  } catch (error) {
    console.error("Error fetching organization invitations:", error);
    return [];
  }
}

/**
 * Cancel an invitation
 * @param invitationId Invitation ID
 * @returns Operation result
 */
export async function cancelInvitation(
  invitationId: string,
): Promise<OperationResult> {
  try {
    const { error } = await supabase
      .from("organization_invitations")
      .delete()
      .eq("id", invitationId);

    if (error) throw pgErrorToError(error);

    return {
      success: true,
      message: "Invitation cancelled successfully",
    };
  } catch (error: any) {
    console.error("Error cancelling invitation:", error);
    return {
      success: false,
      error: error.message || "Failed to cancel invitation",
    };
  }
}

/**
 * Resend an invitation (updates expiry and sends email)
 * Calls the API route to handle email sending on the server
 * @param invitationId Invitation ID
 * @returns Operation result
 */
export async function resendInvitation(
  invitationId: string,
): Promise<OperationResult> {
  try {
    // Call the API route to resend invitation and email
    // This runs on the server where EMAIL_FROM and RESEND_API_KEY are accessible
    const response = await fetch("/api/organizations/invitations/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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

    return {
      success: true,
      message: "Invitation resent successfully",
    };
  } catch (error: any) {
    console.error("Error resending invitation:", error);
    return {
      success: false,
      error: error.message || "Failed to resend invitation",
    };
  }
}

/**
 * Accept an invitation
 * @param token Invitation token
 * @returns Organization result
 */
export async function acceptInvitation(
  token: string,
): Promise<OrganizationResult> {
  try {
    const currentUserId = requireUserId();

    // One atomic RPC: validates token + expiry + email match, upserts the
    // member row, and deletes the invitation in a single transaction.
    // (Replaced a client-side select → insert → unchecked delete sequence
    // that could strand a member row with a live, re-acceptable invite.)
    const { data: orgId, error: rpcError } = await supabase.rpc(
      "accept_organization_invitation",
      {
        invitation_token: token,
        accepting_user_id: currentUserId,
      },
    );

    if (rpcError || !orgId) {
      console.error("Error accepting invitation:", rpcError);
      const message = rpcError?.message ?? "";
      const friendly = message.includes("Invalid or expired")
        ? "Invalid or expired invitation"
        : message.includes("does not match")
          ? "This invitation was sent to a different email address"
          : message || "Failed to accept invitation";
      return { success: false, error: friendly };
    }

    // Fetch the joined org for the success payload (membership now exists,
    // so RLS allows the read).
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId as string)
      .single();
    if (orgError) {
      // Membership landed; only the display fetch failed. Still a success.
      console.error("Joined org but failed to load it:", orgError);
      return { success: true, message: "Successfully joined organization" };
    }

    return {
      success: true,
      message: "Successfully joined organization",
      organization: transformOrganizationFromDb(org),
    };
  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    return {
      success: false,
      error: error.message || "Failed to accept invitation",
    };
  }
}

/**
 * Get invitations for current user
 * @returns Array of invitations with organization details
 */
export async function getUserInvitations(): Promise<
  OrganizationInvitationWithOrg[]
> {
  try {
    const currentUserId = requireUserId();

    const { data, error } = await supabase
      .from("organization_invitations")
      .select("*, organizations(*)")
      .eq("email", getUserEmail())
      .gt("expires_at", new Date().toISOString())
      .order("invited_at", { ascending: false });

    if (error) throw pgErrorToError(error);

    return (data || []).map((item: any) => ({
      ...transformInvitationFromDb(item),
      organization: transformOrganizationFromDb(item.organizations),
    }));
  } catch (error) {
    console.error("Error fetching user invitations:", error);
    return [];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transform database organization record to application format
 */
function transformOrganizationFromDb(dbRecord: any): Organization {
  return {
    id: dbRecord.id,
    name: dbRecord.name,
    slug: dbRecord.slug,
    description: dbRecord.description,
    logoUrl: dbRecord.logo_url,
    logoFileId: dbRecord.logo_file_id,
    website: dbRecord.website,
    createdAt: dbRecord.created_at,
    updatedAt: dbRecord.updated_at,
    createdBy: dbRecord.created_by,
    isPersonal: dbRecord.is_personal,
    settings: dbRecord.settings || {},
  };
}

/**
 * Transform database member record to application format
 */
function transformMemberFromDb(dbRecord: any): OrganizationMemberWithUser {
  return {
    id: dbRecord.id,
    organizationId: dbRecord.organization_id,
    userId: dbRecord.user_id,
    role: dbRecord.role,
    joinedAt: dbRecord.joined_at,
    invitedBy: dbRecord.invited_by,
    user: dbRecord.users
      ? {
          id: dbRecord.users.id,
          email: dbRecord.users.email,
          displayName: dbRecord.users.display_name,
          avatarUrl: dbRecord.users.avatar_url,
        }
      : undefined,
  };
}

/**
 * Transform database invitation record to application format
 */
function transformInvitationFromDb(dbRecord: any): OrganizationInvitation {
  return {
    id: dbRecord.id,
    organizationId: dbRecord.organization_id,
    email: dbRecord.email,
    token: dbRecord.token,
    role: dbRecord.role,
    invitedAt: dbRecord.invited_at,
    invitedBy: dbRecord.invited_by,
    expiresAt: dbRecord.expires_at,
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
