"use client";

import { useState, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectScopePickerOptions, EMPTY_SCOPE_PICKER_OPTIONS } from "@/features/agent-context/redux/scope/selectors";
import { useProjectTasks } from "@/features/agent-context/hooks/useHierarchy";
import { fetchEntitiesByScopes } from "@/features/agent-context/redux/scope/scopeAssignmentsSlice";
import type {
  HierarchyLevel,
  HierarchySelection,
  HierarchyOption,
  ScopeTypeLevel,
  UseHierarchySelectionReturn,
} from "./types";
import { EMPTY_SELECTION } from "./types";

/**
 * Enforces the hierarchy rule: you cannot include levels both above AND below
 * scopes without including scopes themselves.
 *
 * Valid patterns:
 *   - ["organization"] — org only, no scopes needed
 *   - ["organization", "scope"] — org + scopes, no project
 *   - ["organization", "scope", "project"] — org + scopes + project
 *   - ["organization", "scope", "project", "task"] — full hierarchy
 *   - ["project"] — project only, no org above = no scopes needed
 *   - ["project", "task"] — project + task only
 *   - ["task"] — task only
 *
 * INVALID (throws in dev, auto-corrects in prod):
 *   - ["organization", "project"] — skips scopes between org and project
 *   - ["organization", "project", "task"] — skips scopes
 *   - ["organization", "task"] — skips scopes AND project
 */
function enforceHierarchyLevels(requested: HierarchyLevel[]): HierarchyLevel[] {
  const hasOrg = requested.includes("organization");
  const hasProject = requested.includes("project");
  const hasTask = requested.includes("task");
  const hasScope = requested.includes("scope");

  if (hasOrg && (hasProject || hasTask) && !hasScope) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[HierarchySelection] Invalid levels configuration: cannot include " +
          "organization AND project/task without scope in between.\n" +
          `Received: [${requested.join(", ")}]\n` +
          "Scope has been automatically inserted. Please fix the levels prop at the callsite.",
      );
    }
    const corrected: HierarchyLevel[] = [];
    for (const lvl of requested) {
      corrected.push(lvl);
      if (lvl === "organization") corrected.push("scope");
    }
    return corrected;
  }

  return requested;
}

/** The canonical full hierarchy — use as the default everywhere */
export const FULL_HIERARCHY_LEVELS: HierarchyLevel[] = [
  "organization",
  "scope",
  "project",
  "task",
];

interface UseHierarchySelectionOptions {
  levels?: HierarchyLevel[];
  controlled?: {
    value: HierarchySelection;
    onChange: (selection: HierarchySelection) => void;
  };
  /**
   * Seed the organization level from the organization the PERSON selected
   * (`appContext.organization_id`) when the caller mounts with nothing chosen.
   * It never picks "the first organization in the list": a membership in
   * someone else's personal workspace can sort first, and this selection is
   * what downstream writes are filed under. With no selection the level stays
   * empty and the cascade's own organization picker is the remedy.
   * Law: common-docs/policies/context-is-carried-never-rebuilt.md.
   */
  autoSelectActiveOrg?: boolean;
}

export function useHierarchySelection(
  options: UseHierarchySelectionOptions = {},
): UseHierarchySelectionReturn {
  const {
    levels: requestedLevels = FULL_HIERARCHY_LEVELS,
    controlled,
    autoSelectActiveOrg = false,
  } = options;

  const levels = enforceHierarchyLevels(requestedLevels);
  const dispatch = useAppDispatch();
  // The organization the person selected — the ONE seed for the org level.
  const activeOrganizationId = useAppSelector(selectOrganizationId);

  // All data comes from a single Redux store populated by get_user_full_context.
  // No secondary per-org fetches needed.
  const {
    orgs: rawOrgs,
    flatProjects,
    isLoading,
    isError,
    isSuccess,
  } = useNavTree();

  const [internal, setInternal] = useState<HierarchySelection>(EMPTY_SELECTION);
  const [scopeFilteredProjectIds, setScopeFilteredProjectIds] =
    useState<Set<string> | null>(null);

  const selection = controlled ? controlled.value : internal;
  const setSelection = controlled ? controlled.onChange : setInternal;

  const { data: rawTasks } = useProjectTasks(
    levels.includes("task") ? selection.projectId : null,
  );

  const includesScopes = levels.includes("scope");
  const selectedOrgId = selection.organizationId;
  const scopeSelections = selection.scopeSelections ?? {};

  // Scope types and values are already in Redux — hydrated from the full context
  // response by the thunk. No per-org secondary fetches required.
  const pickerOptions = useAppSelector((state) =>
    selectedOrgId && includesScopes
      ? selectScopePickerOptions(state, selectedOrgId)
      : EMPTY_SCOPE_PICKER_OPTIONS,
  );

  const scopeLevels: ScopeTypeLevel[] = pickerOptions.map((group) => ({
    typeId: group.type_id,
    label: group.label.replace(/s$/i, ""),
    pluralLabel: group.label,
    icon: group.icon,
    color: group.color,
    sortOrder: 0,
    options: group.options.map((o) => ({
      id: o.value,
      name: o.label,
    })),
  }));

  // When scope selections change, fetch the project IDs that match those scopes.
  // This is a targeted lookup (not a full refetch) and is still needed.
  const activeScopeIds = Object.values(scopeSelections).filter(
    Boolean,
  ) as string[];
  const activeScopeKey = activeScopeIds.sort().join(",");

  const lastScopeKey = useRef("");
  useEffect(() => {
    if (activeScopeKey === lastScopeKey.current) return;
    lastScopeKey.current = activeScopeKey;

    if (activeScopeIds.length === 0) {
      setScopeFilteredProjectIds(null);
      return;
    }

    dispatch(
      fetchEntitiesByScopes({
        scope_ids: activeScopeIds,
        entity_type: "project",
        match_all: false,
      }),
    )
      .unwrap()
      .then((entities) => {
        setScopeFilteredProjectIds(new Set(entities.map((e) => e.entity_id)));
      })
      .catch(() => {
        setScopeFilteredProjectIds(null);
      });
  }, [dispatch, activeScopeKey]);

  const orgs: HierarchyOption[] = rawOrgs.map((o) => ({
    id: o.id,
    name: o.name,
    // CONVERGE: C-3 — is_personal is dropped; the default organization becomes users default_organization_id preference — declared 2026-09-10, Data Doctrine R9–R12. Register: /projects/data-doctrine-adoption/REGISTER.md#DD-045
    isPersonal: o.is_personal,
    role: o.role,
  }));

  const allProjects = selectedOrgId
    ? flatProjects.filter((p) => p.org_id === selectedOrgId)
    : flatProjects;

  const projects: HierarchyOption[] = allProjects
    .filter(
      (p) => !scopeFilteredProjectIds || scopeFilteredProjectIds.has(p.id),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
    }));

  const tasks: HierarchyOption[] = (rawTasks ?? []).map((t) => ({
    id: t.id,
    name: t.title,
    status: t.status ?? null,
  }));

  useEffect(() => {
    if (!autoSelectActiveOrg || !isSuccess) return;
    if (selection.organizationId || !activeOrganizationId) return;
    const active = orgs.find((o) => o.id === activeOrganizationId);
    if (!active) return;
    setSelection({
      ...EMPTY_SELECTION,
      organizationId: active.id,
      organizationName: active.name,
    });
  }, [autoSelectActiveOrg, isSuccess, orgs.length, activeOrganizationId]);

  const setOrg = (id: string | null) => {
    const org = id ? orgs.find((o) => o.id === id) : null;
    setScopeFilteredProjectIds(null);
    setSelection({
      organizationId: id,
      organizationName: org?.name ?? null,
      projectId: null,
      projectName: null,
      taskId: null,
      taskName: null,
      scopeSelections: {},
    });
  };

  const setProject = (id: string | null) => {
    const proj = id ? projects.find((p) => p.id === id) : null;
    setSelection({
      ...selection,
      projectId: id,
      projectName: proj?.name ?? null,
      taskId: null,
      taskName: null,
    });
  };

  const setTask = (id: string | null) => {
    const task = id ? tasks.find((t) => t.id === id) : null;
    setSelection({
      ...selection,
      taskId: id,
      taskName: task?.name ?? null,
    });
  };

  // MULTI-SCOPE (Arman, 2026-07-07): scopeSelections is keyed by SCOPE ID
  // (value === key), matching appContextSlice.scope_selections. Toggling a
  // scope never evicts same-type siblings — checkbox semantics, never radio.
  const toggleScope = (scopeId: string) => {
    const nextScopes = { ...scopeSelections };
    if (nextScopes[scopeId]) {
      delete nextScopes[scopeId];
    } else {
      nextScopes[scopeId] = scopeId;
    }
    setSelection({
      ...selection,
      scopeSelections: nextScopes,
      projectId: null,
      projectName: null,
      taskId: null,
      taskName: null,
    });
  };

  const clearScopeType = (typeId: string) => {
    const typeScopeIds = new Set(
      (scopeLevels.find((l) => l.typeId === typeId)?.options ?? []).map(
        (o) => o.id,
      ),
    );
    const nextScopes: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(scopeSelections)) {
      if (!typeScopeIds.has(k)) nextScopes[k] = v;
    }
    setSelection({
      ...selection,
      scopeSelections: nextScopes,
      projectId: null,
      projectName: null,
      taskId: null,
      taskName: null,
    });
  };

  const clear = () => {
    setScopeFilteredProjectIds(null);
    setSelection(EMPTY_SELECTION);
  };

  return {
    orgs,
    projects,
    tasks,
    scopeLevels,
    isLoading,
    isError,
    selection,
    setOrg,
    setProject,
    setTask,
    toggleScope,
    clearScopeType,
    clear,
  };
}
