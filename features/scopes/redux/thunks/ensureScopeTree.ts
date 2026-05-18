// features/scopes/redux/thunks/ensureScopeTree.ts
//
// The boot fetch. Single source of truth for "do we have the scope tree?"
//
// No-refetch policy: this thunk is the ONLY allowed entry point for the
// tree boot fetch. It checks state before firing:
//   - `treeStatus: 'ready'` and `refresh: false` → return cached
//   - `treeStatus: 'loading'` → return the in-flight promise (dedup)
//   - otherwise → fire a new fetch
//
// Refresh is an explicit user action (a "Refresh" button click). Route
// changes, app focus, render cycles, and component mounts do not trigger
// refetches. Period.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

let inFlight: Promise<void> | null = null;

export function ensureScopeTree(
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const state = getState().scopesTree;

    if (!refresh && state.treeStatus === "ready") return;
    if (state.treeStatus === "loading" && inFlight) return inFlight;

    dispatch(scopesActions.treeFetchPending());

    const promise = (async () => {
      try {
        const res = await scopesService.getScopeTree();
        if (isScopesRpcErr(res)) {
          dispatch(scopesActions.treeFetchRejected(res.error.message));
        } else {
          dispatch(scopesActions.treeFetchFulfilled(res.data));
        }
      } finally {
        inFlight = null;
      }
    })();

    inFlight = promise;
    return promise;
  };
}
