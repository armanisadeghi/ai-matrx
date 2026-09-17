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
  /** Rows read, and rows discarded as superseded by a newer run. */
  rowsRead: number;
  rowsSuperseded: number;
  caveats: AnalyticsCaveat[];
}

interface RawRow {
  id: string;
  date: string;
  run_id: string;
  created_at: string;
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

/** The freshest stored day + the metadata Google returned with it. */
async function readFreshest(
  siteId: string,
  signal?: AbortSignal,
): Promise<{
  dataThrough: string | null;
  pulledAt: string | null;
  propertyTimezone: string | null;
  metadataExtras: unknown;
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
    metadataExtras: row?.extras ?? null,
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
  const metadata = readGa4Metadata(freshest.metadataExtras);
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
          "id, date, run_id, created_at, landing_page, page_id, sessions, users, engaged_sessions, conversions, key_events, views",
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
  let hasOtherRow = false;

  for (const row of rows) {
    if (winningRun.get(row.date)?.runId !== row.run_id) {
      rowsSuperseded += 1;
      continue;
    }
    const inCurrent = row.date >= start;
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
    const key = row.landing_page ?? "(not set)";
    if (key === "(other)") hasOtherRow = true;
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
    dataThrough: end,
    pulledAt: freshest.pulledAt,
    propertyTimezone: freshest.propertyTimezone,
    current: { start, end, days },
    previous: { start: previousStart, end: previousEnd, days },
    totals,
    previousTotals,
    series,
    previousSeries,
    landingPages: [...byLandingPage.values()].sort(
      (a, b) => b.sessions - a.sessions,
    ),
    daysWithData: series.length,
    rowsRead: rows.length,
    rowsSuperseded,
    caveats: ga4Caveats({
      metadata,
      hasOtherRow,
      usersAreSummed: totals.users > 0,
    }),
  };
}
