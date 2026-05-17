// features/scopes/redux/thunks/ensureTemplates.ts
//
// Read-only catalog fetch. Long TTL. Fires once per session when the
// templates gallery first opens. No automatic refresh.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { templatesActions } from "@/features/scopes/redux/templatesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

let inFlight: Promise<void> | null = null;

export function ensureTemplates(
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const state = getState().scopeTemplates;

    if (!refresh && state.status === "ready") return;
    if (state.status === "loading" && inFlight) return inFlight;

    dispatch(templatesActions.templatesFetchPending());

    const promise = (async () => {
      try {
        const res = await scopesService.listTemplates();
        if (isScopesRpcErr(res)) {
          dispatch(templatesActions.templatesFetchRejected(res.error.message));
        } else {
          dispatch(
            templatesActions.templatesFetchFulfilled(res.data.templates),
          );
        }
      } finally {
        inFlight = null;
      }
    })();

    inFlight = promise;
    return promise;
  };
}
