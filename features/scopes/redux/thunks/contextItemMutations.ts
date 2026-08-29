// features/scopes/redux/thunks/contextItemMutations.ts
//
// Definition WRITES for context items (the catalog columns of a scope type)
// through the sanctioned SECURITY DEFINER RPC family: `create_context_item`,
// `update_context_item`, `delete_context_item` (org resolved from the row's
// scope type and org-admin checked inside each function). On success the
// authoritative row is folded into `scopesSlice.contextItemsByTypeId` via the
// contextItem patch reducers — no refetch.
//
// Never throws — returns the service's ScopesRpcResult envelope; callers
// branch with `isScopesRpcErr` (matching setContextValue.ts).

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  ContextItemRow,
  CreateContextItemParams,
  ScopesRpcResult,
  UpdateContextItemParams,
} from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export function createContextItem(
  params: CreateContextItemParams,
): AppThunk<Promise<ScopesRpcResult<ContextItemRow>>> {
  return async (dispatch) => {
    const res = await scopesService.createContextItem(params);
    if (!isScopesRpcErr(res)) {
      dispatch(scopesActions.contextItemUpserted(res.data));
    }
    return res;
  };
}

export function updateContextItem(
  params: UpdateContextItemParams,
): AppThunk<Promise<ScopesRpcResult<ContextItemRow>>> {
  return async (dispatch) => {
    const res = await scopesService.updateContextItem(params);
    if (!isScopesRpcErr(res)) {
      dispatch(scopesActions.contextItemUpserted(res.data));
    }
    return res;
  };
}

export function deleteContextItem(params: {
  item_id: string;
  scope_type_id: string;
}): AppThunk<Promise<ScopesRpcResult<{ id: string }>>> {
  return async (dispatch) => {
    const res = await scopesService.deleteContextItem(params.item_id);
    if (!isScopesRpcErr(res)) {
      dispatch(
        scopesActions.contextItemRemoved({
          scopeTypeId: params.scope_type_id,
          itemId: params.item_id,
        }),
      );
    }
    return res;
  };
}
