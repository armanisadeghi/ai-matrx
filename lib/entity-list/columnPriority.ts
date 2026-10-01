// lib/entity-list/columnPriority.ts
//
// THE LEAST IMPORTANT COLUMN LEAVES FIRST (DATA-HOME-3E, 2026-10-01). At 1024 px /data-v2's seven
// columns added up past the list's width: the table scrolled sideways inside itself, Owner and
// Access sat off the right edge, and a floating `>` chevron covered Updated. Linear's list drops
// its lowest-priority properties as the window narrows and brings them back when it widens; this
// is that rule for every entity list.
//
// A column declares `priority` (EntityColumnSpec): 1 = keep longest, higher = leaves sooner. A
// column with no priority (the name, the star, anything a surface did not rank) never leaves. When
// the shown columns' declared widths, plus the row-actions column, exceed the room the list has,
// the highest-priority-number column leaves first (the later-declared one on a tie), until the rest
// fit. It is layout, not a preference: nothing is stored, and the column picker says so for each
// column that has no room ("No room").

import type { EntityColumnSpec } from "./columns";

/** Width counted for a column whose declared width is not a number of pixels. */
export const UNKNOWN_COLUMN_WIDTH = 120;
/** Room the table's own row-actions column takes (copy + ⋮ at desktop density). */
export const ROW_ACTIONS_WIDTH = 80;

function widthOf<TRow>(spec: EntityColumnSpec<TRow>): number {
  const w = spec.column.width;
  return typeof w === "number" && Number.isFinite(w) ? w : UNKNOWN_COLUMN_WIDTH;
}

/**
 * The ids of the shown columns that have no room at `available` px, least important first.
 * `available` null (not measured yet, or a phone, where the list is cards) = none leave.
 */
export function columnsWithoutRoom<TRow>(
  specs: readonly EntityColumnSpec<TRow>[],
  hidden: readonly string[],
  available: number | null,
  reserve: number = ROW_ACTIONS_WIDTH,
): string[] {
  if (available === null || available <= 0) return [];
  const shown = specs.filter((spec) => !hidden.includes(spec.id));
  let total = reserve + shown.reduce((sum, spec) => sum + widthOf(spec), 0);
  if (total <= available) return [];
  const candidates = shown
    .map((spec, index) => ({ spec, index }))
    .filter(({ spec }) => typeof spec.priority === "number" && !spec.locked)
    .sort((a, b) => (b.spec.priority ?? 0) - (a.spec.priority ?? 0) || b.index - a.index);
  const out: string[] = [];
  for (const { spec } of candidates) {
    if (total <= available) break;
    out.push(spec.id);
    total -= widthOf(spec);
  }
  return out;
}
