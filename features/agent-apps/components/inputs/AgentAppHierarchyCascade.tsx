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
 *   The wrapper hydrates the current assignments on mount. HierarchyCascade
 *   is MULTI-SCOPE (id-keyed, checkbox semantics) — every assigned scope id
 *   maps straight into the selection, none are dropped.
 *
 * Mirrors the persistence pattern used by NoteContextPicker /
 * TaskScopeTags. No more flat-FK-only shortcut.
 */

import { useMemo } from "react";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import type { HierarchySelection } from "@/features/agent-context/components/hierarchy-selection/types";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
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
  // ── Derive the id-keyed multi-scope shape the cascade wants ────────
  // MULTI-SCOPE (2026-07-07): every assigned scope id is selected — no
  // first-wins trimming, no per-type radio.
  const scopeSelections = useMemo<Record<string, string | null>>(
    () => Object.fromEntries(assignedScopeIds.map((id) => [id, id])),
    [assignedScopeIds],
  );

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
    const orgChanged = next.organizationId !== organizationId;
    if (orgChanged) {
      onOrganizationChange(next.organizationId);
    }

    const nextScopes = next.scopeSelections ?? {};
    const nextScopeIds = Object.values(nextScopes).filter(
      (v): v is string => !!v,
    );
    const scopesChanged = !(
      nextScopeIds.length === assignedScopeIds.length &&
      nextScopeIds.every((id) => assignedScopeIds.includes(id))
    );
    if (scopesChanged) {
      void setScopes(nextScopeIds);
    }

    // A scope toggle bundles `projectId/taskId: null` as a picker-side reset
    // (the scope filter changes the project list). That reset must NOT trim
    // the app's persisted project/task FK columns — same guard as
    // useReduxBridge, which early-returns when the scope set changed. An org
    // change still cascades the nulls (cross-org project/task are invalid).
    if (scopesChanged && !orgChanged) return;

    if (next.projectId !== projectId) {
      onProjectChange(next.projectId);
    }
    if (next.taskId !== taskId) {
      onTaskChange(next.taskId);
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
