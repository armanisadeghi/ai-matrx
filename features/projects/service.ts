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
import { pgErrorToError } from "@/utils/supabase/pg-error";
import { requireUserId, getUserEmail } from "@/utils/auth/getUserId";
import type { DbRpcRow } from "@/types/supabase-rpc";
import { isPersonalPseudoOrgId } from "@/features/agent-context/redux/hierarchySlice";
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

// The HierarchyCascade can surface a synthetic "Personal" pseudo-org whose id
// is the personal sentinel. Anything that hits the real organizations table
// must treat that sentinel as `null`, otherwise we get FK violations or
// nonsensical org-scoped queries.
function normalizeOrgId(
  organizationId: string | null | undefined,
): string | null {
  if (!organizationId) return null;
  if (isPersonalPseudoOrgId(organizationId)) return null;
  return organizationId;
}

// ============================================================================
// DB Row Interfaces
// ============================================================================

type ProjectMemberWithUserRow = DbRpcRow<"get_project_members_with_users">;

// ============================================================================
// Project CRUD Operations
// ============================================================================

export async function createProject(
  options: CreateProjectOptions,
): Promise<ProjectResult> {
  try {
    const { name, slug, description, settings } = options;
    const organizationId = normalizeOrgId(options.organizationId);

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
      const scope = organizationId
        ? "in this organization"
        : "in your personal projects";
      return {
        success: false,
        error: `A project with that slug already exists ${scope}`,
      };
    }

    const currentUserId = requireUserId();

    const { data: project, error: projectError } = await supabase
      .from("ctx_projects")
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

    // Add creator as owner
    const { error: memberError } = await supabase
      .from("ctx_project_members")
      .insert({
        project_id: project.id,
        user_id: currentUserId,
        role: "owner",
      });

    if (memberError) {
      console.error("Error adding project owner:", memberError.message);
      return {
        success: false,
        error: memberError.message || "Failed to add you as project owner",
      };
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

    const { data, error } = await supabase
      .from("ctx_projects")
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
    const { error } = await supabase
      .from("ctx_projects")
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
    const { data, error } = await supabase
      .from("ctx_projects")
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
    const base = supabase
      .from("ctx_projects")
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

    const base = supabase
      .from("ctx_projects")
      .select("*")
      .is("organization_id", null)
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

export async function getOrgProjects(
  organizationId: string,
): Promise<ProjectWithRole[]> {
  try {
    const currentUserId = requireUserId();

    const { data, error } = await supabase
      .from("ctx_project_members")
      .select(`role, ctx_projects(*)`)
      .eq("user_id", currentUserId)
      .not("ctx_projects.organization_id", "is", null);

    if (error) {
      console.error("Error fetching org projects:", error.message);
      return [];
    }

    const projects: ProjectWithRole[] = await Promise.all(
      (data ?? [])
        .filter((item: Record<string, unknown>) => {
          const proj = item.ctx_projects as Record<string, unknown> | null;
          return proj && proj.organization_id === organizationId;
        })
        .map(async (item: Record<string, unknown>) => {
          const proj = transformProjectFromDb(
            item.ctx_projects as Record<string, unknown>,
          );
          const { count } = await supabase
            .from("ctx_project_members")
            .select("*", { count: "exact", head: true })
            .eq("project_id", proj.id);
          return {
            ...proj,
            role: item.role as ProjectRole,
            memberCount: count ?? 0,
          };
        }),
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
    const currentUserId = requireUserId();

    const { data, error } = await supabase
      .from("ctx_project_members")
      .select(`role, ctx_projects(*)`)
      .eq("user_id", currentUserId);

    if (error) {
      console.error("Error fetching user projects:", error.message);
      return [];
    }

    const projects: ProjectWithRole[] = await Promise.all(
      (data ?? []).map(async (item: Record<string, unknown>) => {
        const proj = transformProjectFromDb(
          item.ctx_projects as Record<string, unknown>,
        );
        const { count } = await supabase
          .from("ctx_project_members")
          .select("*", { count: "exact", head: true })
          .eq("project_id", proj.id);
        return {
          ...proj,
          role: item.role as ProjectRole,
          memberCount: count ?? 0,
        };
      }),
    );

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
    const orgId = normalizeOrgId(organizationId);
    let query = supabase.from("ctx_projects").select("id").eq("slug", slug);
    if (orgId) {
      query = query.eq("organization_id", orgId);
    } else {
      // Personal project: scope uniqueness to the current user
      const userId = requireUserId();
      query = query.is("organization_id", null).eq("created_by", userId);
    }
    const { data } = await query.single();
    return !data;
  } catch {
    return true;
  }
}

export async function getPersonalProjects(): Promise<ProjectWithRole[]> {
  try {
    const currentUserId = requireUserId();

    const { data, error } = await supabase
      .from("ctx_project_members")
      .select(`role, ctx_projects(*, organizations(is_personal))`)
      .eq("user_id", currentUserId);

    if (error) {
      console.error("Error fetching personal projects:", error.message);
      return [];
    }

    const projects: ProjectWithRole[] = await Promise.all(
      (data ?? [])
        .filter((item: Record<string, unknown>) => {
          // A project is personal iff its owning org is the user's personal org
          // (organizations.is_personal). ctx_projects no longer stores is_personal.
          const proj = item.ctx_projects as Record<string, unknown> | null;
          const org = proj?.organizations as
            | { is_personal?: boolean | null }
            | null
            | undefined;
          return org?.is_personal === true;
        })
        .map(async (item: Record<string, unknown>) => {
          const proj = transformProjectFromDb(
            item.ctx_projects as Record<string, unknown>,
          );
          const { count } = await supabase
            .from("ctx_project_members")
            .select("*", { count: "exact", head: true })
            .eq("project_id", proj.id);
          return {
            ...proj,
            role: item.role as ProjectRole,
            memberCount: count ?? 0,
          };
        }),
    );

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error in getPersonalProjects:", error);
    return [];
  }
}

export { generateProjectSlug as suggestProjectSlug };

// ============================================================================
// Member Management
// ============================================================================

export async function getProjectMembers(
  projectId: string,
): Promise<ProjectMemberWithUser[]> {
  try {
    const { data, error } = await supabase.rpc(
      "get_project_members_with_users",
      {
        p_project_id: projectId,
      },
    );
    if (error) throw pgErrorToError(error);

    return ((data as unknown as ProjectMemberWithUserRow[]) ?? []).map(
      (row) => ({
        id: row.id,
        projectId: row.project_id,
        userId: row.user_id,
        role: row.role as ProjectRole,
        joinedAt: row.joined_at,
        invitedBy: row.invited_by as string | null,
        user: {
          id: row.user_id,
          email: row.user_email || "",
          displayName: row.user_display_name || undefined,
          avatarUrl: row.user_avatar_url || undefined,
        },
      }),
    );
  } catch (error) {
    console.error("Error fetching project members:", error);
    return [];
  }
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  newRole: ProjectRole,
): Promise<OperationResult> {
  try {
    if (newRole !== "owner") {
      const { data: owners } = await supabase
        .from("ctx_project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("role", "owner");

      if (owners && owners.length === 1) {
        const { data: member } = await supabase
          .from("ctx_project_members")
          .select("role")
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .single();

        if (member?.role === "owner") {
          return {
            success: false,
            error: "Cannot change role of the last owner",
          };
        }
      }
    }

    const { data: updatedRows, error } = await supabase
      .from("ctx_project_members")
      .update({ role: newRole })
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .select();

    if (error) throw pgErrorToError(error);

    if (!updatedRows || updatedRows.length === 0) {
      return {
        success: false,
        error: "Unable to update member role. You may not have permission.",
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
    const { data: member } = await supabase
      .from("ctx_project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .single();

    if (member?.role === "owner") {
      const { data: owners } = await supabase
        .from("ctx_project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("role", "owner");

      if (owners && owners.length === 1) {
        return { success: false, error: "Cannot remove the last owner" };
      }
    }

    const { data: deletedRows, error } = await supabase
      .from("ctx_project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .select();

    if (error) throw pgErrorToError(error);

    if (!deletedRows || deletedRows.length === 0) {
      return {
        success: false,
        error: "Unable to remove member. You may not have permission.",
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

    const { data } = await supabase
      .from("ctx_project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", currentUserId)
      .single();

    return (data?.role as ProjectRole) ?? null;
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

    const response = await fetch("/api/projects/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
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
  try {
    const { data, error } = await supabase
      .from("ctx_project_invitations")
      .select("*")
      .eq("project_id", projectId)
      .order("invited_at", { ascending: false });

    if (error) throw pgErrorToError(error);

    return (data ?? []).map(transformInvitationFromDb);
  } catch (error) {
    console.error("Error fetching project invitations:", error);
    return [];
  }
}

export async function cancelProjectInvitation(
  invitationId: string,
): Promise<OperationResult> {
  try {
    const { error } = await supabase
      .from("ctx_project_invitations")
      .delete()
      .eq("id", invitationId);

    if (error) throw pgErrorToError(error);
    return { success: true, message: "Invitation cancelled successfully" };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Failed to cancel invitation";
    console.error("Error cancelling project invitation:", error);
    return { success: false, error: msg };
  }
}

export async function resendProjectInvitation(
  invitationId: string,
): Promise<OperationResult> {
  try {
    const response = await fetch("/api/projects/invitations/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
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
    const currentUserId = requireUserId();

    const { data: invitation, error: inviteError } = await supabase
      .from("ctx_project_invitations")
      .select("*, ctx_projects(*)")
      .eq("token", token)
      .eq("email", getUserEmail() ?? "")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (inviteError || !invitation) {
      return { success: false, error: "Invalid or expired invitation" };
    }

    const { error: memberError } = await supabase
      .from("ctx_project_members")
      .insert({
        project_id: invitation.project_id,
        user_id: currentUserId,
        role: invitation.role,
        invited_by: invitation.invited_by,
      });

    if (memberError) {
      if (memberError.code === "23505") {
        return {
          success: false,
          error: "You are already a member of this project",
        };
      }
      throw memberError;
    }

    await supabase
      .from("ctx_project_invitations")
      .delete()
      .eq("id", invitation.id);

    return {
      success: true,
      message: "Successfully joined project",
      project: transformProjectFromDb(invitation.ctx_projects),
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
    const currentUserId = requireUserId();

    const { data, error } = await supabase
      .from("ctx_project_invitations")
      .select("*, ctx_projects(*)")
      .eq("email", getUserEmail() ?? "")
      .gt("expires_at", new Date().toISOString())
      .order("invited_at", { ascending: false });

    if (error) throw pgErrorToError(error);

    return (data ?? []).map((item: Record<string, unknown>) => ({
      ...transformInvitationFromDb(item),
      project: item.ctx_projects
        ? transformProjectFromDb(item.ctx_projects as Record<string, unknown>)
        : undefined,
    }));
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
    settings: (dbRecord.settings as Record<string, unknown>) ?? {},
    createdAt: dbRecord.created_at as string,
    updatedAt: dbRecord.updated_at as string,
  };
}

function transformInvitationFromDb(
  dbRecord: Record<string, unknown>,
): ProjectInvitation {
  return {
    id: dbRecord.id as string,
    projectId: dbRecord.project_id as string,
    email: dbRecord.email as string,
    token: dbRecord.token as string,
    role: dbRecord.role as ProjectRole,
    invitedAt: dbRecord.invited_at as string,
    invitedBy: (dbRecord.invited_by as string) ?? null,
    expiresAt: dbRecord.expires_at as string,
  };
}
