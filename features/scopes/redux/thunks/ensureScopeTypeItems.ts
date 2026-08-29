// features/scopes/redux/thunks/ensureScopeTypeItems.ts
//
// Per-scope-type context-item CATALOG fetch (the item definitions, not
// per-scope values — those are `ensureContextValues`). Lazy: only when a
// consumer asks (the quick-assign target picker, etc.). No-refetch unless
// `refresh: true`. Stored sorted by sort_order then display_name, matching
// how item catalogs render everywhere.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

const inFlight = new Map<string, Promise<void>>();

export function ensureScopeTypeItems(
  scopeTypeId: string,
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const entry = getState().scopesTree.contextItemsByTypeId[scopeTypeId];

    if (!refresh) {
      if (entry?.status === "ready") return;
      if (entry?.status === "loading") {
        const p = inFlight.get(scopeTypeId);
        if (p) return p;
      }
    }

    dispatch(scopesActions.contextItemsFetchPending({ scopeTypeId }));

    const promise = (async () => {
      try {
        const res = await scopesService.listContextItems(scopeTypeId);
        if (isScopesRpcErr(res)) {
          dispatch(
            scopesActions.contextItemsFetchRejected({
              scopeTypeId,
              error: res.error.message,
            }),
          );
        } else {
          const items = [...res.data.items].sort(
            (a, b) =>
              (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
              a.display_name.localeCompare(b.display_name),
          );
          dispatch(
            scopesActions.contextItemsFetchFulfilled({ scopeTypeId, items }),
          );
        }
      } finally {
        inFlight.delete(scopeTypeId);
      }
    })();

    inFlight.set(scopeTypeId, promise);
    return promise;
  };
}
