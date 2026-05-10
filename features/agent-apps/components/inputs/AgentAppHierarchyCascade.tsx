"use client";

/**
 * AgentAppHierarchyCascade
 *
 * Controlled wrapper around the project-wide HierarchyCascade that
 * persists every dimension correctly:
 *
 * - Organization / Project / Task → flat FK columns on aga_apps.
 *   Saved via `saveAppField` (one PATCH per dimension that actually
 *   changed).
 * - Scope tags (scopeSelections) → many-to-many join via
 *   `set_entity_scopes(entity_type='agent_app', entity_id=<app.id>,
 *   scope_ids=[...])`. The wrapper hydrates the current assignments
 *   from `get_entity_scopes` on mount and re-derives the
 *   {typeId → scopeId} shape that HierarchyCascade expects from the
 *   raw scope-id list + the scope catalogue.
 *
 * Mirrors the persistence pattern used by NoteContextPicker /
 * TaskScopeTags. No more flat-FK-only shortcut.
 */

import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import type { HierarchySelection } from "@/features/agent-context/components/hierarchy-selection/types";
import {
  fetchEntityScopes,
  setEntityScopes,
  selectScopeIdsForEntity,
} from "@/features/agent-context/redux/scope/scopeAssignmentsSlice";
import { selectAllScopes } from "@/features/agent-context/redux/scope/scopesSlice";

const ENTITY_TYPE = "agent_app";

interface AgentAppHierarchyCascadeProps {
  appId: string;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  onOrganizationChange: (next: string | null) => void;
  onProjectChange: (next: string | null) => void;
  onTaskChange: (next: string | null) => void;
  disabled?: boolean;
}

export function AgentAppHierarchyCascade({
  appId,
  organizationId,
  projectId,
  taskId,
  onOrganizationChange,
  onProjectChange,
  onTaskChange,
  disabled,
}: AgentAppHierarchyCascadeProps) {
  const dispatch = useAppDispatch();

  // ── Hydrate this app's scope assignments once on mount ─────────────
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(
      fetchEntityScopes({ entity_type: ENTITY_TYPE, entity_id: appId }),
    );
  }, [dispatch, appId]);

  // ── Read the current assignments + scope catalogue ─────────────────
  const assignedScopeIds = useAppSelector((state) =>
    selectScopeIdsForEntity(state, ENTITY_TYPE, appId),
  );
  const allScopes = useAppSelector(selectAllScopes);

  // ── Derive the {typeId → scopeId} shape the cascade wants ──────────
  // The cascade enforces one selection per scope-type. If multiple
  // scope_ids of the same type happen to be assigned, the first wins
  // for display purposes (set_entity_scopes is the authoritative writer
  // — it'll trim the rest on the next save).
  const scopeSelections = useMemo<Record<string, string | null>>(() => {
    const out: Record<string, string | null> = {};
    for (const scopeId of assignedScopeIds) {
      const scope = allScopes.find((s) => s.id === scopeId);
      if (!scope) continue;
      if (out[scope.scope_type_id] != null) continue;
      out[scope.scope_type_id] = scopeId;
    }
    return out;
  }, [assignedScopeIds, allScopes]);

  // ── Build the controlled value the cascade consumes ────────────────
  const value: HierarchySelection = useMemo(
    () => ({
      organizationId,
      organizationName: null,
      projectId,
      projectName: null,
      taskId,
      taskName: null,
      scopeSelections,
    }),
    [organizationId, projectId, taskId, scopeSelections],
  );

  // ── Diff the cascade's onChange against current state and persist ──
  // Each dimension persists on its own channel:
  //   - org / project / task → flat aga_apps FK columns
  //   - scopeSelections → set_entity_scopes RPC
  const handleChange = (next: HierarchySelection) => {
    if (next.organizationId !== organizationId) {
      onOrganizationChange(next.organizationId);
    }
    if (next.projectId !== projectId) {
      onProjectChange(next.projectId);
    }
    if (next.taskId !== taskId) {
      onTaskChange(next.taskId);
    }

    const nextScopes = next.scopeSelections ?? {};
    const nextScopeIds = Object.values(nextScopes).filter(
      (v): v is string => !!v,
    );
    const sameSet =
      nextScopeIds.length === assignedScopeIds.length &&
      nextScopeIds.every((id) => assignedScopeIds.includes(id));
    if (!sameSet) {
      dispatch(
        setEntityScopes({
          entity_type: ENTITY_TYPE,
          entity_id: appId,
          scope_ids: nextScopeIds,
        }),
      );
    }
  };

  return (
    <HierarchyCascade
      levels={["organization", "scope", "project", "task"]}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      layout="vertical"
    />
  );
}
