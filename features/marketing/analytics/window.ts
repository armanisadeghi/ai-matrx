/**
 * The GA4 window read — one site's persisted Google Analytics evidence,
 * aggregated honestly for a comparison range.
 *
 * Reads go browser → Supabase directly (`seo.web_analytics_daily`, RLS-scoped);
 * the only compute call in this feature stays the sync trigger in `data.ts`.
 *
 * TWO ACCURACY RULES LIVE HERE — both measured against live rows 2026-09-17:
 *
 * 1. WINNING-RUN DEDUP. `seo.web_analytics_daily.dedup_key` is scoped to the
 *    collection RUN (`aidream/packages/matrx-seo/.../orm_repository.py
 *    ._persist_web_analytics_batch`), so every re-sync of an overlapping window
 *    writes a SECOND full set of rows for the same days. Site
 *    d0aff5b6-… carries up to FIVE runs on 31 of its 34 days: a naive
 *    `SUM(sessions)` over that site reports up to five times its real traffic.
 *    Per (site, date) only the newest run's rows are aggregated — the same rule
 *    the GSC read RPCs apply (`migrations/seo_gsc_perf_rpcs.sql` § accuracy
 *    contract), chosen BEFORE any user filter.
 *
 * 2. SESSIONS ADD, USERS DO NOT. The row grain is date × landing page × source
 *    × medium × channel × campaign × device, and GA4 counts a person once per
 *    report. Summing `users` therefore counts a visitor who landed twice twice
 *    over; the panel prints that caveat on the number instead of pretending
 *    (`caveats.ts` → `users-not-unique`).
 *
 * COST, STATED PLAINLY: there is no server-side GA4 summary RPC yet, so this
 * pages the raw grain through `readAllRows` (~60k rows for the busiest live
 * site over 56 days). The read is complete-or-throw, never a silent 1000-row
 * truncation. The follow-up is a `seo.web_analytics_summary` DEFINER RPC beside
 * the four `seo.gsc_perf_*` ones — recorded in `features/marketing/FEATURE.md`.
 */

import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import {
  ga4Caveats,
  ga4PropertyTimezone,
  readGa4Metadata,
  type AnalyticsCaveat,
  type Ga4DayMetadata,
} from "@/features/marketing/analytics/caveats";

/** The selectable comparison windows. 28 vs previous 28 is the default. */
export const ANALYTICS_RANGE_DAYS = [7, 28, 90] as const;
export type AnalyticsRangeDays = (typeof ANALYTICS_RANGE_DAYS)[number];
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRangeDays = 28;

export interface AnalyticsTotals {
  sessions: number;
  users: number;
  engagedSessions: number;
  conversions: number;
  keyEvents: number;
  views: number;
}

export interface AnalyticsDayPoint {
  date: string;
  sessions: number;
  users: number;
  engagedSessions: number;
  conversions: number;
}

export interface AnalyticsLandingPage {
  landingPage: string;
  /** The canonical `web.page` this landing page resolved to, when it did. */
  pageId: string | null;
  sessions: number;
  users: number;
  engagedSessions: number;
  conversions: number;
}

export interface AnalyticsWindowBounds {
  start: string;
  end: string;
  days: number;
}

export interface SiteAnalyticsWindowData {
  /** The freshest GA4 day stored for this site (`null` = nothing stored). */
  dataThrough: string | null;
  /** When the newest stored row was written — the "pulled" half of freshness. */
  pulledAt: string | null;
  /** The GA4 property's own timezone, as Google reported it. */
  propertyTimezone: string | null;
  current: AnalyticsWindowBounds;
  previous: AnalyticsWindowBounds;
  totals: AnalyticsTotals;
  previousTotals: AnalyticsTotals;
  series: AnalyticsDayPoint[];
  previousSeries: AnalyticsDayPoint[];
  landingPages: AnalyticsLandingPage[];
  /** Days in the current window that have at least one stored row. */
  daysWithData: number;
  /** Days in the PREVIOUS window that have at least one stored row. */
  previousDaysWithData: number;
  /** The comparison verdict — never a bare percentage over unequal coverage. */
  comparison: AnalyticsComparison;
  /** Rows read, and rows discarded as superseded by a newer run. */
  rowsRead: number;
  rowsSuperseded: number;
  caveats: AnalyticsCaveat[];
}

/**
 * RULE 3 — A COMPARISON IS REFUSED WHEN THE TWO WINDOWS WERE NOT COLLECTED
 * ALIKE (added 2026-09-17 after zero-authorship verification defect B-2).
 *
 * Measured on live site `d0aff5b6-…` (All Green Recycling, org `5dc930e9…`):
 * the current 28-day window has 28 of 28 days stored, the previous window has
 * 6 of 28. Winning-run-deduped sessions are 14,909 against 4,485, so the tile
 * printed about **+232%** — while per COLLECTED day the site went from 748/day
 * to 532/day, a ~29% FALL. The only coverage disclosure on the panel measured
 * the CURRENT window (`daysWithData < range`), so on this site it never fired:
 * the screen whose whole premise is GA4 honesty printed a number that was
 * wrong in direction.
 *
 * WHAT THE CHAMPIONS DO. Databox withholds the current-vs-prior change when a
 * period is incomplete and says which period it left out, rather than
 * normalizing it into a rate nobody asked for; Looker Studio does neither —
 * it compares the raw totals and prints the +232%, which is the failure we are
 * beating. We follow Databox: the percentage is REFUSED and the reason is
 * printed on the number, with both windows' collected-day counts and the
 * per-collected-day figures so the reader still learns which way it moved.
 *
 * "Collected alike" is deliberately not "identical": a window may legitimately
 * miss a day. The tolerance is `COMPARISON_COVERAGE_TOLERANCE_DAYS`, matching
 * the Search Console rule that used to live in `SiteKpiPeeks.trendPercent` (it
 * suppressed a delta below 21 of 28 prior days — 75%, which is exactly
 * `COMPARISON_COVERAGE_MIN_SHARE`); here BOTH windows must clear that share and
 * be within the tolerance OF EACH OTHER, because the direction of the error is
 * the gap between them. Since 2026-09-17 (round-3 verdict B-N1) the Search
 * Console surfaces ask this same judge through `analytics/gsc-delta.ts`: the old
 * rule judged the previous window only, so five live sites at 8 of 28 current
 * days against 23 of 28 previous ones were painted as a ~70% collapse while
 * their traffic per collected day was flat or UP.
 */
export type AnalyticsComparisonState = "comparable" | "refused";

export interface AnalyticsComparison {
  state: AnalyticsComparisonState;
  /** Days with stored rows in each window, and the window length. */
  currentDaysWithData: number;
  previousDaysWithData: number;
  windowDays: number;
  /**
   * The sentence to print ON the number when the comparison is refused, and
   * the coverage caveat to print beside it when it is not. Never null when
   * either window is short — a complete pair prints nothing.
   */
  caveat: string | null;
}

/** Below this share of a window, a window is not "collected" for comparison. */
export const COMPARISON_COVERAGE_MIN_SHARE = 0.75;
/** …and the two windows may not differ by more than this many days. */
export const COMPARISON_COVERAGE_TOLERANCE_DAYS = 3;

/**
 * Judge the two windows' coverage. Pure, so the rule is provable with rows a
 * test writes by hand.
 */
export function judgeAnalyticsComparison(input: {
  currentDaysWithData: number;
  previousDaysWithData: number;
  windowDays: number;
}): AnalyticsComparison {
  const { currentDaysWithData, previousDaysWithData, windowDays } = input;
  const base = {
    currentDaysWithData,
    previousDaysWithData,
    windowDays,
  };
  // A WINDOW THAT CANNOT EXIST IS REFUSED BY NAME (round-3 verdict B-N6). A
  // zero-length window is not a comparison, and a window cannot hold more
  // collected days than it has days — both used to pass: `previous = 31`
  // against a 28-day window read as "comparable" with no caveat at all
  // (share > 1, gap 3 inside the tolerance), and `windowDays: 0` produced the
  // sentence "the previous 0 days have only 28 of 0 days collected".
  if (windowDays <= 0) {
    return {
      ...base,
      state: "refused",
      caveat: `No comparison: the window is ${windowDays} days long, so there is nothing to compare. This is a bug in whatever asked for it, not a gap in the data.`,
    };
  }
  if (
    currentDaysWithData < 0 ||
    previousDaysWithData < 0 ||
    currentDaysWithData > windowDays ||
    previousDaysWithData > windowDays
  ) {
    return {
      ...base,
      state: "refused",
      caveat: `No comparison: this ${windowDays}-day window reports ${currentDaysWithData} collected days now and ${previousDaysWithData} before, and a ${windowDays}-day window cannot hold more than ${windowDays} or fewer than 0. The coverage counts are wrong, so no percentage over them can be trusted.`,
    };
  }
  const previousShare = previousDaysWithData / windowDays;
  const gap = Math.abs(currentDaysWithData - previousDaysWithData);
  const currentShare = currentDaysWithData / windowDays;
  const refused =
    previousDaysWithData === 0 ||
    currentDaysWithData === 0 ||
    previousShare < COMPARISON_COVERAGE_MIN_SHARE ||
    currentShare < COMPARISON_COVERAGE_MIN_SHARE ||
    gap > COMPARISON_COVERAGE_TOLERANCE_DAYS;
  if (refused) {
    return {
      ...base,
      state: "refused",
      caveat: `No comparison: the previous ${windowDays} days have only ${previousDaysWithData} of ${windowDays} days collected, against ${currentDaysWithData} of ${windowDays} now. A percentage across those two windows would measure our collection, not this site's traffic.`,
    };
  }
  const short = currentDaysWithData < windowDays || previousDaysWithData < windowDays;
  return {
    ...base,
    state: "comparable",
    caveat: short
      ? `Coverage: ${currentDaysWithData} of ${windowDays} days collected now and ${previousDaysWithData} of ${windowDays} before, so both totals are slightly under-counted.`
      : null,
  };
}

/** Per collected day — the honest figure when the totals are not comparable. */
export function perCollectedDay(
  total: number,
  daysWithData: number,
): number | null {
  if (daysWithData <= 0) return null;
  return total / daysWithData;
}

export interface RawRow {
  id: string;
  date: string;
  run_id: string;
  created_at: string;
  /** `extras.ga4_collection_metadata` rides every row — see caveats.ts. */
  extras?: unknown;
  landing_page: string | null;
  page_id: string | null;
  sessions: number;
  users: number;
  engaged_sessions: number;
  conversions: number;
  key_events: number;
  views: number;
}

const MAX_WINDOW_ROWS = 400_000;

function emptyTotals(): AnalyticsTotals {
  return {
    sessions: 0,
    users: 0,
    engagedSessions: 0,
    conversions: 0,
    keyEvents: 0,
    views: 0,
  };
}

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map((part) => Number(part));
  // UTC arithmetic on a date-only column: a local-time Date would shift the day
  // for every viewer west of UTC (utils/dateOnly.ts carries the same rule).
  const stamp = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + delta * 86_400_000;
  return new Date(stamp).toISOString().slice(0, 10);
}

function accumulate(into: AnalyticsTotals, row: RawRow): void {
  into.sessions += row.sessions;
  into.users += row.users;
  into.engagedSessions += row.engaged_sessions;
  into.conversions += row.conversions;
  into.keyEvents += row.key_events;
  into.views += row.views;
}

/**
 * The freshest stored day and pull time. Deliberately NOT the source of the
 * honesty caveats: those are judged over every day in the window
 * (`aggregateAnalyticsRows`), because this row is one day of twenty-eight.
 */
async function readFreshest(
  siteId: string,
  signal?: AbortSignal,
): Promise<{
  dataThrough: string | null;
  pulledAt: string | null;
  propertyTimezone: string | null;
}> {
  const response = await supabase
    .schema("seo")
    .from("web_analytics_daily")
    .select("date, created_at, property_timezone, extras")
    .eq("site_id", siteId)
    .eq("provider", "ga4")
    .order("created_at", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  const row = response.data?.[0] ?? null;
  const latestDay = await supabase
    .schema("seo")
    .from("web_analytics_daily")
    .select("date")
    .eq("site_id", siteId)
    .eq("provider", "ga4")
    .order("date", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal);
  if (latestDay.error) throw latestDay.error;
  return {
    dataThrough: latestDay.data?.[0]?.date ?? null,
    pulledAt: row?.created_at ?? null,
    propertyTimezone:
      row?.property_timezone ?? ga4PropertyTimezone(readGa4Metadata(row?.extras)),
  };
}

/**
 * Read and aggregate one site's GA4 window plus the equal-length window before
 * it. `days` is the window length; the window ENDS on the freshest stored day,
 * never on today, because Google runs about a day behind and a window ending
 * on today would silently average in days Google has not filed yet.
 */
export async function readSiteAnalyticsWindow(
  siteId: string,
  days: AnalyticsRangeDays,
  signal?: AbortSignal,
): Promise<SiteAnalyticsWindowData> {
  await requireAuthenticatedSupabaseSession(supabase);
  const freshest = await readFreshest(siteId, signal);
  if (!freshest.dataThrough) {
    const bounds: AnalyticsWindowBounds = { start: "", end: "", days };
    return {
      dataThrough: null,
      pulledAt: freshest.pulledAt,
      propertyTimezone: freshest.propertyTimezone,
      current: bounds,
      previous: bounds,
      totals: emptyTotals(),
      previousTotals: emptyTotals(),
      series: [],
      previousSeries: [],
      landingPages: [],
      daysWithData: 0,
      previousDaysWithData: 0,
      comparison: judgeAnalyticsComparison({
        currentDaysWithData: 0,
        previousDaysWithData: 0,
        windowDays: days,
      }),
      rowsRead: 0,
      rowsSuperseded: 0,
      caveats: [],
    };
  }
  const end = freshest.dataThrough;
  const start = addDays(end, -(days - 1));
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  const rows = await readAllRows<RawRow>(
    ({ from, to }) =>
      supabase
        .schema("seo")
        .from("web_analytics_daily")
        .select(
          // `extras` rides along because the honesty caveats are judged over
          // EVERY day in the window, not over one freshest row (NEW-B5).
          "id, date, run_id, created_at, landing_page, page_id, sessions, users, engaged_sessions, conversions, key_events, views, extras",
          { count: "exact" },
        )
        .eq("site_id", siteId)
        .eq("provider", "ga4")
        .gte("date", previousStart)
        .lte("date", end)
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(signal ?? new AbortController().signal),
    {
      label: "seo.web_analytics_daily",
      maxRows: MAX_WINDOW_ROWS,
    },
  );

  const aggregated = aggregateAnalyticsRows(rows, {
    start,
    end,
    previousStart,
    previousEnd,
    days,
  });

  return {
    dataThrough: end,
    pulledAt: freshest.pulledAt,
    propertyTimezone: freshest.propertyTimezone,
    current: { start, end, days },
    previous: { start: previousStart, end: previousEnd, days },
    ...aggregated,
  };
}

export interface AggregateBounds {
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  days: number;
}

/**
 * The accuracy rules, as a pure function so they can be proven with rows a test
 * writes by hand: winning-run dedup per date, current/previous split, landing
 * pages for the current window, and the caveats that are TRUE for it.
 */
export function aggregateAnalyticsRows(
  rows: readonly RawRow[],
  bounds: AggregateBounds,
): Omit<
  SiteAnalyticsWindowData,
  "dataThrough" | "pulledAt" | "propertyTimezone" | "current" | "previous"
> {
  // Rule 1 — the winning run per day (newest write wins).
  const winningRun = new Map<string, { runId: string; at: string }>();
  for (const row of rows) {
    const held = winningRun.get(row.date);
    if (!held || row.created_at > held.at) {
      winningRun.set(row.date, { runId: row.run_id, at: row.created_at });
    }
  }

  const totals = emptyTotals();
  const previousTotals = emptyTotals();
  const byDay = new Map<string, AnalyticsDayPoint>();
  const previousByDay = new Map<string, AnalyticsDayPoint>();
  const byLandingPage = new Map<string, AnalyticsLandingPage>();
  let rowsSuperseded = 0;
  // THE CAVEATS ARE JUDGED OVER THE WINDOW (NEW-B5): one entry per collected
  // day of the CURRENT window, carrying that day's own `ResponseMetaData` and
  // whether an `(other)` landing page was stored for it.
  const dayMetadata = new Map<string, Ga4DayMetadata>();

  for (const row of rows) {
    if (winningRun.get(row.date)?.runId !== row.run_id) {
      rowsSuperseded += 1;
      continue;
    }
    const inCurrent = row.date >= bounds.start;
    const dayMap = inCurrent ? byDay : previousByDay;
    const point = dayMap.get(row.date) ?? {
      date: row.date,
      sessions: 0,
      users: 0,
      engagedSessions: 0,
      conversions: 0,
    };
    point.sessions += row.sessions;
    point.users += row.users;
    point.engagedSessions += row.engaged_sessions;
    point.conversions += row.conversions;
    dayMap.set(row.date, point);
    accumulate(inCurrent ? totals : previousTotals, row);
    if (!inCurrent) continue;
    const day = dayMetadata.get(row.date) ?? {
      date: row.date,
      metadata: null,
      hasOtherRow: false,
    };
    day.metadata = day.metadata ?? readGa4Metadata(row.extras);
    const key = row.landing_page ?? "(not set)";
    if (key === "(other)") day.hasOtherRow = true;
    dayMetadata.set(row.date, day);
    const page = byLandingPage.get(key) ?? {
      landingPage: key,
      pageId: null,
      sessions: 0,
      users: 0,
      engagedSessions: 0,
      conversions: 0,
    };
    page.sessions += row.sessions;
    page.users += row.users;
    page.engagedSessions += row.engaged_sessions;
    page.conversions += row.conversions;
    page.pageId = page.pageId ?? row.page_id;
    byLandingPage.set(key, page);
  }

  const series = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const previousSeries = [...previousByDay.values()].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );

  return {
    totals,
    previousTotals,
    series,
    previousSeries,
    landingPages: [...byLandingPage.values()].sort(
      (a, b) => b.sessions - a.sessions,
    ),
    daysWithData: series.length,
    previousDaysWithData: previousSeries.length,
    // Rule 3: the caveat logic measures BOTH windows, never only the current
    // one — that is exactly how the +232% got printed.
    comparison: judgeAnalyticsComparison({
      currentDaysWithData: series.length,
      previousDaysWithData: previousSeries.length,
      windowDays: bounds.days,
    }),
    rowsRead: rows.length,
    rowsSuperseded,
    caveats: ga4Caveats({
      days: [...dayMetadata.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      usersAreSummed: totals.users > 0,
    }),
  };
}
