/**
 * Project Service
 *
 * Complete service layer for project management including:
 * - Project CRUD operations (org-scoped)
 * - Member management
 * - Invitation system
 * - Role management
 *
 * Mirrors features/organizations/service.ts
 */

import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import {
  invitationsService,
  type Invitation,
} from "@/features/organizations/service/invitationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import {
  Project,
  ProjectWithRole,
  ProjectMember,
  ProjectMemberWithUser,
  ProjectInvitation,
  ProjectInvitationWithProject,
  ProjectRole,
  CreateProjectOptions,
  UpdateProjectOptions,
  InviteProjectMemberOptions,
  ProjectResult,
  ProjectInvitationResult,
  OperationResult,
  ProjectReference,
  ProjectReferenceDetailed,
  validateProjectName,
  validateProjectSlug,
  validateEmail,
  generateProjectSlug,
} from "./types";

/**
 * Resolve null to the user's real personal org id (never leave NULL).
 * Delegates to the canonical session-cached `ensureOrgId` — no per-call RPC.
 */
async function resolveOrganizationId(
  organizationId: string | null | undefined,
): Promise<string> {
  try {
    return await ensureOrgId(organizationId);
  } catch (error) {
    console.error("Error resolving personal organization:", error);
    throw pgErrorToError(error);
  }
}

// ============================================================================
// Project CRUD Operations
// ============================================================================

export async function createProject(
  options: CreateProjectOptions,
): Promise<ProjectResult> {
  try {
    const { name, slug, description, settings } = options;
    const organizationId = await resolveOrganizationId(options.organizationId);

    const nameValidation = validateProjectName(name);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    const slugValidation = validateProjectSlug(slug);
    if (!slugValidation.valid) {
      return { success: false, error: slugValidation.error };
    }

    const slugFree = await isProjectSlugAvailable(slug, organizationId);
    if (!slugFree) {
      return {
        success: false,
        error: "A project with that slug already exists in this organization",
      };
    }

    const currentUserId = requireUserId();

    const { data: project, error: projectError } = await workspaceDb(supabase)
      .from("projects")
      .insert({
        name,
        slug,
        organization_id: organizationId,
        description: description ?? null,
        created_by: currentUserId,
        settings: settings ?? {},
      })
      .select()
      .single();

    if (projectError) {
      console.error("Error creating project:", projectError.message);
      return {
        success: false,
        error: projectError.message || "Failed to create project",
      };
    }

    if (!project) {
      return { success: false, error: "Project created but no data returned" };
    }

    // Canonical creator-membership write. The legacy DB trigger still inserts
    // into the old project-member junction table, but that table NO LONGER
    // mirrors to `iam.memberships` — so we must explicitly land the owner
    // membership in the canonical store. `mbr_add` is idempotent (reactivates a
    // soft-deleted row), so this is safe even though the trigger also fires.
    const memberResult = await membershipsService.add({
      containerType: "project",
      containerId: project.id,
      userId: currentUserId,
      role: "owner",
      organizationId: organizationId,
    });
    if (isScopesRpcErr(memberResult)) {
      console.error(
        "Project created but owner membership failed:",
        memberResult.error,
      );
    }

    return {
      success: true,
      message: "Project created successfully",
      project: transformProjectFromDb(project),
    };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to create project";
    console.error("Error creating project:", error);
    return { success: false, error: msg };
  }
}

export async function updateProject(
  projectId: string,
  updates: UpdateProjectOptions,
): Promise<ProjectResult> {
  try {
    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) {
      const validation = validateProjectName(updates.name);
      if (!validation.valid) return { success: false, error: validation.error };
      updateData.name = updates.name;
    }
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.settings !== undefined) updateData.settings = updates.settings;
    // Move to a different org. Null means the owner's personal org.
    if (updates.organizationId !== undefined) {
      updateData.organization_id = await resolveOrganizationId(
        updates.organizationId,
      );
    }
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.startDate !== undefined)
      updateData.start_date = updates.startDate || null;
    if (updates.targetDate !== undefined)
      updateData.target_date = updates.targetDate || null;

    const { data, error } = await workspaceDb(supabase)
      .from("projects")
      .update(updateData)
      .eq("id", projectId)
      .select()
      .single();

    if (error) throw pgErrorToError(error);

    return {
      success: true,
      message: "Project updated successfully",
      project: transformProjectFromDb(data),
    };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to update project";
    console.error("Error updating project:", error);
    return { success: false, error: msg };
  }
}

export async function deleteProject(
  projectId: string,
): Promise<OperationResult> {
  try {
    const { error } = await workspaceDb(supabase)
      .from("projects")
      .delete()
      .eq("id", projectId);
    if (error) throw pgErrorToError(error);
    return { success: true, message: "Project deleted successfully" };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to delete project";
    console.error("Error deleting project:", error);
    return { success: false, error: msg };
  }
}

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const { data, error } = await workspaceDb(supabase)
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (error) throw pgErrorToError(error);
    return transformProjectFromDb(data);
  } catch (error) {
    console.error("Error fetching project:", error);
    return null;
  }
}

// URL params may carry either a slug or a project UUID — newly-created projects
// always get a slug, but older projects (and any built without one) fall back
// to the UUID in `${project.slug ?? project.id}` route construction.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getProjectBySlug(
  slugOrId: string,
  organizationId: string,
): Promise<Project | null> {
  try {
    const base = workspaceDb(supabase)
      .from("projects")
      .select("*")
      .eq("organization_id", organizationId);

    const query = UUID_PATTERN.test(slugOrId)
      ? base.eq("id", slugOrId)
      : base.eq("slug", slugOrId);

    const { data, error } = await query.maybeSingle();
    if (error) throw pgErrorToError(error);
    return data ? transformProjectFromDb(data) : null;
  } catch (error) {
    console.error("Error fetching project by slug:", error);
    return null;
  }
}

export async function getPersonalProjectBySlug(
  slugOrId: string,
): Promise<Project | null> {
  try {
    const userId = requireUserId();
    const organizationId = await resolveOrganizationId(null);

    const base = workspaceDb(supabase)
      .from("projects")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("created_by", userId);

    const query = UUID_PATTERN.test(slugOrId)
      ? base.eq("id", slugOrId)
      : base.eq("slug", slugOrId);

    const { data, error } = await query.maybeSingle();
    if (error) throw pgErrorToError(error);
    return data ? transformProjectFromDb(data) : null;
  } catch (error) {
    console.error("Error fetching personal project by slug:", error);
    return null;
  }
}

/**
 * Load the current user's project memberships and the matching project rows in
 * one pass — the canonical replacement for the old project-member junction
 * join (`role` + project). Reads
 * memberships from `membershipsService.forUser('project')`, loads those
 * projects from `ctx_projects` (joining `organizations(is_personal)` so the
 * personal filter works), and batches member counts via
 * `membershipsService.counts` (replacing the per-project N+1 count queries).
 */
async function loadUserProjectsWithRole(): Promise<ProjectWithRole[]> {
  const membersResult = await membershipsService.forUser("project");
  if (isScopesRpcErr(membersResult)) {
    console.error(
      "Error fetching project memberships:",
      membersResult.error.message,
    );
    return [];
  }

  const memberships = membersResult.data.memberships;
  if (memberships.length === 0) return [];

  const roleById = new Map<string, ProjectRole>();
  for (const m of memberships) {
    roleById.set(m.containerId, m.role as ProjectRole);
  }
  const projectIds = Array.from(roleById.keys());

  const { data: projectRows, error: projectsError } = await workspaceDb(
    supabase,
  )
    .from("projects")
    .select(`*`)
    .in("id", projectIds);

  if (projectsError) {
    console.error("Error fetching projects:", projectsError.message);
    return [];
  }

  // `organizations.is_personal` lives in `public.organizations`. PostgREST
  // embedding is single-schema, so a `workspace.projects → public.organizations`
  // embed fails ("no relationship in schema cache"). Fetch the orgs separately
  // and map `is_personal` back by organization_id.
  const orgIds = Array.from(
    new Set(
      (projectRows ?? [])
        .map((r: Record<string, unknown>) => r.organization_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const personalByOrg = new Map<string, boolean>();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .schema("iam").from("organizations")
      .select("id, is_personal")
      .in("id", orgIds);
    for (const o of orgs ?? []) {
      personalByOrg.set(o.id as string, o.is_personal === true);
    }
  }

  const countsResult = await membershipsService.counts("project", projectIds);
  const countById = new Map<string, number>();
  if (!isScopesRpcErr(countsResult)) {
    for (const c of countsResult.data.counts) {
      countById.set(c.containerId, c.memberCount);
    }
  }

  return (projectRows ?? []).map((row: Record<string, unknown>) => {
    const proj = transformProjectFromDb(row);
    return {
      ...proj,
      isPersonal: personalByOrg.get(row.organization_id as string) ?? false,
      role: roleById.get(proj.id) ?? ("member" as ProjectRole),
      memberCount: countById.get(proj.id) ?? 0,
    };
  });
}

export async function getOrgProjects(
  organizationId: string,
): Promise<ProjectWithRole[]> {
  try {
    requireUserId();
    const projects = (await loadUserProjectsWithRole()).filter(
      (p) => p.organizationId === organizationId,
    );

    return projects.sort((a, b) => {
      if (a.isPersonal && !b.isPersonal) return -1;
      if (!a.isPersonal && b.isPersonal) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "42P01" || err?.message?.includes("does not exist"))
      return [];
    console.error("Error in getOrgProjects:", error);
    return [];
  }
}

export async function getUserProjects(): Promise<ProjectWithRole[]> {
  try {
    requireUserId();
    const projects = await loadUserProjectsWithRole();
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error in getUserProjects:", error);
    return [];
  }
}

export async function isProjectSlugAvailable(
  slug: string,
  organizationId: string | null,
): Promise<boolean> {
  try {
    const orgId = await resolveOrganizationId(organizationId);
    let query = workspaceDb(supabase)
      .from("projects")
      .select("id")
      .eq("slug", slug);
    query = query.eq("organization_id", orgId);
    const { data } = await query.single();
    return !data;
  } catch {
    return true;
  }
}

export async function getPersonalProjects(): Promise<ProjectWithRole[]> {
  try {
    requireUserId();
    // A project is personal iff its owning org is the user's personal org
    // (organizations.is_personal). ctx_projects no longer stores is_personal;
    // transformProjectFromDb derives isPersonal from the joined org.
    const projects = (await loadUserProjectsWithRole()).filter(
      (p) => p.isPersonal,
    );
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error in getPersonalProjects:", error);
    return [];
  }
}

// ============================================================================
// Member Management
// ============================================================================

export async function getProjectMembers(
  projectId: string,
): Promise<ProjectMemberWithUser[]> {
  const result = await membershipsService.listWithUsers("project", projectId);
  if (isScopesRpcErr(result)) {
    console.error("Error fetching project members:", result.error.message);
    return [];
  }

  return result.data.members.map((m) => ({
    id: m.id,
    projectId: m.containerId,
    userId: m.userId,
    role: m.role as ProjectRole,
    joinedAt: m.createdAt,
    invitedBy: m.createdBy,
    user: {
      id: m.userId,
      email: m.user.email,
      displayName: m.user.displayName ?? undefined,
      avatarUrl: m.user.avatarUrl ?? undefined,
    },
  }));
}

/**
 * Guard: returns an error string if `userId` is the sole owner of the project
 * (so they cannot be removed or demoted), else null. Sources membership data
 * from the canonical `membershipsService.listForContainer`.
 */
async function lastOwnerGuard(
  projectId: string,
  userId: string,
  action: "demote" | "remove",
): Promise<string | null> {
  const result = await membershipsService.listForContainer(
    "project",
    projectId,
  );
  if (isScopesRpcErr(result)) return null;
  const members = result.data.members;
  const owners = members.filter((m) => m.role === "owner");
  const target = members.find((m) => m.userId === userId);
  if (target?.role === "owner" && owners.length === 1) {
    return action === "demote"
      ? "Cannot change role of the last owner"
      : "Cannot remove the last owner";
  }
  return null;
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  newRole: ProjectRole,
): Promise<OperationResult> {
  try {
    if (newRole !== "owner") {
      const guardError = await lastOwnerGuard(projectId, userId, "demote");
      if (guardError) return { success: false, error: guardError };
    }

    const result = await membershipsService.setRole({
      containerType: "project",
      containerId: projectId,
      userId,
      role: newRole,
    });

    if (isScopesRpcErr(result)) {
      return {
        success: false,
        error:
          result.error.code === "forbidden_org"
            ? "Unable to update member role. You may not have permission."
            : result.error.message,
      };
    }

    return { success: true, message: "Member role updated successfully" };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to update member role";
    console.error("Error updating project member role:", error);
    return { success: false, error: msg };
  }
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<OperationResult> {
  try {
    const guardError = await lastOwnerGuard(projectId, userId, "remove");
    if (guardError) return { success: false, error: guardError };

    const result = await membershipsService.remove({
      containerType: "project",
      containerId: projectId,
      userId,
    });

    if (isScopesRpcErr(result)) {
      return {
        success: false,
        error:
          result.error.code === "forbidden_org"
            ? "Unable to remove member. You may not have permission."
            : result.error.message,
      };
    }

    return { success: true, message: "Member removed successfully" };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to remove member";
    console.error("Error removing project member:", error);
    return { success: false, error: msg };
  }
}

export async function leaveProject(
  projectId: string,
): Promise<OperationResult> {
  try {
    const currentUserId = requireUserId();

    return await removeProjectMember(projectId, currentUserId);
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to leave project";
    console.error("Error leaving project:", error);
    return { success: false, error: msg };
  }
}

export async function getProjectUserRole(
  projectId: string,
): Promise<ProjectRole | null> {
  try {
    const currentUserId = requireUserId();

    const result = await membershipsService.forUser("project");
    if (isScopesRpcErr(result)) return null;

    const membership = result.data.memberships.find(
      (m) => m.containerId === projectId && m.userId === currentUserId,
    );
    return (membership?.role as ProjectRole) ?? null;
  } catch (error) {
    console.error("Error fetching project user role:", error);
    return null;
  }
}

// ============================================================================
// Invitation System
// ============================================================================

export async function inviteToProject(
  options: InviteProjectMemberOptions,
): Promise<ProjectInvitationResult> {
  try {
    const { projectId, email, role = "member" } = options;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return { success: false, error: emailValidation.error };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Canonical path: the client creates / refreshes the invitation row via the
    // `inv_create` RPC (client → Supabase, per repo doctrine). The API route is
    // now email-only — it receives the already-created token + email and sends
    // the email, never touching any invitation table.
    const createResult = await invitationsService.create({
      targetType: "project",
      targetId: projectId,
      email: normalizedEmail,
      role,
    });

    if (isScopesRpcErr(createResult)) {
      return { success: false, error: createResult.error.message };
    }

    const invitation = createResult.data.invitation;

    // Fire the email-only route. A delivery failure does NOT fail the invite —
    // the row exists and is acceptable via its token / the user's invites list.
    try {
      await fetch("/api/projects/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: invitation.id,
          projectId,
          email: normalizedEmail,
          role,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
        }),
      });
    } catch (emailError) {
      console.warn("Project invitation email send failed:", emailError);
    }

    return {
      success: true,
      message: "Invitation sent successfully",
      invitation: invitationToProjectInvitation(invitation),
    };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to send invitation";
    console.error("Error inviting to project:", error);
    return { success: false, error: msg };
  }
}

export async function getProjectInvitations(
  projectId: string,
): Promise<ProjectInvitation[]> {
  const result = await invitationsService.listForTarget("project", projectId);
  if (isScopesRpcErr(result)) {
    console.error("Error fetching project invitations:", result.error.message);
    return [];
  }
  return result.data.invitations.map(invitationToProjectInvitation);
}

export async function cancelProjectInvitation(
  invitationId: string,
): Promise<OperationResult> {
  const result = await invitationsService.revoke(invitationId);
  if (isScopesRpcErr(result)) {
    console.error(
      "Error cancelling project invitation:",
      result.error.message,
    );
    return { success: false, error: result.error.message };
  }
  return { success: true, message: "Invitation cancelled successfully" };
}

/**
 * Resend a project invitation. The row refresh (new expiry + fresh token) goes
 * through the canonical `inv_resend` RPC on the client; the email-only route
 * then rebuilds + sends the accept link. `projectId` + `email` are passed so the
 * route never has to read any invitation table.
 */
export async function resendProjectInvitation(
  invitationId: string,
  context?: { projectId: string; email: string },
): Promise<OperationResult> {
  try {
    const resendResult = await invitationsService.resend(invitationId);
    if (isScopesRpcErr(resendResult)) {
      return { success: false, error: resendResult.error.message };
    }

    const response = await fetch("/api/projects/invitations/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: resendResult.data.token,
        projectId: context?.projectId,
        email: context?.email,
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
    const msg =
      error instanceof Error ? error.message : "Failed to resend invitation";
    console.error("Error resending project invitation:", error);
    return { success: false, error: msg };
  }
}

export async function acceptProjectInvitation(
  token: string,
): Promise<ProjectResult> {
  try {
    requireUserId();

    // The RPC is atomic: it creates the membership AND marks the invite
    // accepted in one transaction. No separate membership write needed.
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

    const project = await getProject(acceptResult.data.accepted.targetId);
    if (!project) {
      // Membership was created; the project row just couldn't be re-read.
      return { success: true, message: "Successfully joined project" };
    }

    return {
      success: true,
      message: "Successfully joined project",
      project,
    };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to accept invitation";
    console.error("Error accepting project invitation:", error);
    return { success: false, error: msg };
  }
}

export async function getUserProjectInvitations(): Promise<
  ProjectInvitationWithProject[]
> {
  try {
    requireUserId();

    const result = await invitationsService.forMe();
    if (isScopesRpcErr(result)) {
      console.error(
        "Error fetching user project invitations:",
        result.error.message,
      );
      return [];
    }

    const invitations = result.data.invitations.filter(
      (inv) => inv.targetType === "project",
    );

    return await Promise.all(
      invitations.map(async (inv) => ({
        ...invitationToProjectInvitation(inv),
        project: (await getProject(inv.targetId)) ?? undefined,
      })),
    );
  } catch (error) {
    console.error("Error fetching user project invitations:", error);
    return [];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

// ============================================================================
// Project References
// ============================================================================

interface RawProjectReference {
  schema_name: string;
  table_name: string;
  column_name: string;
  row_count: number;
}

interface RawProjectReferenceDetailed extends RawProjectReference {
  sample_ids: string[] | null;
}

export async function getProjectReferences(
  projectId: string,
): Promise<ProjectReference[]> {
  const { data, error } = await supabase.rpc("get_project_references", {
    p_project_id: projectId,
  });
  if (error) throw pgErrorToError(error);
  if (!data) return [];
  return (data as RawProjectReference[]).map((row) => ({
    schemaName: row.schema_name,
    tableName: row.table_name,
    columnName: row.column_name,
    rowCount: Number(row.row_count),
  }));
}

export async function getProjectReferencesDetailed(
  projectId: string,
  sampleLimit = 5,
): Promise<ProjectReferenceDetailed[]> {
  const { data, error } = await supabase.rpc(
    "get_project_references_detailed",
    {
      p_project_id: projectId,
      p_sample_limit: sampleLimit,
    },
  );
  if (error) throw pgErrorToError(error);
  if (!data) return [];
  return (data as RawProjectReferenceDetailed[]).map((row) => ({
    schemaName: row.schema_name,
    tableName: row.table_name,
    columnName: row.column_name,
    rowCount: Number(row.row_count),
    sampleIds: row.sample_ids ?? null,
  }));
}

// ============================================================================
// Internal Helpers
// ============================================================================

function transformProjectFromDb(dbRecord: Record<string, unknown>): Project {
  // Personal-ness is org-derived (organizations.is_personal); ctx_projects no
  // longer stores it. If the caller joined `organizations(is_personal)` we read
  // it; otherwise we default to false (callers that need it must join the org).
  const org = dbRecord.organizations as
    | { is_personal?: boolean | null }
    | null
    | undefined;
  return {
    id: dbRecord.id as string,
    name: dbRecord.name as string,
    slug: (dbRecord.slug as string) ?? null,
    description: (dbRecord.description as string) ?? null,
    organizationId: (dbRecord.organization_id as string) ?? null,
    createdBy: (dbRecord.created_by as string) ?? null,
    isPersonal: org?.is_personal === true,
    status: ((dbRecord.status as string) ?? "active") as Project["status"],
    priority: (dbRecord.priority as Project["priority"]) ?? null,
    startDate: (dbRecord.start_date as string) ?? null,
    targetDate: (dbRecord.target_date as string) ?? null,
    settings: (dbRecord.settings as Record<string, unknown>) ?? {},
    createdAt: dbRecord.created_at as string,
    updatedAt: dbRecord.updated_at as string,
  };
}

/** Map a canonical `iam.invitations` row (camelCase) to the feature's
 * `ProjectInvitation` shape. `created_at` → `invitedAt`, `created_by` →
 * `invitedBy`; token may be absent (e.g. from `getByToken`). */
function invitationToProjectInvitation(inv: Invitation): ProjectInvitation {
  return {
    id: inv.id,
    projectId: inv.targetId,
    email: inv.email,
    token: inv.token ?? "",
    role: inv.role as ProjectRole,
    invitedAt: inv.createdAt,
    invitedBy: inv.createdBy,
    expiresAt: inv.expiresAt,
  };
}
