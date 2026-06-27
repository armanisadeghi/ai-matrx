"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { hierarchyService } from "../service/hierarchyService";
import type {
  HierarchyNode,
  HierarchyNodeType,
} from "../service/hierarchyService";
import {
  invalidateAndRefetchNavTree,
  invalidateAndRefetchFullContext,
  invalidateAndRefetchAll,
} from "@/features/agent-context/redux/hierarchyThunks";
import {
  upsertOrgWithLevel,
  removeOrgFromSlice,
} from "@/features/agent-context/redux/organizationsSlice";
import {
  upsertProjectWithLevel,
  removeProjectFromSlice,
  adjustProjectTaskCount,
} from "@/features/agent-context/redux/projectsSlice";
import {
  upsertTaskWithLevel,
  removeTaskFromSlice,
} from "@/features/agent-context/redux/tasksSlice";
import { matchesSearch } from "@/utils/search-scoring";

const KEYS = {
  tree: () => ["hierarchy-tree"] as const,
  orgs: () => ["hierarchy-orgs"] as const,
  projects: (parentId: string) => ["hierarchy-projects", parentId] as const,
  tasks: (projectId: string) => ["hierarchy-tasks", projectId] as const,
  ancestors: (type: string, id: string) =>
    ["hierarchy-ancestors", type, id] as const,
};

// ─── Full tree (legacy HierarchyNode shape for HierarchyTreePage) ────

export function useHierarchyTree() {
  return useQuery({
    queryKey: KEYS.tree(),
    queryFn: () => hierarchyService.fetchFullTree(),
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Organizations ──────────────────────────────────────────────────

export function useUserOrganizations() {
  return useQuery({
    queryKey: KEYS.orgs(),
    queryFn: () => hierarchyService.fetchUserOrganizations(),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Projects ───────────────────────────────────────────────────────

export function useOrgProjects(orgId: string | null) {
  return useQuery({
    queryKey: KEYS.projects(`org-${orgId ?? ""}`),
    queryFn: () => hierarchyService.fetchProjects({ orgId: orgId! }),
    enabled: !!orgId,
  });
}

// ─── Tasks ──────────────────────────────────────────────────────────

export function useProjectTasks(projectId: string | null) {
  return useQuery({
    queryKey: KEYS.tasks(projectId ?? ""),
    queryFn: () => hierarchyService.fetchProjectTasks(projectId!),
    enabled: !!projectId,
  });
}

// ─── Ancestors (for breadcrumbs) ─────────────────────────────────────

export function useAncestors(type: HierarchyNodeType, id: string | null) {
  return useQuery({
    queryKey: KEYS.ancestors(type, id ?? ""),
    queryFn: () => hierarchyService.resolveAncestors(type, id!),
    enabled: !!id && type !== "user",
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Shared invalidation helper ──────────────────────────────────────

function useInvalidateAll() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: KEYS.tree() });
    dispatch(invalidateAndRefetchNavTree() as any);
  }, [qc, dispatch]);
}

function useInvalidateAfterTaskMutation() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: KEYS.tree() });
    dispatch(invalidateAndRefetchFullContext() as any);
  }, [qc, dispatch]);
}

// ─── Mutations ──────────────────────────────────────────────────────

export function useCreateOrganization() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (data: { name: string; slug: string; description?: string }) =>
      hierarchyService.createOrganization(data),
    onSuccess: (org) => {
      // Upsert the new org into the normalized slice immediately
      dispatch(
        upsertOrgWithLevel({
          record: {
            id: org.id,
            name: org.name,
            slug: org.slug,
            is_personal: org.is_personal ?? false,
            role: org.role,
            description: org.description,
            logo_url: org.logo_url,
            settings: org.settings ?? undefined,
            created_at: org.created_at,
          },
          level: "full-data",
        }),
      );
      // Also refresh the full context so the sidebar picks up the new org
      qc.invalidateQueries({ queryKey: KEYS.tree() });
      dispatch(invalidateAndRefetchFullContext() as any);
      toast.success("Organization created");
    },
    onError: (err: Error) =>
      toast.error("Failed to create organization", {
        description: err.message,
      }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (data: {
      name: string;
      organization_id?: string;
      description?: string;
    }) => hierarchyService.createProject(data),
    onSuccess: (proj) => {
      // Upsert the new project into the normalized slice immediately
      dispatch(
        upsertProjectWithLevel({
          record: {
            id: proj.id,
            name: proj.name,
            slug: proj.slug,
            organization_id: proj.organization_id,
            // Personal-ness is org-derived and no longer on HierarchyProject;
            // the invalidateAndRefetchFullContext below re-hydrates the correct
            // value from the nav tree (RPC-derived). Default false until then.
            is_personal: false,
            open_task_count: 0,
            total_task_count: 0,
            scope_tags: [],
            description: proj.description,
            settings: proj.settings ?? undefined,
            created_at: proj.created_at,
            created_by: proj.created_by,
          },
          level: "full-data",
        }),
      );
      // Refresh full context to pick up the new project in the hierarchy
      qc.invalidateQueries({ queryKey: KEYS.tree() });
      dispatch(invalidateAndRefetchFullContext() as any);
      toast.success("Project created");
    },
    onError: (err: Error) =>
      toast.error("Failed to create project", { description: err.message }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (data: {
      title: string;
      project_id: string;
      organization_id: string;
      parent_task_id?: string;
      description?: string;
      status?: string;
      priority?: string;
    }) => {
      const { organization_id: _orgId, ...serviceData } = data;
      return hierarchyService.createTask(serviceData);
    },
    onSuccess: (task, variables) => {
      // Upsert the new task into the normalized slice immediately
      dispatch(
        upsertTaskWithLevel({
          record: {
            id: task.id,
            title: task.title,
            status: task.status ?? "not_started",
            priority: task.priority ?? null,
            due_date: task.due_date ?? null,
            assignee_id: task.assignee_id ?? null,
            project_id: task.project_id ?? null,
            parent_task_id: task.parent_task_id ?? null,
            organization_id: variables.organization_id,
            description: task.description ?? null,
            settings: task.settings ?? undefined,
            created_at: task.created_at ?? null,
            created_by: task.created_by ?? null,
          },
          level: "full-data",
        }),
      );
      // Optimistically increment the project's open task count
      if (task.project_id) {
        dispatch(
          adjustProjectTaskCount({
            projectId: task.project_id,
            openDelta: 1,
            totalDelta: 1,
          }),
        );
      }
      qc.invalidateQueries({ queryKey: KEYS.tasks(task.project_id ?? "") });
      toast.success("Task created");
    },
    onError: (err: Error) =>
      toast.error("Failed to create task", { description: err.message }),
  });
}

export function useUpdateEntity() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      type: HierarchyNodeType;
      id: string;
      data: Record<string, unknown>;
    }) => {
      const { type, id, data } = params;
      switch (type) {
        case "organization":
          return hierarchyService.updateOrganization(id, data as any);
        case "project":
          return hierarchyService.updateProject(id, data as any);
        case "task":
          return hierarchyService.updateTask(id, data as any);
        default:
          throw new Error(`Cannot update type: ${type}`);
      }
    },
    onSuccess: (_result, params) => {
      // For updates, invalidate the full context to ensure consistency
      qc.invalidateQueries({ queryKey: KEYS.tree() });
      dispatch(invalidateAndRefetchFullContext() as any);
      toast.success("Updated successfully");
    },
    onError: (err: Error) =>
      toast.error("Failed to update", { description: err.message }),
  });
}

export function useDeleteEntity() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { type: HierarchyNodeType; id: string }) => {
      const { type, id } = params;
      switch (type) {
        case "task":
          return hierarchyService.deleteTask(id);
        case "project":
          return hierarchyService.deleteProject(id);
        case "organization":
          return hierarchyService.deleteOrganization(id);
        default:
          throw new Error(`Delete not supported for: ${type}`);
      }
    },
    onSuccess: (_result, params) => {
      // Remove from normalized slices synchronously (DB call already succeeded)
      if (params.type === "task") {
        dispatch(removeTaskFromSlice(params.id));
      } else if (params.type === "project") {
        dispatch(removeProjectFromSlice(params.id));
      } else if (params.type === "organization") {
        dispatch(removeOrgFromSlice(params.id));
      }
      qc.invalidateQueries({ queryKey: KEYS.tree() });
      dispatch(invalidateAndRefetchFullContext() as any);
      toast.success("Deleted successfully");
    },
    onError: (err: Error) =>
      toast.error("Failed to delete", { description: err.message }),
  });
}

export function useMoveProject() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (params: {
      projectId: string;
      target: { organization_id?: string | null };
    }) => hierarchyService.moveProject(params.projectId, params.target),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.tree() });
      dispatch(invalidateAndRefetchFullContext() as any);
      toast.success("Project moved");
    },
    onError: (err: Error) =>
      toast.error("Failed to move project", { description: err.message }),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (params: {
      taskId: string;
      target: { project_id?: string | null; parent_task_id?: string | null };
    }) => hierarchyService.moveTask(params.taskId, params.target),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.tree() });
      dispatch(invalidateAndRefetchFullContext() as any);
      toast.success("Task moved");
    },
    onError: (err: Error) =>
      toast.error("Failed to move task", { description: err.message }),
  });
}

// ─── Utility: filter tree by search ─────────────────────────────────

export function filterHierarchyTree(
  nodes: HierarchyNode[],
  query: string,
): HierarchyNode[] {
  if (!query.trim()) return nodes;

  function prune(node: HierarchyNode): HierarchyNode | null {
    if (
      matchesSearch(node, query, [
        { get: (n) => n.name, weight: "title" },
        { get: (n) => n.description, weight: "body" },
      ])
    ) {
      return node;
    }
    const filteredChildren = node.children
      .map(prune)
      .filter(Boolean) as HierarchyNode[];
    if (filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
        childCount: filteredChildren.length,
      };
    }
    return null;
  }

  return nodes.map(prune).filter(Boolean) as HierarchyNode[];
}

// ─── Utility: count all descendant nodes ────────────────────────────

export function countDescendants(node: HierarchyNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}
