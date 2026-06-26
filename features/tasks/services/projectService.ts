/**
 * Task Project Service
 *
 * Legacy project service for the tasks feature.
 * Personal projects are stored under the user's real personal organization.
 * For org-scoped projects, use features/projects/service.ts instead.
 */
import { requireUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { DatabaseProject, ProjectWithTasks } from "../types";

/**
 * Create a new project in the user's personal organization.
 */
export async function createProject(
  name: string,
  description?: string,
): Promise<DatabaseProject | null> {
  try {
    const userId = requireUserId();
    const { data: organizationId, error: orgError } = await supabase.rpc(
      "ensure_personal_organization",
      { p_user_id: userId },
    );

    if (orgError || !organizationId) {
      console.error("Error resolving personal organization:", orgError);
      return null;
    }

    const { data, error } = await supabase
      .from("ctx_projects")
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
    const { data: createdProjects, error: createdError } = await supabase
      .from("ctx_projects")
      .select("*")
      .eq("created_by", userId)
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

    const { data, error } = await supabase
      .from("ctx_projects")
      .select("*")
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
    let query = supabase
      .from("ctx_projects")
      .select(`*, ctx_tasks(*)`)
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
    const { data, error } = await supabase
      .from("ctx_projects")
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
    const { error } = await supabase
      .from("ctx_projects")
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
