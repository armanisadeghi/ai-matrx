/**
 * AN EDIT KEEPS THE VIEW TRUE (lane DATA-V2-BASICS, 2026-09-27).
 *
 * Arman: with a sort set, editing a cell in the sorted column did not re-apply the sort — the row
 * stayed where it was, so the screen said "sorted by Customer" over rows that were not. The rule
 * (Notion, Airtable after the edit lands): an edit to the column that ORDERS the view re-applies
 * the order, and the edited cell stays selected and in sight; an edit that takes a row OUT of the
 * view (off this page by the sort, or out of a filter) says so, names the row, and offers Undo —
 * never a row that silently vanishes.
 *
 * Pure: no React, no DOM. The Sheet (UserTableViewer) owns the re-read and the notice.
 */
import { isActiveFilter, type ColumnFilterMap } from "./column-filters";

export interface EditedCell {
  rowId: string;
  fieldName: string;
}

export type ViewEffect = "order" | "filter";

/** Does a new value in this column decide what the view shows or in what order? */
export function editMovesTheView(
  fieldName: string,
  sortField: string | null | undefined,
  filters: ColumnFilterMap,
): ViewEffect | null {
  const filter = filters[fieldName];
  if (filter && isActiveFilter(filter)) return "filter";
  if (sortField && fieldName === sortField) return "order";
  return null;
}

/** The edited rows the view no longer shows. */
export function rowsThatLeft(edited: readonly EditedCell[], shownRowIds: readonly string[]): EditedCell[] {
  const shown = new Set(shownRowIds);
  const seen = new Set<string>();
  const left: EditedCell[] = [];
  for (const cell of edited) {
    if (shown.has(cell.rowId) || seen.has(cell.rowId)) continue;
    seen.add(cell.rowId);
    left.push(cell);
  }
  return left;
}

/** The notice for rows an edit took out of the view — what moved, and why. */
export function leftTheViewSentence(
  left: ReadonlyArray<{ label: string; effect: ViewEffect; columnName: string }>,
): string | null {
  if (left.length === 0) return null;
  if (left.length === 1) {
    const [one] = left;
    const name = one!.label ? `"${one!.label}"` : "The row you changed";
    return one!.effect === "filter"
      ? `${name} no longer matches the filter on ${one!.columnName}, so it is hidden.`
      : `${name} moved to another page — the table is sorted by ${one!.columnName}.`;
  }
  const filters = left.filter((l) => l.effect === "filter").length;
  return filters === left.length
    ? `${left.length} rows you changed no longer match the filter, so they are hidden.`
    : `${left.length} rows you changed moved out of this page.`;
}
