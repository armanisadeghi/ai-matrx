// features/scopes/redux/thunks/ensureContextValues.ts
//
// Per-scope context-item values fetch. Lazy: only when a consumer asks
// (values editor opens, agent invocation needs them, etc.). No-refetch
// unless `refresh: true`.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { ContextValue } from "@ai-matrx/records/scopes";
import { readScopeFileText, scopeDoors } from "@/features/scopes/service/scopeDoors";
import { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

// No host in-flight map: a second ask while a read is out asks the same door with the same
// arguments, and the records client sends that read once (its own in-flight dedupe).

export function ensureContextValues(
  scopeId: string,
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const entry = getState().contextValues.byScope[scopeId];
    if (!opts.refresh && entry?.status === "ready") return;
    dispatch(contextValuesActions.valuesFetchPending({ scopeId }));
    const res = await scopeDoors().values([scopeId], { readFileText: readScopeFileText });
    if (!res.ok) {
      dispatch(contextValuesActions.valuesFetchRejected({ scopeId, error: res.error.message }));
      return;
    }
    dispatch(contextValuesActions.valuesFetchFulfilled({ scopeId, values: res.data }));
  };
}

/**
 * THE VALUES OF MANY SCOPES IN ONE READ (lane STORE-READ-PERF-5). A screen that shows several
 * scopes at once — a scope type's page, a type's preview card — asks this once for all of them
 * instead of `ensureContextValues` once per scope. One `scopeDoors().values` read answers every
 * scope not already read (the store door takes 200 a call, so up to 200 scopes are ONE request),
 * and each scope's entry is filled exactly as its own read would have filled it — a scope with no
 * values is ready with none.
 */
export function ensureContextValuesForScopes(
  scopeIds: readonly string[],
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const byScope = getState().contextValues.byScope;
    const wanted = [...new Set(scopeIds.filter(Boolean))].filter(
      (id) => opts.refresh || byScope[id]?.status !== "ready",
    );
    if (wanted.length === 0) return;
    for (const scopeId of wanted) dispatch(contextValuesActions.valuesFetchPending({ scopeId }));
    const res = await scopeDoors().values(wanted, { readFileText: readScopeFileText });
    if (!res.ok) {
      for (const scopeId of wanted) {
        dispatch(contextValuesActions.valuesFetchRejected({ scopeId, error: res.error.message }));
      }
      return;
    }
    const grouped = new Map<string, ContextValue[]>(wanted.map((id) => [id, []]));
    for (const value of res.data) grouped.get(value.scope_id)?.push(value);
    for (const [scopeId, values] of grouped) {
      dispatch(contextValuesActions.valuesFetchFulfilled({ scopeId, values }));
    }
  };
}
