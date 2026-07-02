"use client";

import { useCallback, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  associateWithTask,
  dissociateFromTask,
  createTaskWithAssociation,
  createTasksBulk,
} from "@/features/tasks/redux/taskAssociationsSlice";
import {
  selectOrganizationId,
  selectProjectId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";

export interface TaskSource {
  entity_type: string;
  entity_id: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAndAssociateInput {
  title: string;
  description?: string | null;
  priority?: "low" | "medium" | "high" | null;
  due_date?: string | null;
  project_id?: string | null;
  organization_id?: string | null;
  scope_ids?: string[];
  source?: TaskSource;
}

export interface BulkItemsInput {
  items: {
    title: string;
    description?: string;
    priority?: "low" | "medium" | "high" | null;
    due_date?: string | null;
    status?: string;
  }[];
  project_id?: string | null;
  organization_id?: string | null;
  scope_ids?: string[];
  source?: TaskSource;
  metadata?: Record<string, unknown>;
}

/**
 * The single shared hook that powers every task-widget. Hides the Redux
 * plumbing behind a tight callback-style API so widgets can stay small.
 *
 * Pulls sensible defaults from the active app context (org, project,
 * selected scopes) — callers only need to pass what they want to override.
 */
export function useAssociateTask() {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectOrganizationId);
  const projectId = useAppSelector(selectProjectId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultScopeIds = Object.values(scopeSelections).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  const associate = useCallback(
    async (taskId: string, source: TaskSource) => {
      setIsBusy(true);
      setError(null);
      try {
        await dispatch(
          associateWithTask({
            taskId,
            entityType: source.entity_type,
            entityId: source.entity_id,
            label: source.label,
            metadata: source.metadata,
          }),
        ).unwrap();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to associate");
        throw e;
      } finally {
        setIsBusy(false);
      }
    },
    [dispatch],
  );

  const dissociate = useCallback(
    async (taskId: string, source: TaskSource) => {
      setIsBusy(true);
      setError(null);
      try {
        await dispatch(
          dissociateFromTask({
            taskId,
            entityType: source.entity_type,
            entityId: source.entity_id,
          }),
        ).unwrap();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to dissociate");
        throw e;
      } finally {
        setIsBusy(false);
      }
    },
    [dispatch],
  );

  const createAndAssociate = useCallback(
    async (input: CreateAndAssociateInput): Promise<string | null> => {
      setIsBusy(true);
      setError(null);
      try {
        const res = await dispatch(
          createTaskWithAssociation({
            title: input.title,
            description: input.description,
            priority: input.priority ?? null,
            due_date: input.due_date ?? null,
            project_id:
              input.project_id !== undefined
                ? input.project_id
                : (projectId ?? null),
            organization_id:
              input.organization_id !== undefined
                ? input.organization_id
                : (orgId ?? null),
            scope_ids:
              input.scope_ids !== undefined ? input.scope_ids : defaultScopeIds,
            entity_type: input.source?.entity_type ?? null,
            entity_id: input.source?.entity_id ?? null,
            label: input.source?.label ?? null,
            metadata: input.source?.metadata ?? {},
          }),
        ).unwrap();
        return res?.taskId ?? null;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create task");
        return null;
      } finally {
        setIsBusy(false);
      }
    },
    [dispatch, orgId, projectId, defaultScopeIds],
  );

  const createBulk = useCallback(
    async (input: BulkItemsInput) => {
      setIsBusy(true);
      setError(null);
      try {
        const res = await dispatch(
          createTasksBulk({
            items: input.items,
            project_id:
              input.project_id !== undefined
                ? input.project_id
                : (projectId ?? null),
            organization_id:
              input.organization_id !== undefined
                ? input.organization_id
                : (orgId ?? null),
            scope_ids:
              input.scope_ids !== undefined ? input.scope_ids : defaultScopeIds,
            entity_type: input.source?.entity_type ?? null,
            entity_id: input.source?.entity_id ?? null,
            metadata: input.metadata ?? input.source?.metadata ?? {},
          }),
        ).unwrap();
        return res?.tasks ?? [];
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create tasks");
        return [];
      } finally {
        setIsBusy(false);
      }
    },
    [dispatch, orgId, projectId, defaultScopeIds],
  );

  return {
    associate,
    dissociate,
    createAndAssociate,
    createBulk,
    isBusy,
    error,
  };
}
