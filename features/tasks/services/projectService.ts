/**
 * Task Project Service
 *
 * Legacy project service for the tasks feature.
 * Personal/unscoped projects (no organization_id) are handled here.
 * For org-scoped projects, use features/projects/service.ts instead.
 */
import { requireUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";
import type { DatabaseProject, ProjectWithTasks } from "../types";

/**
 * Create a new personal project (not org-scoped)
 */
export async function createProject(
  name: string,
  description?: string,
): Promise<DatabaseProject | null> {
  try {
    const userId = requireUserId();

    const { data, error } = await supabase
      .from("ctx_projects")
      .insert({
        name,
        description: description ?? null,
        created_by: userId,
        organization_id: null,
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
    const userId = requireUserId();

    // Check if user has any projects (created_by or project_members)
    const { data: memberProjects } = await supabase
      .from("ctx_project_members")
      .select("project_id")
      .eq("user_id", userId)
      .limit(1);

    if (memberProjects && memberProjects.length > 0) return null;

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

    // Query via project_members (RLS-safe) for member projects
    const { data: memberRows, error: memberError } = await supabase
      .from("ctx_project_members")
      .select("project_id")
      .eq("user_id", userId);

    if (memberError) {
      console.error("Error fetching project memberships:", memberError);
    }

    const memberProjectIds = (memberRows ?? []).map(
      (r: { project_id: string }) => r.project_id,
    );

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

    const { data: memberRows } = await supabase
      .from("ctx_project_members")
      .select("project_id")
      .eq("user_id", userId);

    const memberProjectIds = (memberRows ?? []).map(
      (r: { project_id: string }) => r.project_id,
    );

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
