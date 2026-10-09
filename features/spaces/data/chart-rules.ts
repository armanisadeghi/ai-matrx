// features/spaces/data/chart-rules.ts — what a chart view counts and in what order: its view's
// filters ("is", "is any of") and its view's sort on the grouped field (Notion's chart view).

import { choiceSlug, type ReadRow } from "@ai-matrx/records/react";

import type { ChartSettings } from "./sources";

/** A view's filters, as the view stores them: a scalar is "is", a list is "is any of". */
export type ChartFilter = Record<string, string | number | boolean | null | string[]>;
/** A view's sorts (field + direction), in order. */
export type ChartSorts = ReadonlyArray<{ field: string; direction: "asc" | "desc" }>;

const sameValue = (got: unknown, want: string | number | boolean) =>
  String(got) === String(want) || choiceSlug(String(got)) === choiceSlug(String(want));

/** Does a read row pass the view's filters? (A choice is stored as its value or its slug.) */
export function passes(row: ReadRow, filter: ChartFilter): boolean {
  const doc = row.document as Record<string, unknown>;
  return Object.entries(filter).every(([k, want]) => {
    const got = doc[k] ?? null;
    if (Array.isArray(want)) return want.length === 0 || (got !== null && want.some((w) => sameValue(got, w)));
    if (want === null) return got === null || got === "";
    if (got === null) return false;
    return sameValue(got, want);
  });
}

/** The store's aggregate answers equality filters only; a view with an "is any of" is counted over its rows. */
/** One definition, shared with the server's first reads (data/first-reads.ts). */
export { hasListFilter } from "./first-reads";

/**
 * Notion orders a chart's groups by the chart's own sort first; a manual chart follows its view's sort
 * when that sort is on the grouped field (Status A→Z puts the slices and bars in that order).
 */
export function orderPoints<P extends { label: string; value: number }>(points: P[], sort: ChartSettings["sort"], sorts: ChartSorts, group: string | null): P[] {
  const out = [...points];
  if (sort === "asc") return out.sort((a, b) => a.value - b.value);
  if (sort === "desc") return out.sort((a, b) => b.value - a.value);
  const bySort = group ? sorts.find((x) => x.field === group) : undefined;
  if (bySort) {
    const dir = bySort.direction === "desc" ? -1 : 1;
    out.sort((a, b) => dir * a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
  }
  return out;
}

