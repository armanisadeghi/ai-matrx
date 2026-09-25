// features/scopes/redux/thunks/scopeTreeMutations.ts
//
// Structural WRITES for the canonical scope tree — scope types and scopes —
// through the ONE sanctioned mutation path: `scopesService` → the
// SECURITY DEFINER RPC family (`create_scope_type`, `update_scope_type`,
// `delete_scope_type`, `create_scope`, `update_scope`, `delete_scope`;
// C17 HYBRID ruling, 2026-08-29). On success the authoritative row is folded
// straight into `scopesSlice` via the per-row patch reducers — no refetch.
// These are THE write doors for scope types and scopes (the agent-context
// scopeTypes/scopes slices and their thunks were deleted 2026-09-25, lane
// SCOPE-ADMIN-CANONICAL).
//
// Never throws — every thunk returns the service's ScopesRpcResult envelope;
// callers branch with `isScopesRpcErr` and surface errors through their own
// toast/error path (matching setContextValue.ts).

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  CreateScopeParams,
  CreateScopeTypeParams,
  ScopeNode,
  ScopeTypeNode,
  ScopesRpcResult,
  UpdateScopeParams,
  UpdateScopeTypeParams,
} from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

/** The nested scopes the tree already holds for a type (the RPC row has none). */
function existingScopesForType(
  state: RootState,
  organizationId: string,
  scopeTypeId: string,
): ScopeNode[] {
  const org = state.scopesTree.organizations[organizationId];
  const type = org?.scope_types.find((t) => t.id === scopeTypeId);
  return type?.scopes ?? [];
}

export function createScopeType(
  params: CreateScopeTypeParams,
): AppThunk<Promise<ScopesRpcResult<ScopeTypeNode>>> {
  return async (dispatch) => {
    const res = await scopesService.createScopeType(params);
    if (!isScopesRpcErr(res)) {
      dispatch(scopesActions.scopeTypeUpserted(res.data));
    }
    return res;
  };
}

export function updateScopeType(
  params: UpdateScopeTypeParams,
): AppThunk<Promise<ScopesRpcResult<ScopeTypeNode>>> {
  return async (dispatch, getState) => {
    const res = await scopesService.updateScopeType(params);
    if (!isScopesRpcErr(res)) {
      // The RPC returns the bare row; re-attach the scopes this tree already
      // holds so the upsert can't wipe the type's children.
      const node: ScopeTypeNode = {
        ...res.data,
        scopes: existingScopesForType(
          getState(),
          res.data.organization_id,
          res.data.id,
        ),
      };
      dispatch(scopesActions.scopeTypeUpserted(node));
    }
    return res;
  };
}

/** The organization a scope type lives in, read from the tree. */
function orgIdForScopeType(state: RootState, typeId: string): string | null {
  for (const orgId of state.scopesTree.organizationIds) {
    const org = state.scopesTree.organizations[orgId];
    if (org?.scope_types.some((t) => t.id === typeId)) return orgId;
  }
  return null;
}

/** Where a scope lives (organization + scope type), read from the tree. */
function homeForScope(
  state: RootState,
  scopeId: string,
): { organizationId: string; scopeTypeId: string } | null {
  for (const orgId of state.scopesTree.organizationIds) {
    const org = state.scopesTree.organizations[orgId];
    for (const t of org?.scope_types ?? []) {
      if (t.scopes.some((s) => s.id === scopeId)) {
        return { organizationId: orgId, scopeTypeId: t.id };
      }
    }
  }
  return null;
}

/**
 * Archive a scope type (`delete_scope_type` is a soft archive). The tree drops
 * it in place; `organization_id` is read from the tree when not given.
 */
export function deleteScopeType(params: {
  type_id: string;
  organization_id?: string;
}): AppThunk<Promise<ScopesRpcResult<{ id: string }>>> {
  return async (dispatch, getState) => {
    const organizationId =
      params.organization_id ?? orgIdForScopeType(getState(), params.type_id);
    const res = await scopesService.deleteScopeType(params.type_id);
    if (!isScopesRpcErr(res) && organizationId) {
      dispatch(
        scopesActions.scopeTypeRemoved({
          organizationId,
          scopeTypeId: params.type_id,
        }),
      );
    }
    return res;
  };
}

export function createScope(
  params: CreateScopeParams,
): AppThunk<Promise<ScopesRpcResult<ScopeNode>>> {
  return async (dispatch) => {
    const res = await scopesService.createScope(params);
    if (!isScopesRpcErr(res)) {
      dispatch(scopesActions.scopeUpserted(res.data));
    }
    return res;
  };
}

export function updateScope(
  params: UpdateScopeParams,
): AppThunk<Promise<ScopesRpcResult<ScopeNode>>> {
  return async (dispatch) => {
    const res = await scopesService.updateScope(params);
    if (!isScopesRpcErr(res)) {
      dispatch(scopesActions.scopeUpserted(res.data));
    }
    return res;
  };
}

/**
 * Archive a scope (`delete_scope` is a soft archive). The tree drops it in
 * place; its organization and type are read from the tree when not given.
 */
export function deleteScope(params: {
  scope_id: string;
  organization_id?: string;
  scope_type_id?: string;
}): AppThunk<Promise<ScopesRpcResult<{ id: string }>>> {
  return async (dispatch, getState) => {
    const home =
      params.organization_id && params.scope_type_id
        ? {
            organizationId: params.organization_id,
            scopeTypeId: params.scope_type_id,
          }
        : homeForScope(getState(), params.scope_id);
    const res = await scopesService.deleteScope(params.scope_id);
    if (!isScopesRpcErr(res) && home) {
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
