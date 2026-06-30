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
 * - Scope tags (scopeSelections) → many-to-many join via the canonical
 *   association edge (entity_type='app', entity_id=<app.id>, scope_ids=[...]).
 *   The wrapper hydrates the current assignments on mount and re-derives the
 *   {typeId → scopeId} shape that HierarchyCascade expects from the
 *   raw scope-id list + the scope catalogue.
 *
 * Mirrors the persistence pattern used by NoteContextPicker /
 * TaskScopeTags. No more flat-FK-only shortcut.
 */

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import type { HierarchySelection } from "@/features/agent-context/components/hierarchy-selection/types";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { selectAllScopesFlat } from "@/features/scopes/redux/selectors/tree";
import type { EntityType } from "@/features/scopes/types";

// Agent apps live in app.definition (registry token `app`). The pre-reorg
// `agent_app` token was renamed to `app` in platform.entity_types — use canonical.
const ENTITY_TYPE: EntityType = "app";

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
  // ── Hydrate this app's scope assignments via the canonical hook ───
  // `useEntityScopes` lazy-fetches on mount, dedupes in-flight requests,
  // and exposes `setScopes` which writes through `scopesService` and
  // patches the per-entity cache + project tree in one shot.
  const { scopeIds: assignedScopeIds, setScopes } = useEntityScopes({
    entityType: ENTITY_TYPE,
    entityId: appId,
    organizationId,
  });
  const allScopes = useAppSelector(selectAllScopesFlat);

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
      void setScopes(nextScopeIds);
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
