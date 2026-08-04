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
import {
  GSC_DEFAULT_RANGE,
  GSC_RANGE_PRESETS,
  GSC_TABS,
} from "@/features/marketing/search-console/types";

/**
 * GSC finalizes data ~2 days behind; the dashboard's "today" is lagged.
 * Applied in UTC deliberately (GSC's own dates are property-timezone days;
 * a stable UTC boundary beats per-viewer local windows) — and in practice
 * `resolvePeriods`' `dataEnd` clamp pins the window to real data anyway.
 */
export const GSC_DATA_LAG_DAYS = 2;

export interface SearchConsoleUrlState {
  siteId: string | null;
  tab: GscTab;
  range: GscRangeKey;
  customFrom: string | null;
  customTo: string | null;
  compare: GscCompareMode;
  filters: GscFilters;
  /** Selected dig rule (digs tab only; template or user rule uuid). */
  ruleId: string | null;
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
      : GSC_DEFAULT_RANGE;
  const compareParam = params.get("compare");
  const compare: GscCompareMode =
    compareParam === "prev" || compareParam === "yoy" ? compareParam : "none";
  const filters: GscFilters = {};
  for (const [key, param] of FILTER_PARAMS) {
    const value = params.get(param);
    if (value && value.trim() !== "") filters[key] = value;
  }
  const rule = params.get("rule");
  return {
    siteId: params.get("site"),
    tab,
    range,
    customFrom: hasCustom ? customFrom : null,
    customTo: hasCustom ? customTo : null,
    compare,
    filters,
    ruleId: tab === "digs" && rule && rule.trim() !== "" ? rule : null,
  };
}

export function buildSearchConsoleUrl(state: SearchConsoleUrlState): string {
  const params = new URLSearchParams();
  if (state.siteId) params.set("site", state.siteId);
  if (state.tab !== "overview") params.set("tab", state.tab);
  if (state.range !== GSC_DEFAULT_RANGE) params.set("range", state.range);
  if (state.range === "custom" && state.customFrom && state.customTo) {
    params.set("from", state.customFrom);
    params.set("to", state.customTo);
  }
  if (state.compare !== "none") params.set("compare", state.compare);
  if (state.tab === "digs" && state.ruleId) params.set("rule", state.ruleId);
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

function rangeDayCount(range: GscDateRange): number {
  const start = new Date(`${range.start}T00:00:00Z`).getTime();
  const end = new Date(`${range.end}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Resolve the URL state into concrete date ranges.
 *
 * `dataEnd` — the freshest day the site actually holds (from
 * `gsc_perf_freshness`) — CLAMPS preset windows, exactly like GSC's own UI:
 * when ingestion lags, the window ends at real data instead of comparing a
 * part-empty current period against a full compare period. Custom ranges are
 * honored verbatim.
 *
 * `prev` compares against the immediately preceding window of equal length;
 * `yoy` shifts exactly 364 days (52 weeks) — always equal-length, weekday-
 * aligned, and immune to the Feb-29 rollover that a calendar-year shift
 * silently mangles.
 */
export function resolvePeriods(
  state: Pick<
    SearchConsoleUrlState,
    "range" | "customFrom" | "customTo" | "compare"
  >,
  now: Date = new Date(),
  dataEnd: string | null = null,
): GscResolvedPeriods {
  const wallEnd = isoDate(
    new Date(now.getTime() - GSC_DATA_LAG_DAYS * 86_400_000),
  );
  const end =
    dataEnd && ISO_DATE.test(dataEnd) && dataEnd < wallEnd ? dataEnd : wallEnd;
  let current: GscDateRange;
  if (state.range === "custom" && state.customFrom && state.customTo) {
    current = { start: state.customFrom, end: state.customTo };
  } else {
    // Look the fallback up BY KEY — a positional index silently retargets
    // whenever a preset is added at the front.
    const preset =
      GSC_RANGE_PRESETS.find((r) => r.key === state.range) ??
      GSC_RANGE_PRESETS.find((r) => r.key === GSC_DEFAULT_RANGE);
    const days = preset?.days ?? 28;
    current = { start: shiftDays(end, -(days - 1)), end };
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
      start: shiftDays(current.start, -364),
      end: shiftDays(current.end, -364),
    };
  }
  return { current, compare };
}

/**
 * Force a previous-period compare onto resolved periods (equal-length window
 * immediately before the current one) — used by Dig Here when a rule needs
 * compare metrics but the dashboard is set to "no compare". No-op when a
 * compare is already active.
 */
export function withPrevCompare(periods: GscResolvedPeriods): GscResolvedPeriods {
  if (periods.compare) return periods;
  const days = rangeDayCount(periods.current);
  return {
    current: periods.current,
    compare: {
      start: shiftDays(periods.current.start, -days),
      end: shiftDays(periods.current.start, -1),
    },
  };
}

/** The filter keys each tab's dimension group can serve (RPC profile rule). */
const QUERY_PAGE_FILTER_KEYS: readonly (keyof GscFilters)[] = [
  "query_contains",
  "query_eq",
  "query_neq",
  "page_contains",
  "page_eq",
];
const COUNTRY_DEVICE_FILTER_KEYS: readonly (keyof GscFilters)[] = [
  "country",
  "device",
];

export function allowedFilterKeysForTab(
  tab: GscTab,
): readonly (keyof GscFilters)[] {
  switch (tab) {
    case "overview":
      // Overview renders query- AND page-dimension breakdown tables, so its
      // filter group is the query/page group — a country/device/appearance
      // filter would raise in those tables even though the summary/chart
      // alone could serve it. Country/device analysis lives on its own tabs.
      return QUERY_PAGE_FILTER_KEYS;
    case "queries":
    case "pages":
      return QUERY_PAGE_FILTER_KEYS;
    case "countries":
    case "devices":
      return COUNTRY_DEVICE_FILTER_KEYS;
    case "appearance":
      return ["search_appearance"];
    case "digs":
    case "watchlist":
    case "new-pages":
      // These tabs don't consume the shared FilterBar — dig rules carry
      // their own base filters; watch/new-pages read fixed entity sets.
      // Returning [] (never undefined) keeps pruneFiltersForTab total.
      return [];
  }
}

/**
 * Reduce a filter bag to ONE dimension group (query/page > country/device >
 * appearance). The UI never builds a cross-group mix, but a hand-edited URL
 * can — and the RPCs raise on it. Sanitizing here keeps every reachable
 * state renderable.
 */
export function sanitizeFilterGroups(filters: GscFilters): GscFilters {
  const present = (keys: readonly (keyof GscFilters)[]) =>
    keys.some((k) => {
      const value = filters[k];
      return typeof value === "string" && value.trim() !== "";
    });
  const keep: readonly (keyof GscFilters)[] = present(QUERY_PAGE_FILTER_KEYS)
    ? QUERY_PAGE_FILTER_KEYS
    : present(COUNTRY_DEVICE_FILTER_KEYS)
      ? COUNTRY_DEVICE_FILTER_KEYS
      : ["search_appearance"];
  const next: GscFilters = {};
  for (const key of keep) {
    const value = filters[key];
    if (typeof value === "string" && value.trim() !== "") next[key] = value;
  }
  return next;
}

/**
 * Drop filters the target tab's dimension cannot serve — switching from a
 * country-filtered Countries tab to Queries must shed the country filter
 * instead of hard-raising `gsc_filter_combination_unsupported`. Also reduces
 * hostile URLs to a single filter group.
 */
export function pruneFiltersForTab(tab: GscTab, filters: GscFilters): GscFilters {
  const allowed = new Set<string>(allowedFilterKeysForTab(tab));
  const next: GscFilters = {};
  for (const [key, value] of Object.entries(sanitizeFilterGroups(filters))) {
    if (allowed.has(key) && typeof value === "string" && value.trim() !== "") {
      next[key as keyof GscFilters] = value;
    }
  }
  return next;
}
