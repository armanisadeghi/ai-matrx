// features/scopes/redux/thunks/ensureScopeTasks.ts
//
// Lazy per-level task fetch. Called when the user expands a tree node.
// No-refetch policy applies: a key already in `ready` or `empty` is a no-op
// unless `refresh: true`. In-flight requests are deduped per key.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";
import type { TaskBucketLevel } from "@/features/scopes/types";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

const inFlight = new Map<string, Promise<void>>();

function bucketKey(level: TaskBucketLevel, id: string): string {
  return `${level}:${id}`;
}

export function ensureScopeTasks(
  level: TaskBucketLevel,
  id: string,
  opts: { refresh?: boolean } = {},
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { refresh = false } = opts;
    const key = bucketKey(level, id);
    const entry = getState().scopesTree.tasksByKey[key];

    if (!refresh) {
      if (entry?.status === "ready" || entry?.status === "empty") return;
      if (entry?.status === "loading") {
        const p = inFlight.get(key);
        if (p) return p;
      }
    }

    dispatch(scopesActions.tasksFetchPending({ key }));

    const promise = (async () => {
      try {
        const res = await scopesService.listScopeTasks(level, id);
        if (isScopesRpcErr(res)) {
          dispatch(
            scopesActions.tasksFetchRejected({ key, error: res.error.message }),
          );
        } else {
          dispatch(
            scopesActions.tasksFetchFulfilled({ key, tasks: res.data.tasks }),
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
