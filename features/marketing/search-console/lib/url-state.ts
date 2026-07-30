/**
 * URL state for `/marketing/search-console` — every view (site, tab, range,
 * compare, filters) is a shareable link. Query params only; no persistence
 * (view STYLE lives in useListViewPrefs, query state deliberately does not).
 *
 *   ?site=<uuid>&tab=queries&range=90d&compare=prev
 *   &q=<query_eq>&qc=<query_contains>&qn=<query_neq>
 *   &pg=<page_eq>&pgc=<page_contains>
 *   &country=usa&device=MOBILE&appearance=<value>
 *   range=custom uses &from=YYYY-MM-DD&to=YYYY-MM-DD
 */

import type { ReadonlyURLSearchParams } from "next/navigation";
import type {
  GscCompareMode,
  GscDateRange,
  GscFilters,
  GscRangeKey,
  GscResolvedPeriods,
  GscTab,
} from "@/features/marketing/search-console/types";
import { GSC_RANGE_PRESETS, GSC_TABS } from "@/features/marketing/search-console/types";

/** GSC finalizes data ~2 days behind; the dashboard's "today" is lagged. */
export const GSC_DATA_LAG_DAYS = 2;

export interface SearchConsoleUrlState {
  siteId: string | null;
  tab: GscTab;
  range: GscRangeKey;
  customFrom: string | null;
  customTo: string | null;
  compare: GscCompareMode;
  filters: GscFilters;
}

const FILTER_PARAMS: Array<[keyof GscFilters, string]> = [
  ["query_eq", "q"],
  ["query_contains", "qc"],
  ["query_neq", "qn"],
  ["page_eq", "pg"],
  ["page_contains", "pgc"],
  ["country", "country"],
  ["device", "device"],
  ["search_appearance", "appearance"],
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSearchConsoleUrl(
  params: ReadonlyURLSearchParams | URLSearchParams,
): SearchConsoleUrlState {
  const tabParam = params.get("tab");
  const tab: GscTab = GSC_TABS.some((t) => t.key === tabParam)
    ? (tabParam as GscTab)
    : "overview";
  const rangeParam = params.get("range");
  const isPreset = GSC_RANGE_PRESETS.some((r) => r.key === rangeParam);
  const customFrom = params.get("from");
  const customTo = params.get("to");
  const hasCustom =
    rangeParam === "custom" &&
    !!customFrom &&
    !!customTo &&
    ISO_DATE.test(customFrom) &&
    ISO_DATE.test(customTo) &&
    customFrom <= customTo;
  const range: GscRangeKey = isPreset
    ? (rangeParam as GscRangeKey)
    : hasCustom
      ? "custom"
      : "90d";
  const compareParam = params.get("compare");
  const compare: GscCompareMode =
    compareParam === "prev" || compareParam === "yoy" ? compareParam : "none";
  const filters: GscFilters = {};
  for (const [key, param] of FILTER_PARAMS) {
    const value = params.get(param);
    if (value && value.trim() !== "") filters[key] = value;
  }
  return {
    siteId: params.get("site"),
    tab,
    range,
    customFrom: hasCustom ? customFrom : null,
    customTo: hasCustom ? customTo : null,
    compare,
    filters,
  };
}

export function buildSearchConsoleUrl(state: SearchConsoleUrlState): string {
  const params = new URLSearchParams();
  if (state.siteId) params.set("site", state.siteId);
  if (state.tab !== "overview") params.set("tab", state.tab);
  if (state.range !== "90d") params.set("range", state.range);
  if (state.range === "custom" && state.customFrom && state.customTo) {
    params.set("from", state.customFrom);
    params.set("to", state.customTo);
  }
  if (state.compare !== "none") params.set("compare", state.compare);
  for (const [key, param] of FILTER_PARAMS) {
    const value = state.filters[key];
    if (value && value.trim() !== "") params.set(param, value);
  }
  const qs = params.toString();
  return qs ? `/marketing/search-console?${qs}` : "/marketing/search-console";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function shiftYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return isoDate(d);
}

function rangeDayCount(range: GscDateRange): number {
  const start = new Date(`${range.start}T00:00:00Z`).getTime();
  const end = new Date(`${range.end}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Resolve the URL state into concrete date ranges. `prev` compares against
 * the immediately preceding window of equal length; `yoy` against the same
 * calendar window one year earlier.
 */
export function resolvePeriods(
  state: Pick<
    SearchConsoleUrlState,
    "range" | "customFrom" | "customTo" | "compare"
  >,
  now: Date = new Date(),
): GscResolvedPeriods {
  const end = isoDate(
    new Date(now.getTime() - GSC_DATA_LAG_DAYS * 86_400_000),
  );
  let current: GscDateRange;
  if (state.range === "custom" && state.customFrom && state.customTo) {
    current = { start: state.customFrom, end: state.customTo };
  } else {
    const preset =
      GSC_RANGE_PRESETS.find((r) => r.key === state.range) ??
      GSC_RANGE_PRESETS[1];
    current = { start: shiftDays(end, -(preset.days - 1)), end };
  }
  let compare: GscDateRange | null = null;
  if (state.compare === "prev") {
    const days = rangeDayCount(current);
    compare = {
      start: shiftDays(current.start, -days),
      end: shiftDays(current.start, -1),
    };
  } else if (state.compare === "yoy") {
    compare = {
      start: shiftYears(current.start, -1),
      end: shiftYears(current.end, -1),
    };
  }
  return { current, compare };
}
