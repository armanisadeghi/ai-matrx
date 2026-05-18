// features/scopes/redux/thunks/ensureContextValues.ts
//
// Per-scope context-item values fetch. Lazy: only when a consumer asks
// (values editor opens, agent invocation needs them, etc.). No-refetch
// unless `refresh: true`.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

const inFlight = new Map<string, Promise<void>>();

export function ensureContextValues(
  scopeId: string,
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const entry = getState().contextValues.byScope[scopeId];

    if (!refresh) {
      if (entry?.status === "ready") return;
      if (entry?.status === "loading") {
        const p = inFlight.get(scopeId);
        if (p) return p;
      }
    }

    dispatch(contextValuesActions.valuesFetchPending({ scopeId }));

    const promise = (async () => {
      try {
        const res = await scopesService.listContextValues(scopeId);
        if (isScopesRpcErr(res)) {
          dispatch(
            contextValuesActions.valuesFetchRejected({
              scopeId,
              error: res.error.message,
            }),
          );
        } else {
          dispatch(
            contextValuesActions.valuesFetchFulfilled({
              scopeId,
              values: res.data.values,
            }),
          );
        }
      } finally {
        inFlight.delete(scopeId);
      }
    })();

    inFlight.set(scopeId, promise);
    return promise;
  };
}
