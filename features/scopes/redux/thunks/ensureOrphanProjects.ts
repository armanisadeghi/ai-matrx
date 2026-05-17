// features/scopes/redux/thunks/ensureOrphanProjects.ts
//
// Per-org orphan projects fetch — only fires when the user clicks "Load others"
// or equivalent. Empty ≠ unfetched: state must distinguish them so the UI
// can render "Load others" vs "No others" correctly.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

const inFlight = new Map<string, Promise<void>>();

export function ensureOrphanProjects(
  organizationId: string,
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const entry = getState().scopesTree.orphanProjectsByOrg[organizationId];

    if (!refresh) {
      if (entry?.status === "ready" || entry?.status === "empty") return;
      if (entry?.status === "loading") {
        const p = inFlight.get(organizationId);
        if (p) return p;
      }
    }

    dispatch(scopesActions.orphanProjectsFetchPending({ organizationId }));

    const promise = (async () => {
      try {
        const res = await scopesService.listOrphanProjects(organizationId);
        if (isScopesRpcErr(res)) {
          dispatch(
            scopesActions.orphanProjectsFetchRejected({
              organizationId,
              error: res.error.message,
            }),
          );
        } else {
          dispatch(
            scopesActions.orphanProjectsFetchFulfilled({
              organizationId,
              projects: res.data.projects,
            }),
          );
        }
      } finally {
        inFlight.delete(organizationId);
      }
    })();

    inFlight.set(organizationId, promise);
    return promise;
  };
}
