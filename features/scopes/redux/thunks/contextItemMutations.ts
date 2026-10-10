// features/scopes/redux/thunks/contextItemMutations.ts
//
// Context-field writes (a field is a column of the scope type's Table) through `scopeDoors()`; on
// success the holder's catalog for that type takes the store's answer.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RecordsResult } from "@ai-matrx/records";
import type { ContextField, ContextFieldSpec } from "@ai-matrx/records/scopes";
import { scopeDoors } from "@/features/scopes/service/scopeDoors";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export function createContextItem(
  params: { scope_type_id: string } & ContextFieldSpec,
): AppThunk<Promise<RecordsResult<ContextField>>> {
  return async (dispatch) => {
    const { scope_type_id, ...spec } = params;
    const res = await scopeDoors().createField(scope_type_id, spec);
    if (res.ok) dispatch(scopesActions.contextItemUpserted(res.data));
    return res;
  };
}

export function updateContextItem(
  params: { item_id: string; scope_type_id: string } & ContextFieldSpec,
): AppThunk<Promise<RecordsResult<ContextField>>> {
  return async (dispatch) => {
    const { item_id, scope_type_id, ...spec } = params;
    const res = await scopeDoors().updateField(item_id, scope_type_id, spec);
    if (res.ok) dispatch(scopesActions.contextItemUpserted(res.data));
    return res;
  };
}

/** Archive a context field (restorable). */
export function deleteContextItem(params: {
  item_id: string;
  scope_type_id: string;
}): AppThunk<Promise<RecordsResult<{ id: string }>>> {
  return async (dispatch) => {
    const res = await scopeDoors().archiveField(params.item_id);
    if (res.ok) {
      dispatch(scopesActions.contextItemRemoved({ scopeTypeId: params.scope_type_id, itemId: params.item_id }));
    }
    return res;
  };
}

export function restoreContextItem(itemId: string): AppThunk<Promise<RecordsResult<{ id: string }>>> {
  return async () => scopeDoors().restoreField(itemId);
}
