/**
 * features/marketing/content-plan/utils.ts
 *
 * Shared pure helpers for this feature's list surfaces (PlanNodesTable,
 * PlanSitesList). Table-shape helpers only — tree/layout logic lives in
 * lib/tree-view.ts and pillar-map/layouts.ts.
 */

/** Compact date for "Updated" columns — month + day, year only when not this year. */
export function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Count rows per key value; empty keys are skipped (they render as "—"). */
export function countBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Append live counts to filter options — "Planned (12)". */
export function withCounts(
  options: Array<{ value: string; label: string }>,
  counts: ReadonlyMap<string, number>,
): Array<{ value: string; label: string }> {
  return options.map((option) => ({
    value: option.value,
    label: `${option.label} (${counts.get(option.value) ?? 0})`,
  }));
}
