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

/** Status bookkeeping only: one read per type while it is loading. */
const inFlight = new Map<string, Promise<void>>();

export function ensureScopeTypeItems(scopeTypeId: string, opts: { refresh?: boolean } = {}): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const entry = getState().scopesTree.contextItemsByTypeId[scopeTypeId];
    if (!opts.refresh) {
      if (entry?.status === "ready") return;
      const p = entry?.status === "loading" ? inFlight.get(scopeTypeId) : undefined;
      if (p) return p;
    }
    dispatch(scopesActions.contextItemsFetchPending({ scopeTypeId }));
    const promise = (async () => {
      try {
        const res: RecordsResult<ContextField[]> =
          scopeTypeId === SYSTEM_ITEMS_KEY ? await scopeDoors().systemItems() : await scopeDoors().fields([scopeTypeId]);
        if (!res.ok) {
          dispatch(scopesActions.contextItemsFetchRejected({ scopeTypeId, error: res.error.message }));
          return;
        }
        const items = [...res.data].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
        dispatch(scopesActions.contextItemsFetchFulfilled({ scopeTypeId, items }));
      } finally {
        inFlight.delete(scopeTypeId);
      }
    })();
    inFlight.set(scopeTypeId, promise);
    return promise;
  };
}
