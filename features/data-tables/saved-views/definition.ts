/**
 * What a saved view of a data table CONTAINS, and how it is read back safely.
 *
 * A saved view is the whole `TableViewState` — search, sort, filters, page size,
 * column visibility and column order — under a name. It is the URL made durable:
 * the URL already carries a view, this gives that view a name you can return to.
 *
 * 🚨 VALIDATE ON READ, ALWAYS DEGRADE. The definition is jsonb, which means it
 * can be older than this code, hand-edited, or written by a version that knew a
 * different shape. A view that cannot be understood must resolve to the DEFAULT
 * view — never throw, and never apply a half-understood shape. Losing a saved
 * view's settings is a small annoyance; throwing the whole table page away
 * because one stored blob is odd is not.
 *
 * PAGE NUMBER IS DELIBERATELY NOT STORED. "Page 4" is where you happened to be,
 * not what the view IS — restoring someone onto page 4 of a filtered set they
 * have never seen is disorienting, and the row that was on page 4 last week is
 * not there now. Every other axis is stored.
 *
 * Bump `SAVED_VIEW_DEFINITION_VERSION` when the shape gains or loses a field,
 * and teach `parseSavedViewDefinition` to read the older shapes — the same
 * discipline `crm.saved_view` and `ListViewPrefs.version` already use.
 */

import type { ColumnFilterMap } from "../column-filters";
import {
  activeFiltersOnly,
  isColumnFilterMap,
  type SortDirection,
  type TableViewState,
} from "../table-view-url";

/** Every data-table saved view belongs to this surface. */
export const DATA_TABLE_SURFACE_KEY = "matrx-user/data-tables" as const;

export const SAVED_VIEW_DEFINITION_VERSION = 1;

/** The stored shape. Page is absent by design — see the header. */
export type SavedViewDefinition = {
  search: string;
  sortField: string | null;
  sortDirection: SortDirection;
  filters: ColumnFilterMap;
  pageSize: number | null;
  hidden: string[];
  order: string[];
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function emptySavedViewDefinition(): SavedViewDefinition {
  return {
    search: "",
    sortField: null,
    sortDirection: "asc",
    filters: {},
    pageSize: null,
    hidden: [],
    order: [],
  };
}

/**
 * Capture the CURRENT view as a definition.
 *
 * Only ACTIVE filters are stored: a half-typed filter the user left open is
 * part of the moment, not part of the view, and storing it would resurrect an
 * empty control every time the view is opened.
 */
export function definitionFromViewState(
  state: TableViewState,
  defaults: { pageSize: number },
): SavedViewDefinition {
  return {
    search: state.search,
    sortField: state.sortField,
    sortDirection: state.sortDirection,
    filters: activeFiltersOnly(state.filters),
    pageSize: state.pageSize === defaults.pageSize ? null : state.pageSize,
    hidden: [...state.hidden],
    order: [...state.order],
  };
}

/**
 * Apply a definition to produce the view state to render.
 *
 * Always lands on page 1 — see the header on why the page is not part of a view.
 */
export function viewStateFromDefinition(
  definition: SavedViewDefinition,
  defaults: { pageSize: number },
): TableViewState {
  return {
    search: definition.search,
    sortField: definition.sortField,
    sortDirection: definition.sortDirection,
    filters: definition.filters,
    page: 1,
    pageSize: definition.pageSize ?? defaults.pageSize,
    hidden: definition.hidden,
    order: definition.order,
  };
}

/**
 * Read a stored definition. NEVER throws.
 *
 * Each field is validated independently so ONE bad field costs only that field:
 * a corrupt filter blob should not also discard the column layout the user
 * spent time arranging.
 */
export function parseSavedViewDefinition(raw: unknown): SavedViewDefinition {
  const out = emptySavedViewDefinition();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  const v = raw as Record<string, unknown>;

  if (typeof v.search === "string") out.search = v.search;
  if (typeof v.sortField === "string") out.sortField = v.sortField;
  if (v.sortDirection === "asc" || v.sortDirection === "desc") {
    out.sortDirection = v.sortDirection;
  }
  if (isColumnFilterMap(v.filters)) out.filters = v.filters;
  if (
    typeof v.pageSize === "number" &&
    Number.isFinite(v.pageSize) &&
    v.pageSize > 0
  ) {
    out.pageSize = Math.trunc(v.pageSize);
  }
  if (isStringArray(v.hidden)) out.hidden = v.hidden;
  if (isStringArray(v.order)) out.order = v.order;

  return out;
}

/** Does this definition actually narrow or rearrange anything? */
export function definitionIsEmpty(d: SavedViewDefinition): boolean {
  return (
    d.search.trim() === "" &&
    d.sortField === null &&
    Object.keys(d.filters).length === 0 &&
    d.pageSize === null &&
    d.hidden.length === 0 &&
    d.order.length === 0
  );
}

/** Do two definitions describe the same view? Drives the "unsaved changes" dot. */
export function sameDefinition(
  a: SavedViewDefinition,
  b: SavedViewDefinition,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A short human summary — what this view actually does, in the user's words.
 *
 * Shown on the view chip so a list of saved views is readable without opening
 * each one. Never mentions a machine field name where a header exists.
 */
export function describeDefinition(
  d: SavedViewDefinition,
  displayNameFor: (fieldName: string) => string,
): string {
  const parts: string[] = [];
  const filterCount = Object.keys(d.filters).length;
  if (filterCount === 1) {
    parts.push(`filtered by ${displayNameFor(Object.keys(d.filters)[0])}`);
  } else if (filterCount > 1) {
    parts.push(`${filterCount} filters`);
  }
  if (d.search.trim()) parts.push(`search “${d.search.trim()}”`);
  if (d.sortField) {
    parts.push(
      `sorted by ${displayNameFor(d.sortField)}${d.sortDirection === "desc" ? " ↓" : " ↑"}`,
    );
  }
  if (d.hidden.length === 1) parts.push("1 column hidden");
  else if (d.hidden.length > 1) parts.push(`${d.hidden.length} columns hidden`);
  if (d.order.length > 0) parts.push("reordered");
  return parts.length > 0 ? parts.join(" · ") : "Everything, unsorted";
}
