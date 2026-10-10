// features/scopes/redux/thunks/ensureScopeTypeItems.ts
//
// A scope type's context fields into the holder's catalog, through `scopeDoors().fields`. The
// System Context items ride the same catalog under `SYSTEM_ITEMS_KEY` (read through
// `scopeDoors().systemItems`, which answers them as fields of that pseudo-type, with their
// `item_class` — decoded by the package; stored as answered).

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RecordsResult } from "@ai-matrx/records";
import type { ContextField } from "@ai-matrx/records/scopes";
import { scopeDoors } from "@/features/scopes/service/scopeDoors";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { SYSTEM_ITEMS_KEY } from "@/features/scopes/constants/contextItems";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

/**
 * Fill the catalog for one type unless it is already ready. No host in-flight map: two screens asking
 * at once ask the same door with the same arguments, and the records client sends that read once
 * (its own in-flight dedupe). The door answers each type's fields in their order (`sort`, then label),
 * so the holder stores them as answered.
 */
export function ensureScopeTypeItems(scopeTypeId: string, opts: { refresh?: boolean } = {}): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const entry = getState().scopesTree.contextItemsByTypeId[scopeTypeId];
    if (!opts.refresh && entry?.status === "ready") return;
    dispatch(scopesActions.contextItemsFetchPending({ scopeTypeId }));
    const res: RecordsResult<ContextField[]> =
      scopeTypeId === SYSTEM_ITEMS_KEY ? await scopeDoors().systemItems() : await scopeDoors().fields([scopeTypeId]);
    if (!res.ok) {
      dispatch(scopesActions.contextItemsFetchRejected({ scopeTypeId, error: res.error.message }));
      return;
    }
    dispatch(scopesActions.contextItemsFetchFulfilled({ scopeTypeId, items: res.data }));
  };
}
