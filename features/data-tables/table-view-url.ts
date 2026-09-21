/**
 * The grid's view state, encoded for the URL.
 *
 * THE URL IS THE VIEW. Search, sort, column filters, page and page size all
 * live in the query string, so a refresh reproduces exactly what was on screen,
 * a copied link shows a colleague the same thing, and Back/Forward walk the
 * user's own decisions instead of only the route. A view that exists solely in
 * component state is a view that cannot be shared, bookmarked, or returned to.
 *
 * Parameter names match `@ai-matrx/design-system/data-table/url-state` on purpose — `q`,
 * `sort`, `f`, `p`, `ps` mean the same thing on every table surface in the app.
 * A second vocabulary for the same five concepts would be a small betrayal of
 * every user who learned the first one.
 *
 * DEFAULTS ARE OMITTED, never written. A pristine grid has a clean URL, and
 * "no `sort` parameter" and "sorted the default way" stay the same thing —
 * otherwise every link acquires noise that means nothing.
 *
 * Pure module: no React, no DOM, so the encoding round-trip is testable without
 * a browser.
 */

import {
  parseColumnSummaries,
  serializeColumnSummaries,
  type ColumnSummaryMap,
} from "./column-summaries";
import {
  isActiveFilter,
  type ColumnFilter,
  type ColumnFilterMap,
} from "./column-filters";

export type SortDirection = "asc" | "desc";

export type TableViewState = {
  search: string;
  sortField: string | null;
  sortDirection: SortDirection;
  filters: ColumnFilterMap;
  page: number;
  pageSize: number;
  /**
   * Field names hidden in THIS view. A per-view mask, never a table property:
   * hiding a column for yourself must not hide it for a colleague.
   */
  hidden: string[];
  /**
   * Field names in THIS view's order. An OVERRIDE, not a snapshot — a name the
   * table no longer has is dropped, and a column the table gained that this
   * list never heard of is appended rather than vanishing. That is what lets a
   * saved view survive the table growing a column.
   *
   * Empty means "use the table's own field_order".
   */
  order: string[];
  /**
   * How the grid uses horizontal space in THIS view. `default` = the person
   * has not chosen: the ORGANIZATION's default applies (knob
   * `extensibility.user_tables.default_layout`, itself auto | fit | scroll).
   * Anything else is the person's own override — including an explicit `auto`,
   * which is how someone picks Automatic inside an organization whose default
   * is something else.
   */
  layout: TableLayoutChoice;
  /** Per-column widths in px the user dragged, keyed by field name. */
  widths: Record<string, number>;
  /** Row height; `default` = the organization's default row height. */
  density: TableRowDensityChoice;
  /** Keep the first column on screen while scrolling sideways. */
  freezeFirst: boolean;
  /** Show whole cell text on as many lines as it needs, instead of one line ending in "…". */
  wrap: boolean;
  /** Summary-bar choice per column (sum / avg / count …), keyed by field name. */
  summaries: ColumnSummaryMap;
};

export type TableLayoutMode = "auto" | "fit" | "scroll";
export type TableRowDensity = "compact" | "normal" | "tall";
/** A view's choice: a concrete value, or `default` = "whatever my organization set". */
export type TableLayoutChoice = TableLayoutMode | "default";
export type TableRowDensityChoice = TableRowDensity | "default";
export const TABLE_LAYOUT_MODES: readonly TableLayoutMode[] = ["auto", "fit", "scroll"];
export const TABLE_ROW_DENSITIES: readonly TableRowDensity[] = ["compact", "normal", "tall"];
/** Dragged widths are clamped here: narrower hides the header menu, wider is a mistake. */
export const MIN_COLUMN_WIDTH_PX = 60;
export const MAX_COLUMN_WIDTH_PX = 1200;

export type TableViewDefaults = {
  pageSize: number;
};

/** Query-string keys this module owns. Nothing else may write them. */
export const TABLE_VIEW_PARAM_KEYS = [
  "q", "sort", "f", "p", "ps", "hide", "ord", "lay", "w", "den", "frz", "wrap", "agg",
] as const;

/**
 * Keys whose changes REPLACE rather than push a history entry.
 *
 * Only the search box: it fires per keystroke, and one history entry per
 * character would make Back useless — you would press it eleven times to undo
 * typing "Washington". Every other control is a discrete decision and pushes,
 * so Back undoes exactly that one choice.
 */
export const TABLE_VIEW_TEXT_KEYS = ["q"] as const;

function isColumnFilter(value: unknown): value is ColumnFilter {
  if (typeof value !== "object" || value === null) return false;
  const mode = (value as { mode?: unknown }).mode;
  if (mode === "text") {
    return typeof (value as { text?: unknown }).text === "string";
  }
  if (mode === "values") {
    const v = value as { values?: unknown; includeBlank?: unknown; negate?: unknown };
    return (
      Array.isArray(v.values) &&
      v.values.every((x) => typeof x === "string") &&
      typeof v.includeBlank === "boolean" &&
      typeof v.negate === "boolean"
    );
  }
  if (mode === "range") {
    const v = value as { min?: unknown; max?: unknown };
    return typeof v.min === "string" && typeof v.max === "string";
  }
  return false;
}

/**
 * Validate a decoded filter map.
 *
 * A URL is user-editable and arrives from strangers, so a malformed `f` must
 * degrade to "no filters" rather than throwing the grid into an error state or,
 * worse, filtering by a shape nothing understands.
 */
export function isColumnFilterMap(value: unknown): value is ColumnFilterMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(isColumnFilter);
}

export function parseSortParam(
  raw: string | null,
): { field: string | null; direction: SortDirection } {
  if (!raw) return { field: null, direction: "asc" };
  // Split on the LAST dot: a field name may legitimately contain dots.
  const at = raw.lastIndexOf(".");
  if (at <= 0) return { field: raw, direction: "asc" };
  const direction = raw.slice(at + 1);
  if (direction !== "asc" && direction !== "desc") {
    return { field: raw, direction: "asc" };
  }
  return { field: raw.slice(0, at), direction };
}

/** Drop filters that are not narrowing anything, so the URL carries only signal. */
export function activeFiltersOnly(filters: ColumnFilterMap): ColumnFilterMap {
  const out: ColumnFilterMap = {};
  for (const [field, filter] of Object.entries(filters)) {
    if (isActiveFilter(filter)) out[field] = filter;
  }
  return out;
}

export function parseTableViewParams(
  params: URLSearchParams,
  defaults: TableViewDefaults,
): TableViewState {
  const { field, direction } = parseSortParam(params.get("sort"));

  let filters: ColumnFilterMap = {};
  const rawFilters = params.get("f");
  if (rawFilters) {
    try {
      const parsed: unknown = JSON.parse(rawFilters);
      if (isColumnFilterMap(parsed)) filters = parsed;
    } catch {
      // A hand-mangled URL must not break the grid.
    }
  }

  const readPositiveInt = (key: string, fallback: number): number => {
    const raw = params.get(key);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    search: params.get("q") ?? "",
    sortField: field,
    sortDirection: direction,
    filters,
    page: readPositiveInt("p", 1),
    pageSize: readPositiveInt("ps", defaults.pageSize),
    hidden: parseFieldNameList(params.get("hide")),
    order: parseFieldNameList(params.get("ord")),
    layout: parseLayoutChoice(params.get("lay")),
    widths: parseColumnWidths(params.get("w")),
    density: parseRowDensityChoice(params.get("den")),
    freezeFirst: params.get("frz") === "1",
    wrap: params.get("wrap") === "1",
    summaries: parseColumnSummaries(params.get("agg")),
  };
}

/**
 * Comma-separated field names — compact enough that a view with a dozen columns
 * still produces a link a person can look at.
 *
 * Machine field names have no commas by construction; a value that somehow
 * contains one would corrupt the whole list, so such a list is REFUSED entirely
 * rather than silently reinterpreted as different columns.
 */
export function parseFieldNameList(raw: string | null): string[] {
  if (!raw) return [];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  // De-duplicate, preserving first position — a repeated name in `ord` would
  // otherwise render the same column twice.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * The patch to apply to the query string for a given view.
 *
 * `null` means "remove this key" — that is how a value returning to its default
 * disappears from the URL instead of lingering as `?p=1`.
 */
export function tableViewParamPatch(
  state: TableViewState,
  defaults: TableViewDefaults,
): Record<string, string | null> {
  const active = activeFiltersOnly(state.filters);
  const hasFilters = Object.keys(active).length > 0;

  return {
    q: state.search.trim() === "" ? null : state.search,
    sort: state.sortField
      ? `${state.sortField}.${state.sortDirection}`
      : null,
    f: hasFilters ? JSON.stringify(active) : null,
    p: state.page > 1 ? String(state.page) : null,
    ps: state.pageSize === defaults.pageSize ? null : String(state.pageSize),
    hide: state.hidden.length > 0 ? state.hidden.join(",") : null,
    ord: state.order.length > 0 ? state.order.join(",") : null,
    lay: state.layout === "default" ? null : state.layout,
    w: serializeColumnWidths(state.widths),
    den: state.density === "default" ? null : state.density,
    frz: state.freezeFirst ? "1" : null,
    wrap: state.wrap ? "1" : null,
    agg: serializeColumnSummaries(state.summaries),
  };
}

/**
 * The columns this view actually shows, in order.
 *
 * THE MERGE IS WHAT MAKES A SAVED VIEW SURVIVE A CHANGING TABLE:
 *   - a name in `order` the table no longer has is DROPPED (a deleted column
 *     must not leave a hole);
 *   - a column the table has that `order` never mentioned is APPENDED in the
 *     table's own order (a column added last week appears, rather than being
 *     invisible until someone edits the view);
 *   - `hidden` is applied last, so hiding never disturbs ordering.
 */
export function resolveViewColumns<T extends { field_name: string; field_order: number }>(
  fields: readonly T[],
  state: Pick<TableViewState, "hidden" | "order">,
): T[] {
  const byName = new Map(fields.map((f) => [f.field_name, f]));
  const tableOrder = [...fields].sort((a, b) => a.field_order - b.field_order);

  const ordered: T[] = [];
  const placed = new Set<string>();
  for (const name of state.order) {
    const field = byName.get(name);
    if (!field || placed.has(name)) continue;
    ordered.push(field);
    placed.add(name);
  }
  for (const field of tableOrder) {
    if (placed.has(field.field_name)) continue;
    ordered.push(field);
    placed.add(field.field_name);
  }

  const hidden = new Set(state.hidden);
  return ordered.filter((f) => !hidden.has(f.field_name));
}

/** Do two views describe the same thing? Used to avoid pointless history churn. */
export function sameTableView(a: TableViewState, b: TableViewState): boolean {
  return (
    a.search === b.search &&
    a.sortField === b.sortField &&
    a.sortDirection === b.sortDirection &&
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    a.hidden.join(",") === b.hidden.join(",") &&
    a.order.join(",") === b.order.join(",") &&
    a.layout === b.layout &&
    a.density === b.density &&
    a.freezeFirst === b.freezeFirst &&
    a.wrap === b.wrap &&
    serializeColumnSummaries(a.summaries) === serializeColumnSummaries(b.summaries) &&
    serializeColumnWidths(a.widths) === serializeColumnWidths(b.widths) &&
    JSON.stringify(activeFiltersOnly(a.filters)) ===
      JSON.stringify(activeFiltersOnly(b.filters))
  );
}

// ─── layout: mode, widths, density, freeze ──────────────────────────────────

/** A concrete layout mode (used for the ORGANIZATION default, which is never `default`). */
export function parseLayoutMode(raw: string | null): TableLayoutMode {
  return raw === "fit" || raw === "scroll" ? raw : "auto";
}

export function parseRowDensity(raw: string | null): TableRowDensity {
  return raw === "compact" || raw === "tall" ? raw : "normal";
}

/** A VIEW's layout: absent or unknown = `default` (the organization decides). */
export function parseLayoutChoice(raw: string | null | undefined): TableLayoutChoice {
  return raw === "auto" || raw === "fit" || raw === "scroll" ? raw : "default";
}

export function parseRowDensityChoice(raw: string | null | undefined): TableRowDensityChoice {
  return raw === "compact" || raw === "normal" || raw === "tall" ? raw : "default";
}

export function clampColumnWidth(px: number): number {
  return Math.min(MAX_COLUMN_WIDTH_PX, Math.max(MIN_COLUMN_WIDTH_PX, Math.round(px)));
}

/**
 * `w=field:220,other:96` — one entry per dragged column. A malformed or
 * out-of-range entry is dropped rather than letting a hand-edited URL make a
 * 4px or a 40 000px column.
 */
export function parseColumnWidths(raw: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const at = part.lastIndexOf(":");
    if (at <= 0) continue;
    const name = part.slice(0, at).trim();
    const px = Number(part.slice(at + 1));
    if (!name || !Number.isFinite(px)) continue;
    if (px < MIN_COLUMN_WIDTH_PX || px > MAX_COLUMN_WIDTH_PX) continue;
    out[name] = Math.round(px);
  }
  return out;
}

/** Stable (sorted by field name) so two equal maps serialize identically. */
export function serializeColumnWidths(widths: Record<string, number>): string | null {
  const entries = Object.entries(widths)
    .filter(([, px]) => Number.isFinite(px))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.length > 0
    ? entries.map(([name, px]) => `${name}:${Math.round(px)}`).join(",")
    : null;
}

export function isColumnWidthMap(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(
      (v) => typeof v === "number" && Number.isFinite(v),
    )
  );
}

/**
 * Resolve the effective layout for a view: the user's override when set, else
 * the platform default — share the width up to `fitMaxColumns` visible
 * columns, natural widths and a sideways scroll past that.
 */
export function resolveTableLayout(
  mode: TableLayoutMode,
  visibleColumnCount: number,
  fitMaxColumns: number,
): "fit" | "scroll" {
  if (mode !== "auto") return mode;
  return visibleColumnCount <= fitMaxColumns ? "fit" : "scroll";
}

/** The person's choice if they made one, else the organization's default. */
export function effectiveLayoutMode(
  choice: TableLayoutChoice,
  organizationDefault: TableLayoutMode,
): TableLayoutMode {
  return choice === "default" ? organizationDefault : choice;
}

export function effectiveRowDensity(
  choice: TableRowDensityChoice,
  organizationDefault: TableRowDensity,
): TableRowDensity {
  return choice === "default" ? organizationDefault : choice;
}
