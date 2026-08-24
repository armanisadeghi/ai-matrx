/**
 * THE KEYWORD TABLE — URL state, shared by every surface that lists keywords.
 *
 * P25 — ONE TABLE (Arman, 2026-08-24): "all they had to do is just use the
 * canonical table… the core data doesn't change, the things you can sort and
 * filter by do not change. Now we can add and remove columns… they all need to
 * be one single table at the core. One table, one data access system, but then
 * you're basically just saving configurations for each page, and then the user
 * gets to create their own configurations."
 *
 * This module is the "configuration" half of that sentence. A surface declares
 * which columns it OPENS on; the user then adds/removes columns, sorts,
 * filters and pages — and every one of those decisions lives here, in the URL,
 * so:
 *
 *   • a saved view is literally this state, stored verbatim in
 *     `seo.keyword_saved_view.state` (nothing else has to understand it);
 *   • a link pasted to a colleague opens the table they were looking at;
 *   • reload never loses the arrangement;
 *   • Back is one-step undo (P24).
 *
 * Two keyword tables can share one route (the topic tree shows the proposals
 * queue above the unplaced queue), so every parameter can carry a per-surface
 * `prefix`. The Keyword Workbench uses the empty prefix, which keeps its
 * parameter names — and therefore every saved view already stored — byte
 * identical to what it wrote before this module existed.
 *
 * The filter half deliberately reuses the Search Console dialect
 * (`parseGscFilters` / `applyGscFilters`) — `qc=`, `st=`, `cmin=` mean exactly
 * what they mean on the dashboard.
 */

import type { ReadonlyURLSearchParams } from "next/navigation";

import {
  applyGscFilters,
  parseGscFilters,
} from "@/features/marketing/search-console/lib/url-state";
import {
  GSC_DEFAULT_RANGE,
  GSC_RANGE_PRESETS,
  type GscCompareMode,
  type GscFilters,
  type GscRangeKey,
} from "@/features/marketing/search-console/types";

/**
 * THE CORE COLUMN SET — the bare-bones keyword table, identical everywhere.
 * A surface chooses which of these it OPENS on; it never chooses whether they
 * sort or filter, and it never invents a column that is not here (dimension
 * columns come from the site's own catalog, at runtime).
 */
export const KEYWORD_CORE_COLUMNS = [
  { id: "key", label: "Keyword" },
  { id: "topic", label: "Service" },
  { id: "traffic_class", label: "Class" },
  { id: "clicks", label: "Clicks" },
  { id: "impressions", label: "Impressions" },
  { id: "ctr", label: "CTR" },
  { id: "position", label: "Position" },
  { id: "value_score", label: "Score" },
  { id: "value_band", label: "Level" },
] as const;

export type KeywordCoreColumnId = (typeof KEYWORD_CORE_COLUMNS)[number]["id"];

const CORE_IDS = new Set<string>(KEYWORD_CORE_COLUMNS.map((c) => c.id));

/**
 * The Keyword Workbench's opening set. Kept EXACTLY as it was before this
 * module existed: CTR and Position stay opt-in because two more numeric
 * columns push the meaning columns off a laptop screen.
 */
export const WORKBENCH_DEFAULT_COLUMNS: KeywordCoreColumnId[] = [
  "key",
  "topic",
  "traffic_class",
  "clicks",
  "impressions",
  "value_score",
  "value_band",
];

/**
 * The keyword itself is never removable — a row you cannot read is a row you
 * cannot judge, and a keyword table without the keyword is not a keyword table.
 */
export const KEYWORD_REQUIRED_COLUMN: KeywordCoreColumnId = "key";

/**
 * A sort id can be a server metric OR a column the browser sorts (a dimension
 * column, Class, Score, Level). It stays a plain string so a saved view that
 * was sorted by "Buyer stage" restores sorted by "Buyer stage" — restricting
 * it to the RPC's keys silently threw that away on reload.
 */
const SORT_ID = /^[a-z0-9_:.-]{1,64}$/i;

export interface KeywordTableState {
  filters: GscFilters;
  /** Dimension slugs shown as columns, in order (P26). */
  dimensions: string[];
  /**
   * Core columns the user ADDED on top of this surface's opening set, and core
   * columns they REMOVED from it. Storing the deltas rather than the resolved
   * list means a surface can change what it opens on without rewriting every
   * saved view a user already owns.
   */
  added: KeywordCoreColumnId[];
  removed: KeywordCoreColumnId[];
  sort: string;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
  /** The table's own text search (matches the keyword itself). */
  search: string;
  range: GscRangeKey;
  customFrom: string | null;
  customTo: string | null;
  compare: GscCompareMode;
  /** The saved view this arrangement came from, when it came from one. */
  viewId: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const KEYWORD_TABLE_DEFAULT_PAGE_SIZE = 50;

export function defaultKeywordTableState(): KeywordTableState {
  return {
    filters: {},
    dimensions: [],
    added: [],
    removed: [],
    sort: "clicks",
    sortDir: "desc",
    page: 1,
    pageSize: KEYWORD_TABLE_DEFAULT_PAGE_SIZE,
    search: "",
    range: GSC_DEFAULT_RANGE,
    customFrom: null,
    customTo: null,
    compare: "none",
    viewId: null,
  };
}

/**
 * Resolve what a surface's opening set plus the user's deltas actually shows.
 * The keyword column can never be dropped.
 */
export function visibleCoreColumns(
  surfaceDefaults: readonly KeywordCoreColumnId[],
  state: Pick<KeywordTableState, "added" | "removed">,
): KeywordCoreColumnId[] {
  const removed = new Set<string>(
    state.removed.filter((id) => id !== KEYWORD_REQUIRED_COLUMN),
  );
  const shown = surfaceDefaults.filter((id) => !removed.has(id));
  for (const id of state.added) {
    if (!shown.includes(id) && !removed.has(id)) shown.push(id);
  }
  if (!shown.includes(KEYWORD_REQUIRED_COLUMN)) {
    shown.unshift(KEYWORD_REQUIRED_COLUMN);
  }
  // Render in the canonical order, never in click order: a table whose column
  // positions depend on the sequence a person ticked boxes is a table they
  // have to re-read every time.
  return KEYWORD_CORE_COLUMNS.map((c) => c.id).filter((id) =>
    shown.includes(id),
  );
}

/** Toggle one core column on/off against a surface's opening set. */
export function toggleCoreColumn(
  surfaceDefaults: readonly KeywordCoreColumnId[],
  state: KeywordTableState,
  id: KeywordCoreColumnId,
): Pick<KeywordTableState, "added" | "removed"> {
  if (id === KEYWORD_REQUIRED_COLUMN) {
    return { added: state.added, removed: state.removed };
  }
  const visible = visibleCoreColumns(surfaceDefaults, state);
  const turningOff = visible.includes(id);
  const added = state.added.filter((c) => c !== id);
  const removed = state.removed.filter((c) => c !== id);
  if (turningOff) removed.push(id);
  else added.push(id);
  return { added, removed };
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
}

function coreList(raw: string | null): KeywordCoreColumnId[] {
  return parseList(raw).filter((id): id is KeywordCoreColumnId =>
    CORE_IDS.has(id),
  );
}

/**
 * Read one surface's slice of the query string. A prefixed surface's params
 * are `<prefix>_<name>`; the GSC filter dialect is delegated to unchanged by
 * handing it a de-prefixed copy.
 */
function slice(
  params: ReadonlyURLSearchParams | URLSearchParams,
  prefix: string,
): URLSearchParams {
  if (!prefix) return new URLSearchParams(params.toString());
  const head = `${prefix}_`;
  const out = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key.startsWith(head)) out.set(key.slice(head.length), value);
  }
  return out;
}

export interface KeywordTableStateCodec {
  /** Per-surface URL parameter prefix. `""` for the Keyword Workbench. */
  prefix?: string;
}

export function parseKeywordTableState(
  params: ReadonlyURLSearchParams | URLSearchParams,
  codec: KeywordTableStateCodec = {},
): KeywordTableState {
  const own = slice(params, codec.prefix ?? "");
  const base = defaultKeywordTableState();
  const rangeParam = own.get("range");
  const isPreset = GSC_RANGE_PRESETS.some((r) => r.key === rangeParam);
  const from = own.get("from");
  const to = own.get("to");
  const hasCustom =
    rangeParam === "custom" &&
    !!from &&
    !!to &&
    ISO_DATE.test(from) &&
    ISO_DATE.test(to) &&
    from <= to;
  const sortParam = own.get("sort");
  const dirParam = own.get("dir");
  const pageParam = Number(own.get("p"));
  const sizeParam = Number(own.get("ps"));
  const compareParam = own.get("compare");
  return {
    ...base,
    filters: parseGscFilters(own),
    dimensions: parseList(own.get("cols")),
    // `m` is the pre-P25 name for "extra metric columns" (CTR / Position).
    // Reading it as `added` is what keeps every saved view written before this
    // module existed opening on the arrangement it was saved with.
    added: [...new Set([...coreList(own.get("m")), ...coreList(own.get("addc"))])],
    removed: coreList(own.get("remc")),
    sort: sortParam && SORT_ID.test(sortParam) ? sortParam : base.sort,
    sortDir: dirParam === "asc" ? "asc" : "desc",
    page: Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1,
    pageSize:
      Number.isFinite(sizeParam) && sizeParam >= 10 && sizeParam <= 200
        ? Math.floor(sizeParam)
        : base.pageSize,
    search: own.get("kq") ?? "",
    range: isPreset ? (rangeParam as GscRangeKey) : hasCustom ? "custom" : base.range,
    customFrom: hasCustom ? from : null,
    customTo: hasCustom ? to : null,
    compare:
      compareParam === "prev" || compareParam === "yoy" ? compareParam : "none",
    viewId: own.get("sv"),
  };
}

/** This surface's own parameters for a state, ready to be merged into a URL. */
export function keywordTableSearchParams(
  state: KeywordTableState,
  codec: KeywordTableStateCodec = {},
): URLSearchParams {
  const own = new URLSearchParams();
  applyGscFilters(own, state.filters);
  if (state.dimensions.length > 0) own.set("cols", state.dimensions.join(","));
  if (state.added.length > 0) own.set("addc", state.added.join(","));
  if (state.removed.length > 0) own.set("remc", state.removed.join(","));
  if (state.sort !== "clicks") own.set("sort", state.sort);
  if (state.sortDir !== "desc") own.set("dir", state.sortDir);
  if (state.page > 1) own.set("p", String(state.page));
  if (state.pageSize !== KEYWORD_TABLE_DEFAULT_PAGE_SIZE) {
    own.set("ps", String(state.pageSize));
  }
  if (state.search.trim() !== "") own.set("kq", state.search.trim());
  if (state.range !== GSC_DEFAULT_RANGE) own.set("range", state.range);
  if (state.range === "custom" && state.customFrom && state.customTo) {
    own.set("from", state.customFrom);
    own.set("to", state.customTo);
  }
  if (state.compare !== "none") own.set("compare", state.compare);
  if (state.viewId) own.set("sv", state.viewId);

  const prefix = codec.prefix ?? "";
  if (!prefix) return own;
  const out = new URLSearchParams();
  for (const [key, value] of own.entries()) out.set(`${prefix}_${key}`, value);
  return out;
}

/**
 * Merge one surface's state into the page's existing query string, leaving
 * every other surface's parameters (and the page's own) untouched. Two keyword
 * tables on one route each get one-step Back-undo this way.
 */
export function mergeKeywordTableParams(
  current: ReadonlyURLSearchParams | URLSearchParams,
  state: KeywordTableState,
  codec: KeywordTableStateCodec = {},
): URLSearchParams {
  const prefix = codec.prefix ?? "";
  const next = new URLSearchParams(current.toString());
  // Drop everything this surface owns, then write what it owns NOW — a filter
  // the person just cleared has to actually leave the URL, or the next parse
  // paints it straight back.
  if (prefix) {
    const head = `${prefix}_`;
    for (const key of [...next.keys()]) {
      if (key.startsWith(head)) next.delete(key);
    }
  } else {
    // `applyGscFilters` deletes every filter parameter it knows when handed an
    // empty bag — one source of truth for the dialect's names, not a copy.
    applyGscFilters(next, {});
    for (const key of NON_FILTER_PARAMS) next.delete(key);
  }
  for (const [key, value] of keywordTableSearchParams(state, codec).entries()) {
    next.set(key, value);
  }
  return next;
}

/** This module's own (non-filter) parameter names, for the merge above. */
const NON_FILTER_PARAMS = [
  "cols",
  "addc",
  "remc",
  // The pre-P25 name for the extra-metric columns; cleared so a stale `m=`
  // cannot outlive the arrangement that replaced it.
  "m",
  "sort",
  "dir",
  "p",
  "ps",
  "kq",
  "range",
  "from",
  "to",
  "compare",
  "sv",
];

/**
 * What a SAVED VIEW stores: the arrangement, never the position inside it.
 * Page number and the view id itself are deliberately dropped — reopening a
 * saved view on page 7 of a list you have not seen is not a feature. Stored
 * WITHOUT the surface prefix, so a view saved on one surface is readable by
 * any other.
 */
export function viewStateFor(state: KeywordTableState): Record<string, string> {
  const saved = keywordTableSearchParams({ ...state, page: 1, viewId: null });
  return Object.fromEntries(saved.entries());
}

/** Rehydrate a saved view's stored state on top of the current one. */
export function stateFromViewState(
  stored: unknown,
  current: KeywordTableState,
): KeywordTableState {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return current;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof value === "string" && key !== "view") params.set(key, value);
  }
  return parseKeywordTableState(params);
}

/**
 * Does the live state still match the saved view it came from? Drives the
 * "unsaved changes" affordance on the tab — a user who tweaks a view must be
 * able to see that, and to keep it.
 */
export function viewStateMatches(
  state: KeywordTableState,
  stored: unknown,
): boolean {
  const a = new URLSearchParams(viewStateFor(state));
  a.sort();
  const b = new URLSearchParams(
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? Object.fromEntries(
          Object.entries(stored as Record<string, unknown>).filter(
            ([key, v]) => typeof v === "string" && key !== "view",
          ) as [string, string][],
        )
      : {},
  );
  b.sort();
  return a.toString() === b.toString();
}
