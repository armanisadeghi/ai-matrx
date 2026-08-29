// features/scopes/redux/thunks/setContextValue.ts
//
// Value WRITE for one scope cell, through the ONE sanctioned mutation path:
// `scopesService.setContextValue` → the `set_context_value` SECURITY DEFINER
// RPC. On success the written cell is folded back into the contextValues
// sidecar (`valueUpserted`) so every reader reflects it without a refetch.
//
// Never throws — returns the service's ScopesRpcResult envelope; callers
// branch with `isScopesRpcErr` and surface errors through their own
// toast/error path.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  ContextItemValue,
  ScopesRpcResult,
  SetContextValuePayload,
  SetContextValueResult,
} from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export function setContextValue(
  payload: SetContextValuePayload,
): AppThunk<Promise<ScopesRpcResult<SetContextValueResult>>> {
  return async (dispatch) => {
    const res = await scopesService.setContextValue(payload);
    if (!isScopesRpcErr(res)) {
      // Echo the persisted write into the sidecar. The RPC result carries the
      // authoritative id/version/value_text/source_type; the remaining cell
      // fields come from what we just sent (a new version REPLACES the cell,
      // so unsent value columns are null on the new current row).
      const value: ContextItemValue = {
        id: res.data.id,
        context_item_id: res.data.context_item_id,
        version: res.data.version,
        is_current: true,
        value_text: res.data.value_text,
        value_number: payload.value_number ?? null,
        value_boolean: payload.value_boolean ?? null,
        value_date: payload.value_date ?? null,
        value_json: payload.value_json ?? null,
        value_document_url: payload.value_document_url ?? null,
        value_document_size_bytes: null,
        value_reference_id: payload.value_reference_id ?? null,
        value_reference_type: null,
        source_type: res.data.source_type,
        authored_by: null,
        created_at: new Date().toISOString(),
      };
      dispatch(
        contextValuesActions.valueUpserted({
          scopeId: res.data.scope_id,
          value,
        }),
      );
    }
    return res;
  };
}
