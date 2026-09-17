/**
 * THE ONE DISCLOSURE LIST for a GA4 window — the tile, the chart legend, the
 * caveat block and the Copy / Copy-for-AI payload all read THIS.
 *
 * WHY IT EXISTS (round-2 verdict NEW-B3 / NEW-B4, 2026-09-17). The comparison
 * refusal and the GA4 caveats were assembled separately at each surface, so the
 * three views of the same window disagreed:
 *
 *   · the tile refused the percentage and printed the reason;
 *   · the chart beneath it drew the previous series anyway, with no note;
 *   · Copy / Copy-for-AI printed `Sessions 14,909 (was 4,485)` — the exact pair
 *     the tile refuses — plus every caveat EXCEPT the comparison one.
 *
 * A number a person pastes into a document or hands to an agent carries no tile
 * around it, so the caveat has to travel WITH the number. One list, built once
 * from the window data, consumed by every surface; a surface that wants a
 * caveat the list does not hold is a bug in the list, never a second list.
 */

import type {
  AnalyticsComparison,
  AnalyticsTotals,
  SiteAnalyticsWindowData,
} from "@/features/marketing/analytics/window";
import { perCollectedDay } from "@/features/marketing/analytics/window";
import type { AnalyticsCaveat } from "@/features/marketing/analytics/caveats";

export interface AnalyticsDisclosure {
  /** `comparison` plus every `AnalyticsCaveat` id. */
  id: "comparison" | AnalyticsCaveat["id"];
  /** The sentence to print ON the number. */
  headline: string;
  /** The longer explanation, empty when the headline is the whole of it. */
  detail: string;
}

export type AnalyticsDisclosureSource = Pick<
  SiteAnalyticsWindowData,
  "caveats" | "comparison"
>;

/**
 * Every disclosure that is true for this window, comparison first — it is the
 * one that changes what the numbers MEAN, so it leads everywhere.
 */
export function analyticsDisclosures(
  data: AnalyticsDisclosureSource,
): AnalyticsDisclosure[] {
  const list: AnalyticsDisclosure[] = [];
  if (data.comparison.caveat) {
    list.push({
      id: "comparison",
      headline: data.comparison.caveat,
      detail: "",
    });
  }
  for (const caveat of data.caveats) {
    list.push({
      id: caveat.id,
      headline: caveat.headline,
      detail: caveat.detail,
    });
  }
  return list;
}


/**
 * 🚨 WHICH NUMBER EACH DISCLOSURE IS PRINTED ON — ONE MAP, round-4 § V14-4.
 *
 * §4.9 asks for the caveats *"printed on the numbers"* and §1 for *"the caveat on
 * the number itself"*. What shipped instead was one bordered block under the
 * chart plus a Users hint reading "Summed across landing pages — see the caveat",
 * an instruction to go and look; a landing page literally named `(other)`
 * rendered as an ordinary row. The block is still there — it is where the
 * EXPLANATION belongs — but the mark now rides the number, and which numbers a
 * caveat touches is decided HERE rather than per surface, because a surface
 * deciding for itself is how the `(other)` row went unmarked.
 *
 * The attributions are the caveats' own physics:
 *   · thresholding — Google withheld ROWS, so every total is low and the page
 *     LIST is missing pages. Tiles and series, and the table; not a single row,
 *     which is not itself wrong.
 *   · sampling — every figure is an estimate, so every number carries it.
 *   · schema-restriction — a metric is missing rather than zero: the totals.
 *   · other-row — site totals are still RIGHT; the per-page list is what lost
 *     pages by name, so it marks the `(other)` row and the list, never a tile.
 *   · users-not-unique — the Users number alone, on the tile and in the chart.
 *   · flags-not-affirmed — what the stored metadata cannot tell us, so it
 *     qualifies the totals and the list, and nothing per row.
 *   · comparison — already printed IN FULL, in words, by the tile and the chart
 *     legend. A mark would be the same sentence twice on one number.
 */
type MarkedMetric = keyof AnalyticsTotals;

const AFFECTS: Record<
  AnalyticsDisclosure["id"],
  {
    /** `"all"`, or the metrics whose tile and series carry it. */
    numbers: "all" | readonly MarkedMetric[];
    /** Every landing-page row, only the `(other)` row, or none. */
    rows: "all" | "other-only" | "none";
    /** The landing-page list as a whole. */
    table: boolean;
  }
> = {
  comparison: { numbers: [], rows: "none", table: false },
  thresholding: { numbers: "all", rows: "none", table: true },
  sampling: { numbers: "all", rows: "all", table: false },
  "schema-restriction": { numbers: "all", rows: "none", table: true },
  "other-row": { numbers: [], rows: "other-only", table: true },
  "users-not-unique": { numbers: ["users"], rows: "none", table: false },
  "flags-not-affirmed": { numbers: "all", rows: "none", table: true },
};

function marks(
  data: AnalyticsDisclosureSource,
  keep: (rule: (typeof AFFECTS)[AnalyticsDisclosure["id"]]) => boolean,
): AnalyticsDisclosure[] {
  return analyticsDisclosures(data).filter((disclosure) =>
    keep(AFFECTS[disclosure.id]),
  );
}

/** What this metric's TILE must wear. */
export function disclosuresForTile(
  data: AnalyticsDisclosureSource,
  metric: MarkedMetric,
): AnalyticsDisclosure[] {
  return marks(
    data,
    (rule) => rule.numbers === "all" || rule.numbers.includes(metric),
  );
}

/** What this metric's CHART SERIES must wear — the same physics as its tile. */
export function disclosuresForSeries(
  data: AnalyticsDisclosureSource,
  metric: MarkedMetric,
): AnalyticsDisclosure[] {
  return disclosuresForTile(data, metric);
}

/** What ONE landing-page row must wear. */
export function disclosuresForLandingPage(
  data: AnalyticsDisclosureSource,
  landingPage: string,
): AnalyticsDisclosure[] {
  return marks(
    data,
    (rule) =>
      rule.rows === "all" ||
      (rule.rows === "other-only" && landingPage === "(other)"),
  );
}

/** What the landing-page LIST as a whole must wear. */
export function disclosuresForTable(
  data: AnalyticsDisclosureSource,
): AnalyticsDisclosure[] {
  return marks(data, (rule) => rule.table);
}

/** The whole mark, as one string — the hover title and the accessible name. */
export function disclosureSentence(
  disclosures: readonly AnalyticsDisclosure[],
): string {
  return disclosures
    .map((disclosure) =>
      disclosure.detail
        ? `${disclosure.headline}. ${disclosure.detail}`
        : disclosure.headline,
    )
    .join(" ");
}

/** What the chart must say about the dashed previous-period series. */
export interface PreviousSeriesDisclosure {
  /** False when the comparison is refused — the series is not drawn at all. */
  shown: boolean;
  /** The legend label. */
  label: string;
  /** The caveat printed on the legend, verbatim from the ONE list. */
  note: string | null;
}

export function previousSeriesDisclosure(
  comparison: AnalyticsComparison,
  hasPreviousDays: boolean,
): PreviousSeriesDisclosure {
  if (!hasPreviousDays) {
    return { shown: false, label: "Previous period", note: null };
  }
  if (comparison.state === "refused") {
    // THE PICTURE OBEYS THE NUMBER (NEW-B3): the tile refuses the comparison,
    // so the chart does not draw one — and it says why, in the tile's words.
    return {
      shown: false,
      label: "Previous period hidden",
      note: comparison.caveat,
    };
  }
  return { shown: true, label: "Previous period", note: comparison.caveat };
}

/**
 * One metric's figure for a copy payload: the comparison when it is comparable,
 * and the refusal — with the per-collected-day figures — when it is not. This
 * is the same choice the tile makes, made once.
 */
export function disclosedMetricLine(input: {
  metric: keyof AnalyticsTotals;
  totals: AnalyticsTotals;
  previousTotals: AnalyticsTotals;
  daysWithData: number;
  comparison: AnalyticsComparison;
  format?: (value: number) => string;
}): string {
  const format =
    input.format ?? ((value: number) => Intl.NumberFormat().format(Math.round(value)));
  const current = input.totals[input.metric];
  const previous = input.previousTotals[input.metric];
  if (input.comparison.state !== "refused") {
    return `${format(current)} (was ${format(previous)})`;
  }
  const nowRate = perCollectedDay(current, input.daysWithData);
  const thenRate = perCollectedDay(
    previous,
    input.comparison.previousDaysWithData,
  );
  const rates =
    nowRate !== null && thenRate !== null
      ? `, ${format(nowRate)} vs ${format(thenRate)} per collected day`
      : "";
  return (
    `${format(current)} — no comparison: ${input.comparison.previousDaysWithData}` +
    ` of ${input.comparison.windowDays} previous days collected against ` +
    `${input.comparison.currentDaysWithData} now (${format(previous)} stored then${rates})`
  );
}

/**
 * The human/agent copy lines for one GA4 window — the SAME disclosures the tile
 * and the chart print, on the same numbers, in one place.
 *
 * `Sessions 14,909 (was 4,485)` used to be pasted out of this panel with every
 * caveat except the one that mattered: that the two windows were not collected
 * alike and the pair is meaningless. A number leaves this screen more often than
 * it is read on it.
 */
export function analyticsCopyLines(input: {
  window: AnalyticsDisclosureSource & {
    current: { start: string; end: string };
    totals: AnalyticsTotals;
    previousTotals: AnalyticsTotals;
    daysWithData: number;
    propertyTimezone: string | null;
  };
  format?: (value: number) => string;
}): Array<[string, string]> {
  const { window: data } = input;
  const format =
    input.format ?? ((value: number) => Intl.NumberFormat().format(Math.round(value)));
  const metric = (key: keyof AnalyticsTotals): string =>
    disclosedMetricLine({
      metric: key,
      totals: data.totals,
      previousTotals: data.previousTotals,
      daysWithData: data.daysWithData,
      comparison: data.comparison,
      format,
    });
  return [
    [
      "Window",
      data.current.start ? `${data.current.start} → ${data.current.end}` : "no data",
    ],
    ["Sessions", metric("sessions")],
    ["Users (summed)", metric("users")],
    ["Engaged sessions", metric("engagedSessions")],
    ["Conversions", metric("conversions")],
    [
      "Days collected",
      `${data.comparison.currentDaysWithData} of ${data.comparison.windowDays} now, ` +
        `${data.comparison.previousDaysWithData} of ${data.comparison.windowDays} in the previous window`,
    ],
    ["Property timezone", data.propertyTimezone ?? "not reported"],
    ...analyticsDisclosures(data).map((disclosure): [string, string] => [
      "Caveat",
      disclosure.headline,
    ]),
  ];
}
