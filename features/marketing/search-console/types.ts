/**
 * Search Console dashboard — typed contracts over the `seo.gsc_perf_*` RPCs.
 *
 * The RPC filter/period contract is THE contract for every consumer of the
 * canonical GSC fact table (`seo.search_performance_daily`), including the
 * future "dig here" algorithm layer — extend here, never fork.
 */

import type { Database } from "@/types/database.types";

type SeoFunctions = Database["seo"]["Functions"];

export type GscSummaryRow = SeoFunctions["gsc_perf_summary"]["Returns"][number];
export type GscTimeseriesRow =
  SeoFunctions["gsc_perf_timeseries"]["Returns"][number];
export type GscBreakdownRow =
  SeoFunctions["gsc_perf_breakdown"]["Returns"][number];
export type GscFreshnessRow =
  SeoFunctions["gsc_perf_freshness"]["Returns"][number];
export type GscDigResultRow = SeoFunctions["gsc_perf_dig"]["Returns"][number];
export type GscWatchRow = SeoFunctions["gsc_perf_watch"]["Returns"][number];
export type GscPageFirstDatesRow =
  SeoFunctions["gsc_perf_page_first_dates"]["Returns"][number];
export type GscIngestionHealthRow =
  SeoFunctions["gsc_ingestion_health"]["Returns"][number];
export type GscCtrGapRow = SeoFunctions["gsc_perf_ctr_gap"]["Returns"][number];
export type GscCannibalizationRow =
  SeoFunctions["gsc_perf_cannibalization"]["Returns"][number];
export type GscTrendRow = SeoFunctions["gsc_perf_trend"]["Returns"][number];
export type GscDigRuleRow =
  Database["seo"]["Tables"]["gsc_dig_rule"]["Row"];

export type GscDimension =
  | "query"
  | "page"
  | "country"
  | "device"
  | "search_appearance";

export const GSC_DIMENSIONS: readonly GscDimension[] = [
  "query",
  "page",
  "country",
  "device",
  "search_appearance",
];

/**
 * The RPC filter contract (`p_filters`). Blank/missing keys are ignored
 * server-side. Filter groups may not cross dimension profiles:
 * (query/page) | (country/device) | (search_appearance) — the RPC raises
 * `gsc_filter_combination_unsupported` on a cross-group mix, and the UI
 * never builds one.
 */
export interface GscFilters {
  query_contains?: string;
  query_eq?: string;
  query_neq?: string;
  page_contains?: string;
  /** A canonical `web.page` uuid OR a page URL. */
  page_eq?: string;
  country?: string;
  device?: string;
  search_appearance?: string;
}

export type GscFilterKey = keyof GscFilters;

export const GSC_FILTER_KEYS: readonly GscFilterKey[] = [
  "query_contains",
  "query_eq",
  "query_neq",
  "page_contains",
  "page_eq",
  "country",
  "device",
  "search_appearance",
];

export type GscRangeKey =
  | "1d"
  | "7d"
  | "14d"
  | "28d"
  | "90d"
  | "6m"
  | "12m"
  | "16m"
  | "custom";

export const GSC_RANGE_PRESETS: readonly {
  key: Exclude<GscRangeKey, "custom">;
  label: string;
  days: number;
}[] = [
  { key: "1d", label: "1 day", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "14d", label: "14 days", days: 14 },
  { key: "28d", label: "28 days", days: 28 },
  { key: "90d", label: "3 months", days: 90 },
  { key: "6m", label: "6 months", days: 182 },
  { key: "12m", label: "12 months", days: 365 },
  { key: "16m", label: "16 months", days: 488 },
];

/**
 * THE default range — named, never positional. `resolvePeriods` used to fall
 * back to `GSC_RANGE_PRESETS[1]`, which silently retargets the moment a
 * preset is added at the front (exactly what adding 1d/7d/14d did). Parse
 * fallback, URL-omission, and resolve fallback all read this one constant.
 */
export const GSC_DEFAULT_RANGE: Exclude<GscRangeKey, "custom"> = "28d";

export type GscCompareMode = "none" | "prev" | "yoy";

export interface GscDateRange {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
}

export interface GscResolvedPeriods {
  current: GscDateRange;
  compare: GscDateRange | null;
}

/** The four GSC metrics with their canonical (GSC-parity) display colors. */
export type GscMetric = "clicks" | "impressions" | "ctr" | "position";

export const GSC_METRICS: readonly {
  key: GscMetric;
  label: string;
  /** Chart line / tile accent. GSC-parity hues, expressed as fixed colors. */
  color: string;
}[] = [
  { key: "clicks", label: "Total clicks", color: "#4285f4" },
  { key: "impressions", label: "Total impressions", color: "#5e35b1" },
  { key: "ctr", label: "Average CTR", color: "#00897b" },
  { key: "position", label: "Average position", color: "#e8710a" },
];

/** Tabs backed directly by a `gsc_perf_breakdown` dimension. */
export type GscDimensionTab =
  | "queries"
  | "pages"
  | "countries"
  | "devices"
  | "appearance";

export type GscTab =
  | "overview"
  | GscDimensionTab
  | "digs"
  | "insights"
  | "watchlist"
  | "new-pages";

export const GSC_TABS: readonly { key: GscTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "queries", label: "Queries" },
  { key: "pages", label: "Pages" },
  { key: "countries", label: "Countries" },
  { key: "devices", label: "Devices" },
  { key: "appearance", label: "Appearance" },
  { key: "digs", label: "Dig Here" },
  { key: "insights", label: "Insights" },
  { key: "watchlist", label: "Watchlist" },
  { key: "new-pages", label: "New Pages" },
];

/**
 * Insight algorithm views (insights tab) — each backed by its own
 * `seo.gsc_perf_*` algorithm RPC. `decay`/`growth` share `gsc_perf_trend`
 * with opposite `p_direction`.
 */
export type GscInsightKind = "ctr-gap" | "cannibalization" | "decay" | "growth";

export const GSC_INSIGHTS: readonly {
  key: GscInsightKind;
  label: string;
  description: string;
}[] = [
  {
    key: "ctr-gap",
    label: "CTR gaps",
    description:
      "Rankings whose CTR sits below this site's own curve for that position — estimated missed clicks from titles/snippets that underperform.",
  },
  {
    key: "cannibalization",
    label: "Cannibalization",
    description:
      "Queries where two or more pages split the impressions — competing with yourself dilutes rankings and clicks.",
  },
  {
    key: "decay",
    label: "Declining",
    description:
      "Sustained decliners: second half of the period vs the first, with a weekly trend slope. Catch decay before it flatlines.",
  },
  {
    key: "growth",
    label: "Rising",
    description:
      "Sustained risers: what is genuinely taking off across the period, beyond one lucky day.",
  },
];

export const TAB_DIMENSION: Record<GscDimensionTab, GscDimension> = {
  queries: "query",
  pages: "page",
  countries: "country",
  devices: "device",
  appearance: "search_appearance",
};

export function isDimensionTab(tab: GscTab): tab is GscDimensionTab {
  return tab in TAB_DIMENSION;
}

export type GscSortKey =
  | "clicks"
  | "impressions"
  | "ctr"
  | "position"
  | "key"
  | "delta_clicks";

/**
 * Dig Here rule vocabulary — mirrored EXACTLY by the server whitelist inside
 * `seo.gsc_perf_dig` (gsc_dig_metric_value). A metric prefixed `cmp_`/`delta_`
 * requires an active compare period; the *_pct metrics are percent change
 * ((cur - prev) / prev * 100, NULL when prev = 0).
 */
export type GscDigMetric =
  | "clicks"
  | "impressions"
  | "ctr"
  | "position"
  | "cmp_clicks"
  | "cmp_impressions"
  | "cmp_ctr"
  | "cmp_position"
  | "delta_clicks"
  | "delta_impressions"
  | "delta_ctr"
  | "delta_position"
  | "delta_clicks_pct"
  | "delta_impressions_pct";

export const GSC_DIG_METRICS: readonly {
  key: GscDigMetric;
  label: string;
  requiresCompare: boolean;
}[] = [
  { key: "clicks", label: "Clicks", requiresCompare: false },
  { key: "impressions", label: "Impressions", requiresCompare: false },
  { key: "ctr", label: "CTR", requiresCompare: false },
  { key: "position", label: "Position", requiresCompare: false },
  { key: "cmp_clicks", label: "Prev clicks", requiresCompare: true },
  { key: "cmp_impressions", label: "Prev impressions", requiresCompare: true },
  { key: "cmp_ctr", label: "Prev CTR", requiresCompare: true },
  { key: "cmp_position", label: "Prev position", requiresCompare: true },
  { key: "delta_clicks", label: "Δ clicks", requiresCompare: true },
  { key: "delta_impressions", label: "Δ impressions", requiresCompare: true },
  { key: "delta_ctr", label: "Δ CTR", requiresCompare: true },
  { key: "delta_position", label: "Δ position", requiresCompare: true },
  { key: "delta_clicks_pct", label: "Δ clicks %", requiresCompare: true },
  {
    key: "delta_impressions_pct",
    label: "Δ impressions %",
    requiresCompare: true,
  },
];

export type GscDigOp = "gt" | "gte" | "lt" | "lte";

export const GSC_DIG_OPS: readonly { key: GscDigOp; label: string }[] = [
  { key: "gt", label: ">" },
  { key: "gte", label: "≥" },
  { key: "lt", label: "<" },
  { key: "lte", label: "≤" },
];

/** One AND-ed condition of a dig rule. */
export interface GscDigCondition {
  metric: GscDigMetric;
  op: GscDigOp;
  value: number;
}

export interface GscBreakdownQuery {
  dimension: GscDimension;
  search: string;
  sort: GscSortKey;
  sortDir: "asc" | "desc";
  page: number; // 1-based
  pageSize: number;
}

/** Format a CTR fraction (0..1) as a percent string. */
export function formatCtr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(value * 100 >= 10 ? 1 : 2)}%`;
}

export function formatPosition(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(1);
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString();
}

/** ISO-3166 alpha-3 (GSC's country coding, lowercase) → display name. */
export function countryLabel(code: string): string {
  const upper = code.toUpperCase();
  try {
    const alpha2 = ALPHA3_TO_ALPHA2[upper];
    if (alpha2) {
      const name = new Intl.DisplayNames(["en"], { type: "region" }).of(alpha2);
      if (name && name !== alpha2) return name;
    }
  } catch {
    // fall through to the raw code
  }
  return upper;
}

/**
 * GSC emits ISO-3166-1 alpha-3; Intl.DisplayNames wants alpha-2. The common
 * search-traffic countries; unknown codes render as their raw alpha-3.
 */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  USA: "US", GBR: "GB", CAN: "CA", AUS: "AU", IND: "IN", DEU: "DE",
  FRA: "FR", ESP: "ES", ITA: "IT", NLD: "NL", BRA: "BR", MEX: "MX",
  JPN: "JP", CHN: "CN", KOR: "KR", RUS: "RU", IDN: "ID", PHL: "PH",
  PAK: "PK", NGA: "NG", EGY: "EG", ZAF: "ZA", TUR: "TR", POL: "PL",
  SWE: "SE", NOR: "NO", DNK: "DK", FIN: "FI", IRL: "IE", NZL: "NZ",
  SGP: "SG", MYS: "MY", THA: "TH", VNM: "VN", ARE: "AE", SAU: "SA",
  ISR: "IL", CHE: "CH", AUT: "AT", BEL: "BE", PRT: "PT", GRC: "GR",
  CZE: "CZ", ROU: "RO", HUN: "HU", UKR: "UA", ARG: "AR", COL: "CO",
  CHL: "CL", PER: "PE", VEN: "VE", BGD: "BD", LKA: "LK", NPL: "NP",
  KEN: "KE", GHA: "GH", MAR: "MA", DZA: "DZ", TUN: "TN", IRQ: "IQ",
  IRN: "IR", HKG: "HK", TWN: "TW", MAC: "MO", HRV: "HR", SRB: "RS",
  BGR: "BG", SVK: "SK", SVN: "SI", LTU: "LT", LVA: "LV", EST: "EE",
  ISL: "IS", LUX: "LU", MLT: "MT", CYP: "CY", JAM: "JM", TTO: "TT",
  DOM: "DO", CRI: "CR", PAN: "PA", GTM: "GT", ECU: "EC", BOL: "BO",
  URY: "UY", PRY: "PY", KAZ: "KZ", UZB: "UZ", AZE: "AZ", GEO: "GE",
  ARM: "AM", QAT: "QA", KWT: "KW", OMN: "OM", BHR: "BH", JOR: "JO",
  LBN: "LB", ETH: "ET", TZA: "TZ", UGA: "UG", ZWE: "ZW", ZMB: "ZM",
  SEN: "SN", CIV: "CI", CMR: "CM", AGO: "AO", MOZ: "MZ", MMR: "MM",
  KHM: "KH", LAO: "LA", MNG: "MN", AFG: "AF", ALB: "AL", MKD: "MK",
  BIH: "BA", MDA: "MD", BLR: "BY", FJI: "FJ", PNG: "PG",
};

export function deviceLabel(value: string): string {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
