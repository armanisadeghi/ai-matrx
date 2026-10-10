// features/scopes/redux/selectors/resolved-context.ts
//
// The resolved context of the active selection (+ an entity's own scope tags), as a thin selector
// over `resolveScopeContext` from `@ai-matrx/records/scopes` (the rule lives there, with its tests):
// closer sources win each field, local before global; a same-type global/local mismatch is named,
// never blocking. Values must already be read (`ensureContextValues`); this never fetches.

import { createSelector } from "@reduxjs/toolkit";
import {
  resolveScopeContext,
  type ContextField,
  type ContextValue,
  type ResolvedScopeContext,
  type Scope,
} from "@ai-matrx/records/scopes";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  selectActiveOrganizationId,
  selectActiveProjectId,
  selectActiveScopeSelections,
  selectActiveTaskId,
} from "./active-context";

export interface ResolvedContext extends ResolvedScopeContext {
  organizationId: string | null;
  userId: string;
}

interface ResolveArgs {
  /** Scope ids the entity is tagged with locally. Empty = pure global. */
  localScopeIds?: string[];
  localProjectId?: string | null;
  localTaskId?: string | null;
  userId: string;
}

export const emptyContext: ResolvedContext = {
  values: {},
  sourcePerKey: {},
  contradictions: [],
  activeScopes: [],
  organizationId: null,
  userId: "",
};

const selectScopeIndex = createSelector(
  (state: RootState) => state.scopesTree.organizations,
  (orgs): Map<string, Scope> => {
    const map = new Map<string, Scope>();
    for (const org of Object.values(orgs)) {
      for (const type of org.scope_types) for (const scope of type.scopes) map.set(scope.id, scope);
    }
    return map;
  },
);

const selectFieldIndex = createSelector(
  (state: RootState) => state.scopesTree.contextItemsByTypeId,
  (catalogs): Map<string, ContextField> => {
    const map = new Map<string, ContextField>();
    for (const entry of Object.values(catalogs)) for (const f of entry.items) map.set(f.id, f);
    return map;
  },
);

const selectReadyValues = createSelector(
  (state: RootState) => state.contextValues.byScope,
  (byScope): Record<string, Record<string, ContextValue>> => {
    const out: Record<string, Record<string, ContextValue>> = {};
    for (const [scopeId, entry] of Object.entries(byScope)) if (entry.status === "ready") out[scopeId] = entry.values;
    return out;
  },
);

/** Produce a ResolvedContext for the active selection plus an entity's local tags. */
export function makeSelectResolvedContext() {
  return createSelector(
    selectScopeIndex,
    selectFieldIndex,
    selectActiveOrganizationId,
    selectActiveScopeSelections,
    selectActiveProjectId,
    selectActiveTaskId,
    selectReadyValues,
    (_: RootState, args: ResolveArgs) => args,
    (scopeIndex, fieldIndex, activeOrgId, selections, projectId, taskId, valuesByScope, args): ResolvedContext => ({
      ...resolveScopeContext({
        scopeById: (id) => scopeIndex.get(id),
        fieldById: (id) => fieldIndex.get(id),
        local: { taskId: args.localTaskId, projectId: args.localProjectId, scopeIds: args.localScopeIds ?? [] },
        global: {
          taskId,
          projectId,
          scopeIds: Object.values(selections).filter((id): id is string => !!id),
        },
        valuesByScope,
      }),
      organizationId: activeOrgId,
      userId: args.userId,
    }),
  );
}
