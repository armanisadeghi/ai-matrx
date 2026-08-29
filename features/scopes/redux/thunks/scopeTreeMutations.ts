// features/scopes/redux/thunks/scopeTreeMutations.ts
//
// Structural WRITES for the canonical scope tree — scope types and scopes —
// through the ONE sanctioned mutation path: `scopesService` → the
// SECURITY DEFINER RPC family (`create_scope_type`, `update_scope_type`,
// `delete_scope_type`, `create_scope`, `update_scope`, `delete_scope`;
// C17 HYBRID ruling, 2026-08-29). On success the authoritative row is folded
// straight into `scopesSlice` via the per-row patch reducers — no refetch,
// no reliance on the legacy-action mirror block.
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

export function deleteScopeType(params: {
  type_id: string;
  organization_id: string;
}): AppThunk<Promise<ScopesRpcResult<{ id: string }>>> {
  return async (dispatch) => {
    const res = await scopesService.deleteScopeType(params.type_id);
    if (!isScopesRpcErr(res)) {
      dispatch(
        scopesActions.scopeTypeRemoved({
          organizationId: params.organization_id,
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

export function deleteScope(params: {
  scope_id: string;
  organization_id: string;
  scope_type_id: string;
}): AppThunk<Promise<ScopesRpcResult<{ id: string }>>> {
  return async (dispatch) => {
    const res = await scopesService.deleteScope(params.scope_id);
    if (!isScopesRpcErr(res)) {
      dispatch(
        scopesActions.scopeRemoved({
          organizationId: params.organization_id,
          scopeTypeId: params.scope_type_id,
          scopeId: params.scope_id,
        }),
      );
    }
    return res;
  };
}
