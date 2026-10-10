// features/scopes/hooks/useScopeTypeTables.ts
//
// Data hook for the /scopes hub tables: given the scope types on screen, the holder's catalog of
// each type's fields (the columns) and the holder's values of every scope (the cells). It asks the
// holder's own thunks — one catalog read per type, ONE values read for every scope — and keeps no
// copy and no sort of its own (the field door answers each type's fields in their order).

"use client";

import type { ContextField, ContextValue } from "@ai-matrx/records/scopes";
import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { listScopeTypeItems } from "@/features/scopes/redux/contextItemCatalog";
import { ensureContextValuesForScopes } from "@/features/scopes/redux/thunks/ensureContextValues";

export interface UseScopeTypeTablesReturn {
  /** Each scope type's fields, in the door's order. */
  itemsByType: Record<string, ContextField[]>;
  /** Current cell per scope, keyed scopeId → field id. */
  valuesByScope: Record<string, Record<string, ContextValue>>;
  status: "idle" | "loading" | "ready" | "error";
  /** The first refusal the store answered (a refused read is never an empty table). */
  error: string | null;
}

export function useScopeTypeTables(scopeTypeIds: string[], scopeIds: string[]): UseScopeTypeTablesReturn {
  const dispatch = useAppDispatch();
  // Depend on the requested IDs, not arrays recreated by the caller on render.
  const key = JSON.stringify([[...new Set(scopeTypeIds)].sort(), [...new Set(scopeIds)].sort()]);
  const [typeIds, rowIds] = useMemo(() => JSON.parse(key) as [string[], string[]], [key]);

  useEffect(() => {
    for (const t of typeIds) void dispatch(listScopeTypeItems(t));
    if (rowIds.length > 0) void dispatch(ensureContextValuesForScopes(rowIds));
  }, [dispatch, typeIds, rowIds]);

  const catalogs = useAppSelector((s) => s.scopesTree.contextItemsByTypeId);
  const byScope = useAppSelector((s) => s.contextValues.byScope);

  return useMemo(() => {
    if (typeIds.length === 0) return { itemsByType: {}, valuesByScope: {}, status: "idle", error: null };
    const itemsByType: Record<string, ContextField[]> = {};
    const valuesByScope: Record<string, Record<string, ContextValue>> = {};
    let error: string | null = null;
    let ready = true;
    for (const t of typeIds) {
      const entry = catalogs[t];
      if (entry?.status === "error") error ??= entry.error ?? "The read failed.";
      else if (entry?.status !== "ready") ready = false;
      itemsByType[t] = entry?.items ?? [];
    }
    for (const id of rowIds) {
      const entry = byScope[id];
      if (entry?.status === "error") error ??= entry.error ?? "The read failed.";
      else if (entry?.status !== "ready") ready = false;
      if (entry) valuesByScope[id] = entry.values;
    }
    const status = error ? "error" : ready ? "ready" : "loading";
    return { itemsByType, valuesByScope, status, error };
  }, [typeIds, rowIds, catalogs, byScope]);
}
