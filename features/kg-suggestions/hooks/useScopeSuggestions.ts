// features/kg-suggestions/hooks/useScopeSuggestions.ts
//
// Page-level hook for rolling suggestion hints across the scope/org surfaces
// (scope detail, context-items list, scopes table, org overview, org list).
//
// It reads the ONE shared global pending list (same normalized cache key the
// drawer + nav button use) and indexes it by scope and by scope-item, so a
// container can fetch once and hand pre-filtered rows to many small hints
// without each hint firing its own request. Accept/reject/defer come straight
// from the underlying hook, so a decision on any surface clears the hint
// everywhere in one tick.

"use client";

import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import type {
  KgGlobalFilter,
  KgSuggestionRow,
} from "@/features/kg-suggestions/types";

export interface UseScopeSuggestionsResult {
  /** Every pending row (slot-fill + heavy-hitter). */
  items: KgSuggestionRow[];
  /** Pending rows that target a scope, grouped by `target.scope_id`. */
  byScope: Map<string, KgSuggestionRow[]>;
  /** Pending rows grouped by `${scopeId}:${scopeItemId}`. */
  byScopeItem: Map<string, KgSuggestionRow[]>;
  accept: ReturnType<typeof useKgSuggestions>["accept"];
  reject: ReturnType<typeof useKgSuggestions>["reject"];
  defer: ReturnType<typeof useKgSuggestions>["defer"];
  status: ReturnType<typeof useKgSuggestions>["status"];
  refresh: () => void;
  /** Rows for one scope (empty array when none). */
  forScope: (scopeId: string | null | undefined) => KgSuggestionRow[];
  /** Rows for one scope-item cell (empty array when none). */
  forScopeItem: (
    scopeId: string | null | undefined,
    scopeItemId: string | null | undefined,
  ) => KgSuggestionRow[];
  /** Total pending count across a set of scope ids. */
  countForScopes: (scopeIds: Iterable<string>) => number;
}

const EMPTY: KgSuggestionRow[] = [];

export function useScopeSuggestions(
  options: { autoFetch?: boolean } = {},
): UseScopeSuggestionsResult {
  const filter: KgGlobalFilter = { global: true, status: "pending" };
  const { items, status, accept, reject, defer, refresh } = useKgSuggestions(
    filter,
    { autoFetch: options.autoFetch ?? true },
  );

  // React Compiler is on — plain derivations, no manual memoization.
  const byScope = new Map<string, KgSuggestionRow[]>();
  const byScopeItem = new Map<string, KgSuggestionRow[]>();
  for (const row of items) {
    const scopeId = row.target.scope_id;
    if (!scopeId) continue;
    const scopeList = byScope.get(scopeId);
    if (scopeList) scopeList.push(row);
    else byScope.set(scopeId, [row]);

    const itemId = row.target.scope_item_id;
    if (itemId) {
      const key = `${scopeId}:${itemId}`;
      const itemList = byScopeItem.get(key);
      if (itemList) itemList.push(row);
      else byScopeItem.set(key, [row]);
    }
  }

  return {
    items,
    byScope,
    byScopeItem,
    accept,
    reject,
    defer,
    status,
    refresh,
    forScope: (scopeId) => (scopeId ? (byScope.get(scopeId) ?? EMPTY) : EMPTY),
    forScopeItem: (scopeId, scopeItemId) =>
      scopeId && scopeItemId
        ? (byScopeItem.get(`${scopeId}:${scopeItemId}`) ?? EMPTY)
        : EMPTY,
    countForScopes: (scopeIds) => {
      let n = 0;
      for (const id of scopeIds) n += byScope.get(id)?.length ?? 0;
      return n;
    },
  };
}
