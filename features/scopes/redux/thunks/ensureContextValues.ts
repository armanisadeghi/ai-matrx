// features/scopes/redux/thunks/ensureContextValues.ts
//
// Per-scope context-item values fetch. Lazy: only when a consumer asks
// (values editor opens, agent invocation needs them, etc.). No-refetch
// unless `refresh: true`.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";
import { isScopesRpcErr, type ContextItemValue } from "@/features/scopes/types";
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
        if (inFlight.get(scopeId) === promise) inFlight.delete(scopeId);
      }
    })();

    inFlight.set(scopeId, promise);
    return promise;
  };
}

/**
 * THE VALUES OF MANY SCOPES IN ONE READ (lane STORE-READ-PERF-5). A screen that shows several
 * scopes at once — a scope type's page, a type's preview card — asks this once for all of them
 * instead of `ensureContextValues` once per scope: on the store path that was one
 * `custom.context_values` call per scope (~57 on a type page, each paying the door's fixed cost,
 * 500/503s under load). One `scopesService.listContextValuesForScopes` read answers every scope
 * not already loaded or loading (the store door takes 200 a call, so up to 200 scopes are ONE
 * request), and each scope's entry is filled exactly as its own read would have filled it — a scope
 * with no values is ready with none. While the read is in flight, `ensureContextValues(scopeId)`
 * for any of these scopes waits for it instead of asking again.
 */
export function ensureContextValuesForScopes(
  scopeIds: readonly string[],
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const byScope = getState().contextValues.byScope;
    const wanted = [...new Set(scopeIds.filter(Boolean))].filter((id) => {
      if (refresh) return true;
      const status = byScope[id]?.status;
      return status !== "ready" && !(status === "loading" && inFlight.has(id));
    });
    if (wanted.length === 0) {
      await Promise.all(scopeIds.map((id) => inFlight.get(id)).filter(Boolean));
      return;
    }

    for (const scopeId of wanted) {
      dispatch(contextValuesActions.valuesFetchPending({ scopeId }));
    }

    const promise = (async () => {
      try {
        const res = await scopesService.listContextValuesForScopes(wanted);
        if (isScopesRpcErr(res)) {
          for (const scopeId of wanted) {
            dispatch(contextValuesActions.valuesFetchRejected({ scopeId, error: res.error.message }));
          }
          return;
        }
        const grouped = new Map<string, ContextItemValue[]>(wanted.map((id) => [id, []]));
        for (const { scope_id, ...value } of res.data.values) {
          grouped.get(scope_id)?.push(value as ContextItemValue);
        }
        for (const [scopeId, values] of grouped) {
          dispatch(contextValuesActions.valuesFetchFulfilled({ scopeId, values }));
        }
      } finally {
        for (const scopeId of wanted) {
          if (inFlight.get(scopeId) === promise) inFlight.delete(scopeId);
        }
      }
    })();

    for (const scopeId of wanted) inFlight.set(scopeId, promise);
    return promise;
  };
}
