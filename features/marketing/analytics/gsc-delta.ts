/**
 * THE SEARCH CONSOLE DELTA — ONE judge for every surface that prints one.
 *
 * WHY THIS EXISTS (zero-authorship verification round 3, 2026-09-17, defect
 * B-N1). The 28-day KPI delta was implemented three times: `trendPercent` in
 * `SiteKpiPeeks` (read by the managed-sites table, its phone card and the site
 * peek window), a second `trendPercent` inside `SearchConsolePortfolio`, and
 * that file's own inline `site.gsc_prev_days >= 21`. All three judged the
 * PREVIOUS window's coverage only, with `21` typed in by hand — the CURRENT
 * window's day count was selected from `web.v_site_kpis` (`gsc_cur_days`) and
 * dropped in `mergeSiteListRow` without ever being typed onto the row.
 *
 * Live on 2026-09-17, five managed sites sat at 8 of 28 current days against 23
 * of 28 previous days, so `prevDays >= 21` held and those screens printed
 * −54.3% … −72.6%. Per COLLECTED day two of them had gone UP. And when the old
 * rule did suppress, it printed nothing at all — the silent omission the GA4
 * tile was rebuilt to stop.
 *
 * So the rule is the platform's one comparison judge,
 * `judgeAnalyticsComparison` (`analytics/window.ts`): both windows' coverage
 * judged, the 75% share and the 3-day gap tolerance derived from
 * `COMPARISON_COVERAGE_MIN_SHARE` / `COMPARISON_COVERAGE_TOLERANCE_DAYS`, and a
 * refused pair carrying the sentence that says so with both day counts. Every
 * Search Console surface asks THIS, and `features/marketing/analytics/gsc-delta.test.ts`
 * fails if a second `trendPercent` or a hand-typed threshold comes back.
 */

import {
  judgeAnalyticsComparison,
  perCollectedDay,
  type AnalyticsComparison,
} from "@/features/marketing/analytics/window";
import type { SiteListRow } from "@/features/marketing/types";

/**
 * The window `web.v_site_kpis` computes: `current_date - 28` against the 28
 * days before it, both anchored on the view's own arithmetic
 * (`migrations/web_site_kpis_resource_class.sql`).
 */
export const GSC_KPI_WINDOW_DAYS = 28;

/**
 * 🚨 WHY A PERCENTAGE IS OR IS NOT PRINTED — and every reason has its own words
 * (round-4 finding V14-8, 2026-09-17).
 *
 * `percent` used to be nulled for FOUR different reasons and the pills could
 * only tell one story about it: the coverage one. A site with 28 of 28 days
 * collected in both windows and zero clicks before therefore read
 * *"no comparison · 28 of 28 days now vs 28 of 28"* with the tooltip *"The two
 * windows were not collected alike"* — false, on five live sites. Growth from
 * zero has no percentage; that is not a collection gap, and saying so tells a
 * person the wrong thing about their own data.
 */
export type GscDeltaVerdict =
  /** Both windows collected alike and the base is a real number. */
  | "comparable"
  /** The two windows were not collected alike — `comparison.caveat` says how. */
  | "coverage_refused"
  /** The previous window is a real measurement and it is ZERO. */
  | "no_baseline"
  /** One of the two totals was never returned, so there is nothing to divide. */
  | "unknown_totals";

export interface GscWindowDelta {
  /** Why this delta is, or is not, a percentage. */
  verdict: GscDeltaVerdict;
  /** The percentage — ONLY when the judge accepts both windows' coverage. */
  percent: number | null;
  /** The verdict, with both day counts, for whoever prints the caveat. */
  comparison: AnalyticsComparison;
  /** The sentence to print where the percentage is refused, or the coverage
   *  note on a short-but-comparable pair. Null when both windows are complete. */
  caveat: string | null;
  /** The honest figure when the totals are not comparable. */
  currentPerDay: number | null;
  previousPerDay: number | null;
}

/** Judge one metric's two windows. Pure — the rule is provable by hand. */
export function judgeGscWindowDelta(input: {
  current: number | null;
  previous: number | null;
  currentDaysWithData: number;
  previousDaysWithData: number;
  windowDays?: number;
}): GscWindowDelta {
  const windowDays = input.windowDays ?? GSC_KPI_WINDOW_DAYS;
  const comparison = judgeAnalyticsComparison({
    currentDaysWithData: input.currentDaysWithData,
    previousDaysWithData: input.previousDaysWithData,
    windowDays,
  });
  // THE LADDER IS ORDERED, and the order is the honesty. Coverage first: with a
  // thin previous window a zero total is not a measurement, so "nothing happened
  // before" would be a guess. Then a missing total, which is not a zero. Only
  // then a real, fully-collected zero — the V14-8 case.
  const verdict: GscDeltaVerdict =
    comparison.state === "refused"
      ? "coverage_refused"
      : input.current === null || input.previous === null
        ? "unknown_totals"
        : input.previous <= 0
          ? "no_baseline"
          : "comparable";
  return {
    verdict,
    percent:
      verdict === "comparable"
        ? (((input.current as number) - (input.previous as number)) /
            (input.previous as number)) *
          100
        : null,
    comparison,
    // 🚨 A REFUSED DELTA ALWAYS CARRIES ITS OWN SENTENCE. The two pills print
    // `delta.caveat ?? "The two windows were not collected alike."`, so a null
    // here IS the V14-8 lie — never return one while `percent` is null.
    caveat: deltaCaveat(verdict, comparison, input),
    currentPerDay: perCollectedDay(input.current ?? 0, input.currentDaysWithData),
    previousPerDay: perCollectedDay(
      input.previous ?? 0,
      input.previousDaysWithData,
    ),
  };
}

/** Whole numbers, the way a pill's tooltip should read them. */
function count(value: number): string {
  return Intl.NumberFormat().format(Math.round(value));
}

/** The sentence for each verdict — the coverage judge's own words when the
 *  coverage is the reason, and never the coverage words when it is not. */
function deltaCaveat(
  verdict: GscDeltaVerdict,
  comparison: AnalyticsComparison,
  input: { current: number | null; previous: number | null },
): string | null {
  switch (verdict) {
    case "coverage_refused":
      return comparison.caveat;
    case "unknown_totals":
      return (
        "No comparison: one of the two windows was not returned for this " +
        "number, so there is nothing to compare it against. Nothing is wrong " +
        "with the site — the figure is missing here, not zero there."
      );
    case "no_baseline":
      return (
        "There is no previous period to compare: the previous " +
        `${comparison.windowDays} days recorded 0, so a percentage has nothing ` +
        "to divide by. " +
        (input.current && input.current > 0
          ? `This window recorded ${count(input.current)} — growth from zero, ` +
            "which no percentage can express."
          : "There were no sessions in this window either, so there is nothing " +
            "in either period to compare.") +
        ` Both windows were collected the same way (${comparison.currentDaysWithData} ` +
        `and ${comparison.previousDaysWithData} days), so this is the site, not our collection.`
      );
    case "comparable":
      // Short-but-comparable still carries the coverage note; a complete pair
      // carries nothing.
      return comparison.caveat;
    default: {
      const unanswered: never = verdict;
      throw new Error(
        `[gsc-delta] no caveat for verdict ${String(unanswered)} — add one ` +
          "before a pill can print it.",
      );
    }
  }
}

export type GscDeltaMetric = "clicks" | "impressions";

/** The two comparable KPI columns on a managed-site row, judged on the
 *  coverage the row carries — never on the previous window alone. */
export function siteKpiDelta(
  site: Pick<
    SiteListRow,
    | "gsc_clicks_28d"
    | "gsc_clicks_prev_28d"
    | "gsc_impressions_28d"
    | "gsc_impressions_prev_28d"
    | "gsc_cur_days"
    | "gsc_prev_days"
  >,
  metric: GscDeltaMetric,
): GscWindowDelta {
  return judgeGscWindowDelta({
    current:
      metric === "clicks" ? site.gsc_clicks_28d : site.gsc_impressions_28d,
    previous:
      metric === "clicks"
        ? site.gsc_clicks_prev_28d
        : site.gsc_impressions_prev_28d,
    currentDaysWithData: site.gsc_cur_days,
    previousDaysWithData: site.gsc_prev_days,
  });
}

/**
 * The short label a delta pill prints when the comparison is refused. Never
 * empty: a suppressed percentage that prints nothing is the omission this
 * whole module exists to end.
 */
export function gscDeltaRefusalLabel(delta: GscWindowDelta): string {
  const { currentDaysWithData, previousDaysWithData, windowDays } =
    delta.comparison;
  switch (delta.verdict) {
    case "no_baseline":
      // 🚨 § V14-8: this used to print the coverage label — "no comparison · 28
      // of 28 days now vs 28 of 28" — over two windows collected identically.
      return "no previous period · nothing recorded before";
    case "unknown_totals":
      return "no number for one of the two windows";
    case "coverage_refused":
    case "comparable":
      return `no comparison · ${currentDaysWithData} of ${windowDays} days now vs ${previousDaysWithData} of ${windowDays}`;
    default: {
      const unanswered: never = delta.verdict;
      throw new Error(`[gsc-delta] no pill label for ${String(unanswered)}`);
    }
  }
}
