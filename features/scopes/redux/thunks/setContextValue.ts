// features/scopes/redux/thunks/setContextValue.ts
//
// THE value write: a `ContextValueWrite` through `scopeDoors().writeValue`. A cell that was read only
// in part (a long text kept as a file) is never saved back over the whole (`incompleteSaveRefusal`).
// On success the holder's cell takes the written value and the store's version.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RecordsResult } from "@ai-matrx/records";
import {
  incompleteSaveRefusal,
  type ContextValue,
  type ContextValueWrite,
  type ContextValueWritten,
} from "@ai-matrx/records/scopes";
import { scopeDoors } from "@/features/scopes/service/scopeDoors";
import { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export function setContextValue(write: ContextValueWrite): AppThunk<Promise<RecordsResult<ContextValueWritten>>> {
  return async (dispatch, getState) => {
    const current = getState()?.contextValues?.byScope?.[write.scope_id]?.values?.[write.field_id];
    const refusal = incompleteSaveRefusal(current, write.value);
    if (refusal) return { ok: false, error: { code: "invalid_argument", message: refusal } };
    const res = await scopeDoors().writeValue(write);
    if (res.ok) {
      const value: ContextValue = {
        scope_id: write.scope_id,
        field_id: write.field_id,
        key: current?.key ?? "",
        kind: write.kind,
        value: write.references ? write.references.map((r) => r.id) : (write.value ?? null),
        references: write.references ?? [],
        version: res.data.version,
        set_at: new Date().toISOString(),
        source_type: res.data.source_type,
        authored_by: null,
        whole_value: null,
        incomplete: null,
      };
      dispatch(contextValuesActions.valueUpserted({ scopeId: write.scope_id, value }));
    }
    return res;
  };
}
