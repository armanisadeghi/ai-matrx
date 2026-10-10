// features/scopes/hooks/useScopeTypeTables.ts
//
// Data hook for the /scopes hub tables: given the scope types on screen,
// batch-load every type's active context-item catalog (the table columns)
// and every scope's CURRENT cell values (the table cells) in two
// round-trips total. View-scoped cache; the per-scope Redux cache
// (`useContextValues`) stays the editor path.

"use client";

import type { ContextField, ContextValue } from "@ai-matrx/records/scopes";
import { useEffect, useRef, useState } from "react";
import { scopesService } from "@/features/scopes/service/scopesService";

export interface UseScopeTypeTablesReturn {
  /** Active items per scope type, sorted by sort. */
  itemsByType: Record<string, ContextField[]>;
  /** Current cell per scope, keyed scopeId → field id. */
  valuesByScope: Record<string, Record<string, ContextValue>>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

export function useScopeTypeTables(
  scopeTypeIds: string[],
  scopeIds: string[],
): UseScopeTypeTablesReturn {
  const [itemsByType, setItemsByType] = useState<
    Record<string, ContextField[]>
  >({});
  const [valuesByScope, setValuesByScope] = useState<
    Record<string, Record<string, ContextValue>>
  >({});
  const [status, setStatus] = useState<UseScopeTypeTablesReturn["status"]>(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  // One fetch per distinct id-set; the tree is stable after boot, so this
  // effectively runs once (and again only if the tree gains/loses rows).
  const fetchedKey = useRef<string | null>(null);
  // Depend on the requested IDs, not arrays recreated by the caller on render.
  const key = JSON.stringify([
    [...new Set(scopeTypeIds)].sort(),
    [...new Set(scopeIds)].sort(),
  ]);

  useEffect(() => {
    const [typeIds, rowIds] = JSON.parse(key) as [string[], string[]];
    if (typeIds.length === 0) {
      setItemsByType({});
      setValuesByScope({});
      setError(null);
      setStatus("idle");
      return;
    }
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;

    let cancelled = false;
    setStatus("loading");
    void (async () => {
      const [itemsRes, valuesRes] = await Promise.all([
        scopesService.listContextItemsForTypes(typeIds),
        scopesService.listContextValuesForScopes(rowIds),
      ]);
      if (cancelled) return;

      if (!itemsRes.ok || !valuesRes.ok) {
        const message = !itemsRes.ok
          ? itemsRes.error.message
          : !valuesRes.ok
            ? valuesRes.error.message
            : "Unknown error";
        // Loud recovery: a silent empty table looks like "no context items
        // defined", which is a lie when the fetch failed.
        console.error("[scopes-hub] context items/values fetch failed:", {
          itemsRes,
          valuesRes,
        });
        setError(message);
        setStatus("error");
        return;
      }

      const byType: Record<string, ContextField[]> = {};
      for (const item of itemsRes.data.items) {
        (byType[item.scope_type_id] ??= []).push(item);
      }
      for (const list of Object.values(byType)) {
        list.sort((a, b) => a.sort - b.sort);
      }

      const byScope: Record<string, Record<string, ContextValue>> = {};
      for (const value of valuesRes.data.values) {
        (byScope[value.scope_id] ??= {})[value.field_id] = value;
      }

      setItemsByType(byType);
      setValuesByScope(byScope);
      setError(null);
      setStatus("ready");
    })();

    return () => {
      // A cancelled run must not count as fetched, or the Strict Mode
      // double-mount (run → cleanup → run) skips the second, real fetch.
      cancelled = true;
      if (fetchedKey.current === key) fetchedKey.current = null;
    };
  }, [key]);

  return { itemsByType, valuesByScope, status, error };
}
