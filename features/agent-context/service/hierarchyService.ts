"use client";

import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { requireUserId, getUserEmail } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database } from "@/types/database.types";
import type {
  NavTreeResponse,
  FullContextResponse,
} from "@/features/agent-context/redux/hierarchySlice";
import { createProject as createProjectCanonical } from "@/features/projects/service";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { generateProjectSlug } from "@/features/projects/types";

function toTaskPriority(
  p: string | undefined,
): Database["public"]["Enums"]["task_priority"] | null {
  if (p === "low" || p === "medium" || p === "high") return p;
  return null;
}

// ─── Types ──────────────────────────────────────────────────────────

export type HierarchyOrg = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_personal: boolean | null;
  settings: Record<string, unknown> | null;
  role: string;
  created_at: string | null;
};

export type HierarchyProject = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  organization_id: string | null;
  settings: Record<string, unknown> | null;
  created_at: string | null;
  created_by: string | null;
};

export type HierarchyTask = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  assignee_id: string | null;
  settings: Record<string, unknown> | null;
  created_at: string | null;
  created_by: string | null;
};

// ─── Tree node ──────────────────────────────────────────────────────

export type HierarchyNodeType = "user" | "organization" | "project" | "task";

export type HierarchyNode = {
  id: string;
  type: HierarchyNodeType;
  name: string;
  description: string | null;
  parentId: string | null;
  children: HierarchyNode[];
  childCount: number;
  meta?: Record<string, unknown>;
};

// ─── Service ────────────────────────────────────────────────────────

export const hierarchyService = {
  async fetchCurrentUser(): Promise<{
    id: string;
    email: string;
    name: string | null;
  } | null> {
    const userId = requireUserId();
    const userEmail = getUserEmail() ?? "";

    const { data: profile } = await supabase
      .schema("users")
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    return {
      id: userId,
      email: userEmail,
      name: profile?.display_name ?? userEmail ?? "Me",
    };
  },

  async fetchUserOrganizations(): Promise<HierarchyOrg[]> {
    requireUserId();

    // Canonical membership read (iam.memberships via mbr_* RPCs); org identity
    // resolved from the public organizations table (no cross-schema embed).
    const membersResult = await membershipsService.forUser("organization");
    if (isScopesRpcErr(membersResult)) {
      throw new Error(membersResult.error.message);
    }
    const roleByOrgId = new Map<string, string>();
    for (const m of membersResult.data.memberships) {
      roleByOrgId.set(m.containerId, m.role);
    }
    const orgIds = [...roleByOrgId.keys()];
    if (orgIds.length === 0) return [];

    const { data, error } = await supabase
      .schema("iam")
      .from("organizations")
      .select(
        "id, name, slug, description, logo_url, is_personal, settings, created_at",
      )
      .in("id", orgIds);
    if (error) throw error;

    return (data ?? []).map((org: any) => ({
      ...org,
      role: roleByOrgId.get(org.id) ?? "member",
    }));
  },

  async fetchProjects(opts: { orgId?: string }): Promise<HierarchyProject[]> {
    let query = workspaceDb(supabase)
      .from("projects")
      .select(
        "id, name, slug, description, organization_id, settings, created_at, created_by",
      )
      .order("name");

    if (opts.orgId) {
      query = query.eq("organization_id", opts.orgId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HierarchyProject[];
  },

  async fetchAllUserProjects(): Promise<HierarchyProject[]> {
    const userId = requireUserId();

    const { data, error } = await workspaceDb(supabase)
      .from("projects")
      .select(
        "id, name, slug, description, organization_id, settings, created_at, created_by",
      )
      .eq("created_by", userId)
      .order("name");

    if (error) throw error;
    return (data ?? []) as HierarchyProject[];
  },

  async fetchProjectTasks(projectId: string): Promise<HierarchyTask[]> {
    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select(
        "id, title, description, project_id, parent_task_id, status, priority, due_date, assignee_id, settings, created_at, created_by",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as HierarchyTask[];
  },

  async fetchOrphanTasks(): Promise<HierarchyTask[]> {
    const userId = requireUserId();

    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select(
        "id, title, description, project_id, parent_task_id, status, priority, due_date, assignee_id, settings, created_at, created_by",
      )
      .is("project_id", null)
      .eq("created_by", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as HierarchyTask[];
  },

  _buildTaskNodes(tasks: HierarchyTask[]): HierarchyNode[] {
    const taskMap = new Map<string, HierarchyNode>();
    for (const task of tasks) {
      taskMap.set(task.id, {
        id: task.id,
        type: "task",
        name: task.title,
        description: task.description,
        parentId: task.parent_task_id ?? task.project_id ?? null,
        children: [],
        childCount: 0,
        meta: {
          status: task.status,
          priority: task.priority,
          due_date: task.due_date,
          created_at: task.created_at,
        },
      });
    }
    const roots: HierarchyNode[] = [];
    for (const task of tasks) {
      const node = taskMap.get(task.id)!;
      if (task.parent_task_id && taskMap.has(task.parent_task_id)) {
        const parent = taskMap.get(task.parent_task_id)!;
        parent.children.push(node);
        parent.childCount++;
      } else {
        roots.push(node);
      }
    }
    return roots;
  },

  async fetchFullTree(): Promise<HierarchyNode[]> {
    const user = await this.fetchCurrentUser();

    const orgs = await this.fetchUserOrganizations();
    const allProjects = await this.fetchAllUserProjects();
    const orphanTasks = await this.fetchOrphanTasks();

    const assignedProjectIds = new Set<string>();
    const orgNodes: HierarchyNode[] = [];

    for (const org of orgs) {
      const orgNode: HierarchyNode = {
        id: org.id,
        type: "organization",
        name: org.name,
        description: org.description,
        parentId: "user-root",
        children: [],
        childCount: 0,
        meta: {
          slug: org.slug,
          is_personal: org.is_personal,
          role: org.role,
          created_at: org.created_at,
        },
      };

      const orgProjects = await this.fetchProjects({ orgId: org.id });
      for (const proj of orgProjects) {
        assignedProjectIds.add(proj.id);
        const tasks = await this.fetchProjectTasks(proj.id);
        const taskNodes = this._buildTaskNodes(tasks);
        orgNode.children.push({
          id: proj.id,
          type: "project",
          name: proj.name,
          description: proj.description,
          parentId: org.id,
          children: taskNodes,
          childCount: taskNodes.length,
          meta: {
            slug: proj.slug,
            created_at: proj.created_at,
            organization_id: org.id,
          },
        });
        orgNode.childCount++;
      }

      orgNodes.push(orgNode);
    }

    const unassignedProjects = allProjects.filter(
      (p) => !assignedProjectIds.has(p.id),
    );
    const unassignedProjectNodes: HierarchyNode[] = [];
    for (const proj of unassignedProjects) {
      const tasks = await this.fetchProjectTasks(proj.id);
      const taskNodes = this._buildTaskNodes(tasks);
      unassignedProjectNodes.push({
        id: proj.id,
        type: "project",
        name: proj.name,
        description: proj.description,
        parentId: "user-root",
        children: taskNodes,
        childCount: taskNodes.length,
        meta: {
          slug: proj.slug,
          created_at: proj.created_at,
          unassigned: true,
        },
      });
    }

    const orphanTaskNodes = this._buildTaskNodes(orphanTasks);

    const userRoot: HierarchyNode = {
      id: "user-root",
      type: "user",
      name: user?.name ?? user?.email ?? "Me",
      description: user?.email ?? null,
      parentId: null,
      children: [
        ...orgNodes,
        ...(unassignedProjectNodes.length > 0
          ? [
              {
                id: "unassigned-projects",
                type: "project" as HierarchyNodeType,
                name: `Unassigned Projects (${unassignedProjectNodes.length})`,
                description: "Projects not linked to any organization",
                parentId: "user-root",
                children: unassignedProjectNodes,
                childCount: unassignedProjectNodes.length,
                meta: { virtual: true },
              },
            ]
          : []),
        ...(orphanTaskNodes.length > 0
          ? [
              {
                id: "orphan-tasks",
                type: "task" as HierarchyNodeType,
                name: `Standalone Tasks (${orphanTaskNodes.length})`,
                description: "Tasks not linked to any project",
                parentId: "user-root",
                children: orphanTaskNodes,
                childCount: orphanTaskNodes.length,
                meta: { virtual: true },
              },
            ]
          : []),
      ],
      childCount: 0,
      meta: { email: user?.email },
    };
    userRoot.childCount = userRoot.children.length;

    return [userRoot];
  },

  // ─── Create entity ──────────────────────────────────────────────
  async createOrganization(data: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<HierarchyOrg> {
    const userId = requireUserId();

    const { data: org, error } = await supabase
      .schema("iam")
      .from("organizations")
      .insert({ ...data, created_by: userId })
      .select()
      .single();
    if (error) throw error;

    // Owner membership via the canonical mbr_* RPC (iam.memberships); the client
    // has no direct grant on the table.
    // NOTE: bootstrapping the FIRST owner of a just-created org requires mbr_add
    // to accept the org's `created_by` as access (pending DB follow-up); until
    // that lands this throws (42501) and org creation fails here loudly.
    const ownerResult = await membershipsService.add({
      containerType: "organization",
      containerId: org.id,
      userId,
      organizationId: org.id,
      role: "owner",
    });
    if (isScopesRpcErr(ownerResult)) {
      throw new Error(ownerResult.error.message);
    }

    return { ...org, role: "owner" } as HierarchyOrg;
  },

  async createProject(data: {
    name: string;
    organization_id?: string;
    description?: string;
  }): Promise<HierarchyProject> {
    // Delegate to the canonical create path. The owner membership is written to
    // the canonical `iam.memberships` store by `createProjectCanonical` (via
    // `membershipsService.add`), and `is_personal` is derived from the org.
    // Without that member row the project becomes invisible to `/projects` and
    // to every permission/sharing query that traverses project membership.
    //
    // The canonical service resolves missing organization ids to the user's
    // real personal organization, so project rows are never left unscoped.
    const result = await createProjectCanonical({
      name: data.name,
      slug: generateProjectSlug(data.name),
      organizationId: data.organization_id ?? undefined,
      description: data.description,
    });

    if (!result.success || !result.project) {
      throw new Error(result.error ?? "Failed to create project");
    }

    const proj = result.project;
    return {
      id: proj.id,
      name: proj.name,
      slug: proj.slug,
      description: proj.description ?? null,
      organization_id: proj.organizationId ?? null,
      settings: (proj.settings as Record<string, unknown> | null) ?? null,
      created_at: proj.createdAt,
      created_by: proj.createdBy ?? null,
    };
  },

  async createTask(data: {
    title: string;
    project_id: string;
    parent_task_id?: string;
    description?: string;
    status?: string;
    priority?: string;
  }): Promise<HierarchyTask> {
    const userId = requireUserId();

    const { priority, ...taskRest } = data;
    const { data: task, error } = await workspaceDb(supabase)
      .from("tasks")
      .insert({
        ...taskRest,
        organization_id: await ensureOrgId(undefined),
        status: data.status ?? "not_started",
        priority: toTaskPriority(priority),
        created_by: userId,
        settings: {},
      })
      .select()
      .single();
    if (error) throw error;
    return task as HierarchyTask;
  },

  // ─── Update entity ─────────────────────────────────────────────
  async updateOrganization(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<void> {
    const { error } = await supabase
      .schema("iam")
      .from("organizations")
      .update(data)
      .eq("id", id);
    if (error) throw error;
  },

  async updateProject(
    id: string,
    data: {
      name?: string;
      description?: string;
      organization_id?: string | null;
    },
  ): Promise<void> {
    const { error } = await workspaceDb(supabase)
      .from("projects")
      .update(data)
      .eq("id", id);
    if (error) throw error;
  },

  async updateTask(
    id: string,
    data: {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      due_date?: string | null;
      project_id?: string | null;
    },
  ): Promise<void> {
    const { priority, ...rest } = data;
    const patch: Database["workspace"]["Tables"]["tasks"]["Update"] = {
      ...rest,
    };
    if (priority !== undefined) {
      patch.priority = toTaskPriority(priority);
    }
    const { error } = await workspaceDb(supabase)
      .from("tasks")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
  },

  // ─── Delete entity ──────────────────────────────────────────────
  async deleteTask(id: string): Promise<void> {
    const { error } = await workspaceDb(supabase)
      .from("tasks")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async deleteProject(id: string): Promise<void> {
    const { error } = await workspaceDb(supabase)
      .from("projects")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async deleteOrganization(id: string): Promise<void> {
    const { error: projErr } = await workspaceDb(supabase)
      .from("projects")
      .delete()
      .eq("organization_id", id);
    if (projErr) throw projErr;

    // Membership rows live in iam.memberships (no client grant; no public
    // hard-delete RPC). They must be removed by an ON DELETE CASCADE on
    // memberships.organization_id — pending DB follow-up. Until that lands this
    // delete will fail loudly on the FK rather than silently orphan rows.
    const { error } = await supabase
      .schema("iam")
      .from("organizations")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  // ─── RPC-based tree fetchers ────────────────────────────────────────

  async fetchNavTree(): Promise<NavTreeResponse> {
    const { data, error } = await supabase.rpc("get_user_nav_tree");
    if (error) throw error;
    return (data as unknown as NavTreeResponse) ?? { organizations: [] };
  },

  async fetchFullContext(): Promise<FullContextResponse> {
    const { data, error } = await supabase.rpc("get_user_full_context");
    if (error) throw error;
    return (data as unknown as FullContextResponse) ?? { organizations: [] };
  },

  // ─── Move / reparent ──────────────────────────────────────────────
  async moveProject(
    projectId: string,
    target: { organization_id?: string | null },
  ): Promise<void> {
    const { error } = await workspaceDb(supabase)
      .from("projects")
      .update(target)
      .eq("id", projectId);
    if (error) throw error;
  },

  async moveTask(
    taskId: string,
    target: { project_id?: string | null; parent_task_id?: string | null },
  ): Promise<void> {
    const { error } = await workspaceDb(supabase)
      .from("tasks")
      .update(target)
      .eq("id", taskId);
    if (error) throw error;
  },

  // ─── Resolve entity name by type + id (for breadcrumbs) ─────────
  async resolveEntityName(
    type: HierarchyNodeType,
    id: string,
  ): Promise<string | null> {
    if (type === "user") return null;
    const nameCol = type === "task" ? "title" : "name";

    // organizations live in `public`; projects/tasks moved to the `workspace`
    // schema. Route each to the right client/table.
    let row: { data: any; error: any };
    if (type === "organization") {
      row = await supabase
        .schema("iam")
        .from("organizations")
        .select(nameCol)
        .eq("id", id)
        .single();
    } else {
      const table =
        type === "project" ? ("projects" as const) : ("tasks" as const);
      row = await workspaceDb(supabase)
        .from(table)
        .select(nameCol)
        .eq("id", id)
        .single();
    }
    if (row.error) return null;
    return (row.data as any)?.[nameCol] ?? null;
  },

  async resolveAncestors(
    type: HierarchyNodeType,
    id: string,
  ): Promise<Array<{ type: HierarchyNodeType; id: string; name: string }>> {
    const chain: Array<{ type: HierarchyNodeType; id: string; name: string }> =
      [];

    if (type === "task") {
      const { data: task } = await workspaceDb(supabase)
        .from("tasks")
        .select("title, project_id")
        .eq("id", id)
        .single();
      if (task) {
        chain.unshift({ type: "task", id, name: task.title });
        if (task.project_id) {
          const parents = await this.resolveAncestors(
            "project",
            task.project_id,
          );
          chain.unshift(...parents);
        }
      }
    } else if (type === "project") {
      const { data: proj } = await workspaceDb(supabase)
        .from("projects")
        .select("name, organization_id")
        .eq("id", id)
        .single();
      if (proj) {
        chain.unshift({ type: "project", id, name: proj.name });
        if (proj.organization_id) {
          const parents = await this.resolveAncestors(
            "organization",
            proj.organization_id,
          );
          chain.unshift(...parents);
        }
      }
    } else if (type === "organization") {
      const { data: org } = await supabase
        .schema("iam")
        .from("organizations")
        .select("name")
        .eq("id", id)
        .single();
      if (org) {
        chain.unshift({ type: "organization", id, name: org.name });
      }
    }

    return chain;
  },
};
