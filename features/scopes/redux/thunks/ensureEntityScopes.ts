// features/scopes/redux/thunks/ensureEntityScopes.ts
//
// Lazy per-entity scope-assignment fetch. The Surface B counterpart to
// `ensureScopeTree` — populates `scopesTree.entityScopesByKey[<key>]`
// when a tagger or resolver actually needs the entity's local scopes.
//
// No-refetch policy: status === "ready" short-circuits unless `refresh`
// is explicitly passed. In-flight requests are deduped per key, so it's
// safe to call from multiple components simultaneously.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";
import type { EntityType } from "@/features/scopes/types";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

const inFlight = new Map<string, Promise<void>>();

export function entityScopesKey(
  entityType: EntityType,
  entityId: string,
): string {
  return `${entityType}:${entityId}`;
}

export function ensureEntityScopes(
  entityType: EntityType,
  entityId: string,
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const key = entityScopesKey(entityType, entityId);
    const entry = getState().scopesTree.entityScopesByKey[key];

    if (!refresh && entry?.status === "ready") return;
    if (entry?.status === "loading" && inFlight.has(key)) {
      return inFlight.get(key);
    }

    dispatch(scopesActions.entityScopesFetchPending({ key }));

    const promise = (async () => {
      try {
        const res = await scopesService.getEntityScopes(entityType, entityId);
        if (isScopesRpcErr(res)) {
          dispatch(
            scopesActions.entityScopesFetchRejected({
              key,
              error: res.error.message,
            }),
          );
        } else {
          dispatch(
            scopesActions.entityScopesFetchFulfilled({
              key,
              scope_ids: res.data.scope_ids,
            }),
          );
        }
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, promise);
    return promise;
  };
}
