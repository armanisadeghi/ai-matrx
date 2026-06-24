// features/scopes/redux/thunks/associations.ts
//
// Thunks for the unified association edge (`platform.associations`) — the
// canonical attach/detach primitive. They write ONLY `platform.associations`
// via `associationsService` (the sole RPC chokepoint) and keep the
// `scopesTree.associationsByKey` cache coherent.
//
// CRITICAL — same invariant as `setEntityScopes`: these thunks NEVER dispatch
// appContextSlice actions (setOrganization / setScopeSelections / setProject /
// setTask / clearContext / setFullContext). A durable association is NOT the
// user's active working context. Surface A owns appContextSlice; this code
// owns durable relationships. The global-vs-local invariant in
// features/scopes/FEATURE.md depends on this staying true.
//
// Both-directions freshness: a write touches TWO endpoints (the source and the
// target each see the edge), so every mutation reloads BOTH caches with force.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { associationsService } from "@/features/scopes/service/associationsService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";
import type { AssociationTargetType } from "@/features/scopes/types";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

/** Cache key for one association endpoint. Mirrors `entityScopesKey`. */
export function associationsKey(type: string, id: string): string {
  return `${type}:${id}`;
}

const inFlight = new Map<string, Promise<void>>();

export interface AssociationWriteResult {
  ok: boolean;
  /** Set on a successful single-edge `addAssociation`. */
  id?: string;
  error?: string;
}

/**
 * Lazy load of every edge touching `${type}:${id}` (both directions). Deduped
 * per key; `status === "ready"` short-circuits unless `force` is passed.
 */
export function loadAssociations(args: {
  type: string;
  id: string;
  force?: boolean;
}): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { type, id, force = false } = args;
    if (!type || !id) return;
    const key = associationsKey(type, id);
    const entry = getState().scopesTree.associationsByKey[key];

    if (!force && entry?.status === "ready") return;
    if (!force && entry?.status === "loading" && inFlight.has(key)) {
      return inFlight.get(key);
    }

    dispatch(scopesActions.associationsFetchPending({ key }));

    const promise = (async () => {
      try {
        const res = await associationsService.listForEntity(type, id);
        if (isScopesRpcErr(res)) {
          dispatch(
            scopesActions.associationsFetchRejected({
              key,
              error: res.error.message,
            }),
          );
        } else {
          dispatch(
            scopesActions.associationsFetchFulfilled({
              key,
              edges: res.data.edges,
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

/** Reload both endpoints of an edge so each side's cache reflects the write. */
function reloadBoth(
  sourceType: string,
  sourceId: string,
  targetType: string,
  targetId: string,
): AppThunk<Promise<void>> {
  return async (dispatch) => {
    await Promise.all([
      dispatch(loadAssociations({ type: sourceType, id: sourceId, force: true })),
      dispatch(loadAssociations({ type: targetType, id: targetId, force: true })),
    ]);
  };
}

/**
 * Attach `source` → `target` (idempotent). On success reloads BOTH endpoints
 * so the source's outgoing edges and the target's incoming edges are both fresh.
 */
export function addAssociation(args: {
  sourceType: string;
  sourceId: string;
  targetType: AssociationTargetType;
  targetId: string;
  orgId?: string;
  label?: string;
}): AppThunk<Promise<AssociationWriteResult>> {
  return async (dispatch) => {
    const res = await associationsService.add(args);
    if (isScopesRpcErr(res)) {
      return { ok: false, error: res.error.message };
    }
    await dispatch(
      reloadBoth(args.sourceType, args.sourceId, args.targetType, args.targetId),
    );
    return { ok: true, id: res.data.id };
  };
}

/** Detach `source` → `target`. On success reloads BOTH endpoints. */
export function removeAssociation(args: {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
}): AppThunk<Promise<AssociationWriteResult>> {
  return async (dispatch) => {
    const res = await associationsService.remove(args);
    if (isScopesRpcErr(res)) {
      return { ok: false, error: res.error.message };
    }
    await dispatch(
      reloadBoth(args.sourceType, args.sourceId, args.targetType, args.targetId),
    );
    return { ok: true };
  };
}

/**
 * Replace the source's edges of `targetType` to exactly equal `targetIds`.
 * Reloads the SOURCE endpoint (the only one with a deterministic post-state;
 * each affected target reload would need the full before/after diff, so callers
 * that display a specific target refresh it via `loadAssociations({force})`).
 */
export function setAssociationTargets(args: {
  sourceType: string;
  sourceId: string;
  targetType: AssociationTargetType;
  targetIds: string[];
  orgId?: string;
}): AppThunk<Promise<AssociationWriteResult>> {
  return async (dispatch) => {
    const res = await associationsService.setTargets(args);
    if (isScopesRpcErr(res)) {
      return { ok: false, error: res.error.message };
    }
    await dispatch(
      loadAssociations({ type: args.sourceType, id: args.sourceId, force: true }),
    );
    return { ok: true };
  };
}
