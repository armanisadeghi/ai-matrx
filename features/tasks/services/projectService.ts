/**
 * Task Project Service
 *
 * Legacy project service for the tasks feature.
 * Every project is created in the organization the person SELECTED
 * (`appContext.organization_id`) — there is no personal-organization default
 * here any more (2026-09-17). For the richer org-scoped project surface, use
 * features/projects/service.ts instead.
 */
import { requireUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { DatabaseProject, ProjectWithTasks } from "../types";
import { scopeToOwner, type ListScopeWord } from "@/lib/list-scope";

/**
 * Create a new project in the organization the person SELECTED.
 *
 * A project is a workspace-scoped, shareable record — it is not the person's
 * own cross-organization data — so it is filed under `appContext.organization_id`
 * and nothing else. The personal organization used to be written here
 * unconditionally, which quietly filed a project created while working in a
 * team into the person's private workspace, where their team could not see it.
 * With no selection this REFUSES: `requireSelectedOrgId()` throws the one
 * `OrganizationContextError` every surface recognises
 * (`isOrganizationRequiredError` → `OrganizationRequiredNotice`), and that
 * throw is re-raised rather than flattened into a null, so the screen can say
 * what is missing instead of failing namelessly.
 *
 * Law: common-docs/policies/context-is-carried-never-rebuilt.md.
 */
export async function createProject(
  name: string,
  description?: string,
): Promise<DatabaseProject | null> {
  const userId = requireUserId();
  // Outside the try: a missing organization is a refusal the caller must see,
  // never one of the swallowed-and-logged failures below.
  const organizationId = requireSelectedOrgId();
  try {
    const { data, error } = await workspaceDb(supabase)
      .from("projects")
      .insert({
        name,
        description: description ?? null,
        created_by: userId,
        organization_id: organizationId,
        settings: {},
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating project:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Exception creating project:", error);
    return null;
  }
}

/**
 * Create default "Personal" project if none exist for the user
 */
export async function ensureDefaultProject(): Promise<DatabaseProject | null> {
  try {
    requireUserId();

    // Check if user has any projects (membership via the canonical store).
    const membersResult = await membershipsService.forUser("project");
    if (
      !isScopesRpcErr(membersResult) &&
      membersResult.data.memberships.length > 0
    ) {
      return null;
    }

    // Throws `OrganizationContextError` when nothing is selected; the catch
    // below logs it and returns null — this is a best-effort bootstrap, never
    // the surface a person is looking at.
    return await createProject("Personal", "Your personal tasks");
  } catch (error) {
    console.error("Exception ensuring default project:", error);
    return null;
  }
}

/**
 * Get all projects the current user is a member of (personal + org)
 */
export async function getUserProjects(): Promise<DatabaseProject[]> {
  try {
    const userId = requireUserId();

    // Memberships via the canonical store (RLS-safe).
    const membersResult = await membershipsService.forUser("project");
    if (isScopesRpcErr(membersResult)) {
      console.error(
        "Error fetching project memberships:",
        membersResult.error.message,
      );
    }

    const memberProjectIds = isScopesRpcErr(membersResult)
      ? []
      : membersResult.data.memberships.map((m) => m.containerId);

    // Also fetch personal projects created by user that may not have members yet
    const ownerOnly = await scopeToOwner("project");
    let createdQuery = workspaceDb(supabase)
      .from("projects")
      .select("*")
      .is("deleted_at", null);
    if (ownerOnly) createdQuery = createdQuery.eq("created_by", userId);
    const { data: createdProjects, error: createdError } = await createdQuery
      .order("created_at", { ascending: false });

    if (createdError) {
      console.error("Error fetching created projects:", createdError);
      return [];
    }

    // Merge without duplicates
    const allIds = new Set([
      ...memberProjectIds,
      ...(createdProjects ?? []).map((p) => p.id),
    ]);

    if (allIds.size === 0) return [];

    const { data, error } = await workspaceDb(supabase)
      .from("projects")
      .select("*")
      .is("deleted_at", null)
      .in("id", Array.from(allIds))
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching projects:", error);
      return [];
    }

    return data ?? [];
  } catch (error) {
    console.error("Exception fetching projects:", error);
    return [];
  }
}

/**
 * Get projects with their tasks — optimized single JOIN query
 */
export async function getProjectsWithTasks(): Promise<ProjectWithTasks[]> {
  try {
    const userId = requireUserId();

    const membersResult = await membershipsService.forUser("project");
    const memberProjectIds = isScopesRpcErr(membersResult)
      ? []
      : membersResult.data.memberships.map((m) => m.containerId);

    // Fetch with tasks joined
    let query = workspaceDb(supabase)
      .from("projects")
      .select(`*, tasks(*)`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (memberProjectIds.length > 0) {
      query = query.or(
        `created_by.eq.${userId},id.in.(${memberProjectIds.join(",")})`,
      );
    } else {
      query = query.eq("created_by", userId);
    }

    const { data: projects, error: projectsError } = await query;

    if (projectsError) {
      console.error("Error fetching projects with tasks:", projectsError);
      return [];
    }

    return (projects ?? []) as unknown as ProjectWithTasks[];
  } catch (error) {
    console.error("Exception fetching projects with tasks:", error);
    return [];
  }
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: string,
  updates: { name?: string; description?: string },
): Promise<DatabaseProject | null> {
  try {
    const { data, error } = await workspaceDb(supabase)
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      console.error("Error updating project:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Exception updating project:", error);
    return null;
  }
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  try {
    const { error } = await workspaceDb(supabase)
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      console.error("Error deleting project:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Exception deleting project:", error);
    return false;
  }
}
