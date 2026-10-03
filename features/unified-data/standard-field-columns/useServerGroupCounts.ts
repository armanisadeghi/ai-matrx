"use client";

// features/unified-data/standard-field-columns/useServerGroupCounts.ts
//
// TRUE GROUP COUNTS FOR A SERVER-PAGED LIST. The canonical table groups the rows it holds — one
// page — so a group header that counted the page would say "3 people" for a value 40 people hold.
// The table's `grouping.groupFacts` seam lets the host answer with the whole result's count; this
// asks the list's own service once per group value on screen (the list's filters + that value).
//
// NOTHING FAILS SILENTLY: while a count is in flight the header shows nothing of its own; when
// a count could not be read the header says so (`failed`) — never the page's number passed off
// as the group's.

import { useEffect, useMemo, useState } from "react";
import { CUSTOM_NONE_VALUE } from "./standardFieldColumns";

export interface ServerGroupCounts {
  /** For `grouping.groupFacts`. */
  groupFacts: (group: { value: unknown }) => { count?: number | null } | undefined;
  /** True when this group's whole-result count could not be read. */
  failed: (value: unknown) => boolean;
}

function valueKey(value: unknown): string {
  return value === null || value === undefined || value === "" ? CUSTOM_NONE_VALUE : String(value);
}

/**
 * @param columnId the grouped column, or null when the list is flat (nothing is asked).
 * @param values the raw grouping values present on the page.
 * @param queryKey identity of the list's current query — a change re-asks every count.
 * @param countWhere the list's own count with one more condition: this column = this raw value.
 */
export function useServerGroupCounts(
  columnId: string | null,
  values: readonly unknown[],
  queryKey: string,
  countWhere: (columnId: string, value: unknown) => Promise<number>,
): ServerGroupCounts {
  const wanted = useMemo(() => {
    if (!columnId) return [] as { key: string; value: unknown }[];
    const byKey = new Map<string, unknown>();
    for (const v of values) byKey.set(valueKey(v), v);
    return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value }));
  }, [columnId, values]);
  const askKey = `${columnId ?? ""}|${queryKey}|${wanted.map((w) => w.key).join("\u0001")}`;
  const [answered, setAnswered] = useState<{
    key: string;
    counts: Map<string, number>;
    failed: Set<string>;
  }>({ key: "", counts: new Map(), failed: new Set() });

  useEffect(() => {
    if (!columnId || wanted.length === 0) return;
    let cancelled = false;
    void Promise.all(
      wanted.map(async ({ key, value }) => {
        try {
          return { key, count: await countWhere(columnId, value) };
        } catch (e) {
          console.error("[group counts] count failed:", e);
          return { key, count: null };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const counts = new Map<string, number>();
      const failed = new Set<string>();
      for (const r of results) {
        if (r.count === null) failed.add(r.key);
        else counts.set(r.key, r.count);
      }
      setAnswered({ key: askKey, counts, failed });
    });
    return () => {
      cancelled = true;
    };
    // countWhere closes over the same query `queryKey` names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey]);

  const current = answered.key === askKey ? answered : null;
  return {
    groupFacts: (group) => {
      const count = current?.counts.get(valueKey(group.value));
      return count === undefined ? undefined : { count };
    },
    failed: (value) => current?.failed.has(valueKey(value)) ?? false,
  };
}
