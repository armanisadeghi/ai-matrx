"use client";

// features/unified-data/standard-field-columns/useServerGroupCounts.ts
//
// TRUE GROUP COUNTS FOR A SERVER-PAGED LIST. The canonical table groups the rows it holds — one
// page — so a group header that counted the page would say "3 people" for a value 40 people hold.
// The table's `grouping.groupFacts` seam lets the host answer with the whole result's count; this
// asks the list's own service once per group value on screen (the list's filters + that value),
// and returns `undefined` for a group until its count lands, so the header falls back to the
// page's own number rather than a guess.

import { useEffect, useMemo, useState } from "react";
import { CUSTOM_NONE_VALUE } from "./standardFieldColumns";

export interface ServerGroupCounts {
  /** For `grouping.groupFacts`. */
  groupFacts: (group: { value: unknown }) => { count?: number | null } | undefined;
}

function valueKey(value: unknown): string {
  return value === null || value === undefined || value === "" ? CUSTOM_NONE_VALUE : String(value);
}

/**
 * @param columnId the grouped column, or null when the list is flat (nothing is asked).
 * @param values the grouping values present on the page.
 * @param queryKey identity of the list's current query — a change re-asks every count.
 * @param countWhere the list's own count with one more filter: this column = this value
 *   (`__none__` = has no value).
 */
export function useServerGroupCounts(
  columnId: string | null,
  values: readonly unknown[],
  queryKey: string,
  countWhere: (columnId: string, value: string) => Promise<number>,
): ServerGroupCounts {
  const wanted = useMemo(
    () => (columnId ? [...new Set(values.map(valueKey))].sort() : []),
    [columnId, values],
  );
  const askKey = `${columnId ?? ""}|${queryKey}|${wanted.join("\u0001")}`;
  const [answered, setAnswered] = useState<{ key: string; counts: Map<string, number> }>({
    key: "",
    counts: new Map(),
  });

  useEffect(() => {
    if (!columnId || wanted.length === 0) return;
    let cancelled = false;
    void Promise.all(
      wanted.map(async (value) => {
        try {
          return [value, await countWhere(columnId, value)] as const;
        } catch (e) {
          console.error("[group counts] count failed:", e);
          return null;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const counts = new Map<string, number>();
      for (const pair of pairs) if (pair) counts.set(pair[0], pair[1]);
      setAnswered({ key: askKey, counts });
    });
    return () => {
      cancelled = true;
    };
    // countWhere closes over the same query `queryKey` names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey]);

  const counts = answered.key === askKey ? answered.counts : null;
  return {
    groupFacts: (group) => {
      const count = counts?.get(valueKey(group.value));
      return count === undefined ? undefined : { count };
    },
  };
}
