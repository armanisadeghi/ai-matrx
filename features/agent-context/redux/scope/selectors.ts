"use client";

import { createSelector } from "@reduxjs/toolkit";
import {
  selectAllAssignments,
  selectAssignmentCountByScope,
} from "./scopeAssignmentsSlice";
import { selectAllScopes } from "./scopesSlice";
import { selectAllScopeTypes, selectScopeTypesByOrg } from "./scopeTypesSlice";
import type {
  EntityScopeLabel,
  ScopeAssignment,
  SidebarScopeSection,
  ScopePickerOption,
  Scope,
  ScopeType,
} from "./types";

/** Stable empty references for useSelector fallbacks — never mutate. */
export const EMPTY_SCOPE_PICKER_OPTIONS: ScopePickerOption[] = [];
export const EMPTY_SCOPE_TYPES_LIST: ScopeType[] = [];
export const EMPTY_SCOPES_LIST: Scope[] = [];
/** Stable empty result for scope–entity matching selectors — never mutate. */
export const EMPTY_MATCHING_ENTITY_IDS: string[] = [];
const EMPTY_SCOPE_TYPES_BY_ORG: Record<string, ScopeType[]> = {};
const EMPTY_SCOPES_BY_ORG: Record<string, Scope[]> = {};

type ScopeRootState = {
  scopeTypes: ReturnType<typeof import("./scopeTypesSlice").default>;
  scopes: ReturnType<typeof import("./scopesSlice").default>;
  scopeAssignments: ReturnType<
    typeof import("./scopeAssignmentsSlice").default
  >;
};

export const selectEntityScopesWithLabels = createSelector(
  [
    (state: ScopeRootState) => selectAllAssignments(state),
    (state: ScopeRootState) => selectAllScopes(state),
    (state: ScopeRootState) => selectAllScopeTypes(state),
    (_state: ScopeRootState, entityType: string) => entityType,
    (_state: ScopeRootState, _entityType: string, entityId: string) => entityId,
  ],
  (assignments, scopes, types, entityType, entityId): EntityScopeLabel[] => {
    const entityAssignments = assignments.filter(
      (a) => a.entity_type === entityType && a.entity_id === entityId,
    );
    const scopeMap = new Map(scopes.map((s) => [s.id, s]));
    const typeMap = new Map(types.map((t) => [t.id, t]));

    return entityAssignments.map((a) => {
      const scope = scopeMap.get(a.scope_id);
      const type = scope ? typeMap.get(scope.scope_type_id) : undefined;
      return {
        assignment_id: a.id,
        scope_id: a.scope_id,
        scope_name: scope?.name ?? "Unknown",
        type_id: scope?.scope_type_id ?? "",
        type_label: type?.label_singular ?? "Unknown",
        type_color: type?.color ?? "",
        type_icon: type?.icon ?? "folder",
      };
    });
  },
);

export const selectOrgSidebarStructure = createSelector(
  [
    (state: ScopeRootState, orgId: string) =>
      selectScopeTypesByOrg(state, orgId),
    (state: ScopeRootState) => selectAllScopes(state),
    (state: ScopeRootState) => selectAssignmentCountByScope(state),
  ],
  (types, allScopes, countMap): SidebarScopeSection[] => {
    return types.map((type) => {
      const typeScopes = allScopes.filter((s) => s.scope_type_id === type.id);

      const buildTree = (
        parentId: string | null,
      ): SidebarScopeSection["scopes"] =>
        typeScopes
          .filter((s) => s.parent_scope_id === parentId)
          .map((s) => ({
            id: s.id,
            name: s.name,
            assignment_count: countMap[s.id] ?? 0,
            children: buildTree(s.id),
          }));

      return {
        type_id: type.id,
        label_singular: type.label_singular,
        label_plural: type.label_plural,
        icon: type.icon,
        color: type.color,
        parent_type_id: type.parent_type_id,
        scopes: buildTree(null),
      };
    });
  },
);

/**
 * Pure helper shared by {@link selectEntityIdsByScopes} and task scope filtering.
 * When `scopeIds` is empty, returns {@link EMPTY_MATCHING_ENTITY_IDS} (stable ref).
 */
export function computeMatchingEntityIdsFromAssignments(
  assignments: readonly ScopeAssignment[],
  entityType: string,
  scopeIds: readonly string[],
  matchAll: boolean,
): string[] {
  if (scopeIds.length === 0) return EMPTY_MATCHING_ENTITY_IDS;
  const entityAssignments = assignments.filter(
    (a) => a.entity_type === entityType,
  );
  const map = new Map<string, Set<string>>();
  for (const a of entityAssignments) {
    if (!map.has(a.entity_id)) map.set(a.entity_id, new Set());
    map.get(a.entity_id)!.add(a.scope_id);
  }
  const matching: string[] = [];
  map.forEach((scopeSet, entityId) => {
    const hit = matchAll
      ? scopeIds.every((id) => scopeSet.has(id))
      : scopeIds.some((id) => scopeSet.has(id));
    if (hit) matching.push(entityId);
  });
  return matching;
}

export const selectScopePickerOptions = createSelector(
  [
    (state: ScopeRootState, orgId: string) =>
      selectScopeTypesByOrg(state, orgId),
    (state: ScopeRootState) => selectAllScopes(state),
  ],
  (types, allScopes): ScopePickerOption[] => {
    if (types.length === 0) return EMPTY_SCOPE_PICKER_OPTIONS;
    return types.map((type) => ({
      type_id: type.id,
      label: type.label_plural,
      icon: type.icon,
      color: type.color,
      max_assignments: type.max_assignments_per_entity,
      options: allScopes
        .filter((s) => s.scope_type_id === type.id)
        .map((s) => ({
          value: s.id,
          label: s.name,
          parent_scope_id: s.parent_scope_id,
        })),
    }));
  },
);

/** Memoized map: org id → scope types (for multi-org UIs; avoids new object per dispatch). */
export const selectScopeTypesByOrgIds = createSelector(
  [
    selectAllScopeTypes,
    (_state: ScopeRootState, orgIds: readonly string[]) =>
      orgIds.length === 0 ? "" : JSON.stringify(orgIds),
  ],
  (types, key): Record<string, ScopeType[]> => {
    if (key === "") return EMPTY_SCOPE_TYPES_BY_ORG;
    const orgIds = JSON.parse(key) as string[];
    const result: Record<string, ScopeType[]> = {};
    for (const orgId of orgIds) {
      result[orgId] = types.filter((t) => t.organization_id === orgId);
    }
    return result;
  },
);

/** Memoized map: org id → scopes (for multi-org UIs). */
export const selectScopesByOrgIds = createSelector(
  [
    selectAllScopes,
    (_state: ScopeRootState, orgIds: readonly string[]) =>
      orgIds.length === 0 ? "" : JSON.stringify(orgIds),
  ],
  (scopes, key): Record<string, Scope[]> => {
    if (key === "") return EMPTY_SCOPES_BY_ORG;
    const orgIds = JSON.parse(key) as string[];
    const result: Record<string, Scope[]> = {};
    for (const orgId of orgIds) {
      result[orgId] = scopes.filter((s) => s.organization_id === orgId);
    }
    return result;
  },
);

export const selectProjectsByScopes = createSelector(
  [
    selectAllAssignments,
    (_state: ScopeRootState, scopeIds: string[]) => scopeIds,
    (_state: ScopeRootState, _scopeIds: string[], matchAll: boolean) =>
      matchAll,
  ],
  (assignments, scopeIds, matchAll): string[] => {
    const projectAssignments = assignments.filter(
      (a) => a.entity_type === "project",
    );

    const projectScopeMap = new Map<string, Set<string>>();
    projectAssignments.forEach((a) => {
      if (!projectScopeMap.has(a.entity_id)) {
        projectScopeMap.set(a.entity_id, new Set());
      }
      projectScopeMap.get(a.entity_id)!.add(a.scope_id);
    });

    const matchingProjectIds: string[] = [];
    projectScopeMap.forEach((scopeSet, projectId) => {
      const matches = matchAll
        ? scopeIds.every((id) => scopeSet.has(id))
        : scopeIds.some((id) => scopeSet.has(id));
      if (matches) matchingProjectIds.push(projectId);
    });

    return matchingProjectIds;
  },
);

/**
 * Generic: find entity ids of a given type whose scope assignments match the
 * given scope ids (intersection when matchAll=true, union when false).
 * Works for any entity type registered with the scope system ('task',
 * 'project', 'conversation', etc.).
 */
export const selectEntityIdsByScopes = createSelector(
  [
    selectAllAssignments,
    (_state: ScopeRootState, entityType: string) => entityType,
    (
      _state: ScopeRootState,
      _entityType: string,
      scopeIds: readonly string[],
    ) => scopeIds,
    (
      _state: ScopeRootState,
      _entityType: string,
      _scopeIds: readonly string[],
      matchAll: boolean,
    ) => matchAll,
  ],
  (assignments, entityType, scopeIds, matchAll): string[] =>
    computeMatchingEntityIdsFromAssignments(
      assignments,
      entityType,
      scopeIds,
      matchAll,
    ),
);
