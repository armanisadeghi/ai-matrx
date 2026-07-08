// features/scopes/redux/selectors/active-context.ts
//
// Selectors over the global appContextSlice that consumers should use
// instead of importing the slice directly. This keeps consumers in the
// features/scopes hook layer instead of binding them to the lib path.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";

const empty: never[] = [];
const emptyMap = {} as Record<string, string>;

const selectAppContextSlice = (state: RootState) => state.appContext;

export const selectActiveOrganizationId = createSelector(
  selectAppContextSlice,
  (s) => s.organization_id,
);

export const selectActiveOrganizationName = createSelector(
  selectAppContextSlice,
  (s) => s.organization_name,
);

export const selectActiveProjectId = createSelector(
  selectAppContextSlice,
  (s) => s.project_id,
);

export const selectActiveTaskId = createSelector(
  selectAppContextSlice,
  (s) => s.task_id,
);

export const selectActiveConversationId = createSelector(
  selectAppContextSlice,
  (s) => s.conversation_id,
);

/**
 * Map of currently-active scopes, keyed by scope id (multi-scope since
 * 2026-06-12 — any number of scopes per scope type). Legacy entries keyed by
 * scope_type_id may still appear; consumers should use the VALUES (scope ids),
 * never interpret the keys. Filters out null values from appContextSlice's
 * looser shape.
 */
export const selectActiveScopeSelections = createSelector(
  selectAppContextSlice,
  (s): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.scope_selections)) {
      if (v) out[k] = v;
    }
    return Object.keys(out).length === 0 ? emptyMap : out;
  },
);

export const selectActiveScopeIds = createSelector(
  selectActiveScopeSelections,
  (sel): string[] => Object.values(sel),
);

/** True when any working-context dimension is set in appContextSlice. */
export const selectHasActiveContext = createSelector(
  selectActiveOrganizationId,
  selectActiveProjectId,
  selectActiveTaskId,
  selectActiveScopeIds,
  (organizationId, projectId, taskId, scopeIds) =>
    !!organizationId ||
    !!projectId ||
    !!taskId ||
    scopeIds.length > 0,
);

/**
 * Active scope ids grouped by scope_type_id, resolved through the scope tree
 * (active context is MULTI-SCOPE — a type can have any number of active
 * scopes). Selections whose scope isn't in the loaded tree are omitted.
 */
const emptyIdsByType = {} as Record<string, string[]>;

export const selectActiveScopeIdsByType = createSelector(
  selectActiveScopeIds,
  (state: RootState) => state.scopesTree.organizations,
  (scopeIds, orgs): Record<string, string[]> => {
    if (scopeIds.length === 0) return emptyIdsByType;
    const wanted = new Set(scopeIds);
    const out: Record<string, string[]> = {};
    for (const orgId of Object.keys(orgs)) {
      for (const type of orgs[orgId].scope_types) {
        for (const scope of type.scopes) {
          if (!wanted.has(scope.id)) continue;
          (out[type.id] ??= []).push(scope.id);
        }
      }
    }
    return Object.keys(out).length === 0 ? emptyIdsByType : out;
  },
);

/**
 * Returns the FIRST active scope id of a given scope_type, or null. Active
 * context is multi-scope — use `selectActiveScopeIdsByType` when all active
 * scopes of the type matter; this is for "is any scope of this type active /
 * give me a representative one" cases (e.g. bound-variable write-back).
 */
export const makeSelectActiveScopeOfType = () =>
  createSelector(
    selectActiveScopeIdsByType,
    (_: RootState, scopeTypeId: string | null | undefined) => scopeTypeId,
    (byType, scopeTypeId): string | null =>
      (scopeTypeId && byType[scopeTypeId]?.[0]) || null,
  );

/**
 * Returns a stable, ergonomic bundle of the full active context. Use sparingly —
 * subscribes to every field of appContextSlice.
 */
export const selectActiveContextBundle = createSelector(
  selectActiveOrganizationId,
  selectActiveProjectId,
  selectActiveTaskId,
  selectActiveConversationId,
  selectActiveScopeSelections,
  (organizationId, projectId, taskId, conversationId, scopeSelections) => ({
    organizationId,
    projectId,
    taskId,
    conversationId,
    scopeSelections,
    scopeIds: Object.values(scopeSelections),
  }),
);
