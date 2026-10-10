"use client";

// features/scopes/hooks/useRowScopes.ts
//
// A list row's scope tags, from THE holder (`scopesTree.entityScopesByKey`): the entry a page's one
// bulk read (`ensureEntityScopesBulk`) filled — its ids, still loading, or the store's refusal — and
// the write-through a saved tag change applies. No module cache of its own.

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import type { EntityScopesEntry } from "@/features/scopes/types";

const IDLE: EntityScopesEntry = { status: "idle", scope_ids: [], fetchedAt: null, error: null };

/** One row's entry: `status` `ready` (with `scope_ids`), `loading`/`idle`, or `error` (the refusal). */
export function useRowScopes(entityType: string, entityId: string): EntityScopesEntry {
  return useAppSelector((s) => s.scopesTree.entityScopesByKey[`${entityType}:${entityId}`] ?? IDLE);
}

/** Write a row's saved tags through to the holder, so every cell showing it updates at once. */
export function useSetRowScopes(): (entityType: string, entityId: string, scopeIds: string[]) => void {
  const dispatch = useAppDispatch();
  return useCallback(
    (entityType, entityId, scopeIds) =>
      dispatch(scopesActions.entityScopesUpdated({ key: `${entityType}:${entityId}`, scope_ids: scopeIds })),
    [dispatch],
  );
}
