// features/scopes/redux/thunks/scopeTreeMutations.ts
//
// Scope-type and scope writes: each goes through `scopeDoors()` (`@ai-matrx/records/scopes`) and, on
// success, patches the holder's tree in place with the store's answer. Refusals come back as the
// store's `RecordsResult` (render `error.message`).

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RecordsResult } from "@ai-matrx/records";
import type { Scope, ScopeSpec, ScopeType, ScopeTypeSpec, ScopeTypeWithScopes } from "@ai-matrx/records/scopes";
import { scopeDoors } from "@/features/scopes/service/scopeDoors";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

function existingScopesForType(state: RootState, organizationId: string, scopeTypeId: string): Scope[] {
  const org = state.scopesTree.organizations[organizationId];
  return org?.scope_types.find((t) => t.id === scopeTypeId)?.scopes ?? [];
}

export function createScopeType(
  params: { organization_id: string } & ScopeTypeSpec,
): AppThunk<Promise<RecordsResult<ScopeType>>> {
  return async (dispatch) => {
    const { organization_id, ...spec } = params;
    const res = await scopeDoors().createType(organization_id, spec);
    if (res.ok) dispatch(scopesActions.scopeTypeUpserted({ ...res.data, scopes: [] }));
    return res;
  };
}

export function updateScopeType(
  params: { type_id: string } & ScopeTypeSpec,
): AppThunk<Promise<RecordsResult<ScopeType>>> {
  return async (dispatch, getState) => {
    const { type_id, ...spec } = params;
    const res = await scopeDoors().updateType(type_id, spec);
    if (res.ok) {
      const node: ScopeTypeWithScopes = {
        ...res.data,
        scopes: existingScopesForType(getState(), res.data.organization_id, res.data.id),
      };
      dispatch(scopesActions.scopeTypeUpserted(node));
    }
    return res;
  };
}

function orgIdForScopeType(state: RootState, typeId: string): string | null {
  for (const orgId of state.scopesTree.organizationIds) {
    if (state.scopesTree.organizations[orgId]?.scope_types.some((t) => t.id === typeId)) return orgId;
  }
  return null;
}

function homeForScope(state: RootState, scopeId: string): { organizationId: string; scopeTypeId: string } | null {
  for (const orgId of state.scopesTree.organizationIds) {
    for (const t of state.scopesTree.organizations[orgId]?.scope_types ?? []) {
      if (t.scopes.some((s) => s.id === scopeId)) return { organizationId: orgId, scopeTypeId: t.id };
    }
  }
  return null;
}

/** Archive a scope type (restorable from the archived panel). */
export function deleteScopeType(params: {
  type_id: string;
  organization_id?: string;
}): AppThunk<Promise<RecordsResult<{ id: string }>>> {
  return async (dispatch, getState) => {
    const organizationId = params.organization_id ?? orgIdForScopeType(getState(), params.type_id);
    const res = await scopeDoors().archiveType(params.type_id);
    if (res.ok && organizationId) {
      dispatch(scopesActions.scopeTypeRemoved({ organizationId, scopeTypeId: params.type_id }));
    }
    return res;
  };
}

export function restoreScopeType(typeId: string): AppThunk<Promise<RecordsResult<{ id: string }>>> {
  return async () => scopeDoors().restoreType(typeId);
}

export function createScope(
  params: { organization_id: string; scope_type_id: string } & ScopeSpec,
): AppThunk<Promise<RecordsResult<Scope>>> {
  return async (dispatch) => {
    const { organization_id, scope_type_id, ...spec } = params;
    const res = await scopeDoors().createScope(organization_id, scope_type_id, spec);
    if (res.ok) dispatch(scopesActions.scopeUpserted(res.data));
    return res;
  };
}

export function updateScope(params: { scope_id: string } & ScopeSpec): AppThunk<Promise<RecordsResult<Scope>>> {
  return async (dispatch) => {
    const { scope_id, ...spec } = params;
    const res = await scopeDoors().updateScope(scope_id, spec);
    if (res.ok) dispatch(scopesActions.scopeUpserted(res.data));
    return res;
  };
}

/** Archive a scope (restorable). */
export function deleteScope(params: {
  scope_id: string;
  organization_id?: string;
  scope_type_id?: string;
}): AppThunk<Promise<RecordsResult<{ id: string }>>> {
  return async (dispatch, getState) => {
    const home =
      params.organization_id && params.scope_type_id
        ? { organizationId: params.organization_id, scopeTypeId: params.scope_type_id }
        : homeForScope(getState(), params.scope_id);
    const res = await scopeDoors().archiveScope(params.scope_id);
    if (res.ok && home) {
      dispatch(
        scopesActions.scopeRemoved({
          organizationId: home.organizationId,
          scopeTypeId: home.scopeTypeId,
          scopeId: params.scope_id,
        }),
      );
    }
    return res;
  };
}

export function restoreScope(scopeId: string): AppThunk<Promise<RecordsResult<{ id: string }>>> {
  return async () => scopeDoors().restoreScope(scopeId);
}
