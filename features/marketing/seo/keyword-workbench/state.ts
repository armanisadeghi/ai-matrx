/**
 * THE KEYWORD WORKBENCH — URL state.
 *
 * P26: "a table is the user's, not ours." Everything the user arranges —
 * which filters are on, which dimensions are columns, how it is sorted, which
 * page — lives in the URL, so:
 *
 *   • a saved view is literally this state, stored verbatim in
 *     `seo.keyword_saved_view.state` (nothing else has to understand it);
 *   • a link they paste to a colleague opens the table they were looking at;
 *   • reload never loses the arrangement.
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

/** Columns that are always present and are not dimensions. */
export const WORKBENCH_FIXED_COLUMNS = [
  "keyword",
  "traffic_class",
  "clicks",
  "impressions",
  "value_score",
  "value_band",
] as const;

/** Optional fixed columns the chooser can switch on. */
export const WORKBENCH_OPTIONAL_COLUMNS = [
  { id: "ctr", label: "CTR" },
  { id: "position", label: "Position" },
] as const;

export type WorkbenchOptionalColumnId =
  (typeof WORKBENCH_OPTIONAL_COLUMNS)[number]["id"];

const OPTIONAL_IDS = new Set<string>(
  WORKBENCH_OPTIONAL_COLUMNS.map((c) => c.id),
);

/**
 * A sort id can be a server metric OR a column the browser sorts (a dimension
 * column, Class, Score, Level). It stays a plain string so a saved view that
 * was sorted by "Buyer stage" restores sorted by "Buyer stage" — restricting
 * it to the RPC's five keys silently threw that away on reload.
 */
const SORT_ID = /^[a-z0-9_:.-]{1,64}$/i;

export interface WorkbenchState {
  filters: GscFilters;
  /** Dimension slugs shown as columns, in order (P26). */
  dimensions: string[];
  /** Optional metric columns switched on. */
  optional: WorkbenchOptionalColumnId[];
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

export const WORKBENCH_DEFAULT_PAGE_SIZE = 50;

export function defaultWorkbenchState(): WorkbenchState {
  return {
    filters: {},
    dimensions: [],
    optional: [],
    sort: "clicks",
    sortDir: "desc",
    page: 1,
    pageSize: WORKBENCH_DEFAULT_PAGE_SIZE,
    search: "",
    range: GSC_DEFAULT_RANGE,
    customFrom: null,
    customTo: null,
    compare: "none",
    viewId: null,
  };
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
}

export function parseWorkbenchState(
  params: ReadonlyURLSearchParams | URLSearchParams,
): WorkbenchState {
  const base = defaultWorkbenchState();
  const rangeParam = params.get("range");
  const isPreset = GSC_RANGE_PRESETS.some((r) => r.key === rangeParam);
  const from = params.get("from");
  const to = params.get("to");
  const hasCustom =
    rangeParam === "custom" &&
    !!from &&
    !!to &&
    ISO_DATE.test(from) &&
    ISO_DATE.test(to) &&
    from <= to;
  const sortParam = params.get("sort");
  const dirParam = params.get("dir");
  const pageParam = Number(params.get("p"));
  const sizeParam = Number(params.get("ps"));
  const compareParam = params.get("compare");
  return {
    ...base,
    filters: parseGscFilters(params),
    dimensions: parseList(params.get("cols")),
    optional: parseList(params.get("m")).filter((id): id is WorkbenchOptionalColumnId =>
      OPTIONAL_IDS.has(id),
    ),
    sort: sortParam && SORT_ID.test(sortParam) ? sortParam : base.sort,
    sortDir: dirParam === "asc" ? "asc" : "desc",
    page: Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1,
    pageSize:
      Number.isFinite(sizeParam) && sizeParam >= 10 && sizeParam <= 200
        ? Math.floor(sizeParam)
        : base.pageSize,
    search: params.get("kq") ?? "",
    range: isPreset ? (rangeParam as GscRangeKey) : hasCustom ? "custom" : base.range,
    customFrom: hasCustom ? from : null,
    customTo: hasCustom ? to : null,
    compare:
      compareParam === "prev" || compareParam === "yoy" ? compareParam : "none",
    viewId: params.get("sv"),
  };
}

/**
 * The query string for a state. `view=workbench` is always written so a
 * pasted link lands on this surface and not on the Performance sibling.
 */
export function workbenchSearchParams(state: WorkbenchState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("view", "workbench");
  applyGscFilters(params, state.filters);
  if (state.dimensions.length > 0) params.set("cols", state.dimensions.join(","));
  if (state.optional.length > 0) params.set("m", state.optional.join(","));
  if (state.sort !== "clicks") params.set("sort", state.sort);
  if (state.sortDir !== "desc") params.set("dir", state.sortDir);
  if (state.page > 1) params.set("p", String(state.page));
  if (state.pageSize !== WORKBENCH_DEFAULT_PAGE_SIZE) {
    params.set("ps", String(state.pageSize));
  }
  if (state.search.trim() !== "") params.set("kq", state.search.trim());
  if (state.range !== GSC_DEFAULT_RANGE) params.set("range", state.range);
  if (state.range === "custom" && state.customFrom && state.customTo) {
    params.set("from", state.customFrom);
    params.set("to", state.customTo);
  }
  if (state.compare !== "none") params.set("compare", state.compare);
  if (state.viewId) params.set("sv", state.viewId);
  return params;
}

/**
 * What a SAVED VIEW stores: the arrangement, never the position inside it.
 * Page number and the view id itself are deliberately dropped — reopening a
 * saved view on page 7 of a list you have not seen is not a feature.
 */
export function viewStateFor(state: WorkbenchState): Record<string, string> {
  const saved = workbenchSearchParams({ ...state, page: 1, viewId: null });
  saved.delete("view");
  return Object.fromEntries(saved.entries());
}

/** Rehydrate a saved view's stored state on top of the current one. */
export function stateFromViewState(
  stored: unknown,
  current: WorkbenchState,
): WorkbenchState {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return current;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof value === "string") params.set(key, value);
  }
  return parseWorkbenchState(params);
}

/**
 * Does the live state still match the saved view it came from? Drives the
 * "unsaved changes" affordance on the tab — a user who tweaks a view must be
 * able to see that, and to keep it.
 */
export function viewStateMatches(
  state: WorkbenchState,
  stored: unknown,
): boolean {
  const a = new URLSearchParams(viewStateFor(state));
  a.sort();
  const b = new URLSearchParams(
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? Object.fromEntries(
          Object.entries(stored as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string",
          ) as [string, string][],
        )
      : {},
  );
  b.sort();
  return a.toString() === b.toString();
}
