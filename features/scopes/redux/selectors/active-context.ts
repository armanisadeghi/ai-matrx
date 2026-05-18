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
 * Map of scope_type_id → scope_id for currently-active scopes.
 * Filters out null values from appContextSlice's looser shape.
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

/**
 * Returns the active scope id for a given scope_type, or null.
 */
export const makeSelectActiveScopeOfType = () =>
  createSelector(
    selectActiveScopeSelections,
    (_: RootState, scopeTypeId: string | null | undefined) => scopeTypeId,
    (sel, scopeTypeId): string | null =>
      (scopeTypeId && sel[scopeTypeId]) || null,
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
