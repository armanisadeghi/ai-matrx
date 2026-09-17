/**
 * GA4 honesty caveats — printed ON the numbers, never invented.
 *
 * THE RULE (google-native PLAN §1, GA4 champion row): "Every GA4 consumer lies
 * silently: thresholding and the `(other)` row return 200 with wrong totals. We
 * print the caveat on the number itself."
 *
 * The ONLY source of a caveat is what the server actually persisted. aidream's
 * GA4 provider (`packages/matrx-seo/matrx_seo/providers/ga4.py`) stores Google's
 * whole `ResponseMetaData` object verbatim at
 * `seo.web_analytics_daily.extras.ga4_collection_metadata`, so every flag
 * Google set is here and every flag it did not set is ABSENT — which is why
 * this module reads the keys and says nothing when they are missing. A caveat
 * we cannot prove is a lie in the other direction.
 *
 * Measured on live rows 2026-09-17: every GA4 row in `seo.web_analytics_daily`
 * carries `{timeZone, currencyCode, schemaRestrictionResponse:{}}` and none of
 * the four honesty flags, so today the panel prints the `(other)` caveat only
 * when an `(other)` landing page is actually in the rows. See
 * `features/marketing/FEATURE.md` § GA4 honesty caveats for the recorded gap.
 *
 * THE WINDOW IS THE SUBJECT, NOT ONE ROW (round-2 verdict NEW-B5, 2026-09-17).
 * These flags used to be read from the single freshest row of the window, so a
 * 28-day total whose newest day was clean printed no caveat even when an earlier
 * day in the same total was thresholded or sampled. Every judgement below runs
 * over EVERY collected day in the window and names how many days carry it.
 */

export interface AnalyticsCaveat {
  id:
    | "thresholding"
    | "other-row"
    | "sampling"
    | "schema-restriction"
    | "users-not-unique";
  /** What is wrong with the number, in the reader's words. */
  headline: string;
  /** What they should do with that knowledge. */
  detail: string;
}

/** Google's `ResponseMetaData`, as much of it as we read. */
interface Ga4ReportMetadata {
  timeZone?: unknown;
  currencyCode?: unknown;
  subjectToThresholding?: unknown;
  dataLossFromOtherRow?: unknown;
  samplingMetadatas?: unknown;
  schemaRestrictionResponse?: unknown;
  emptyReason?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The persisted `extras.ga4_collection_metadata`, or null when absent. */
export function readGa4Metadata(extras: unknown): Ga4ReportMetadata | null {
  const record = asRecord(extras);
  if (!record) return null;
  return asRecord(record.ga4_collection_metadata);
}

export function ga4PropertyTimezone(
  metadata: Ga4ReportMetadata | null,
): string | null {
  const zone = metadata?.timeZone;
  return typeof zone === "string" && zone.trim() ? zone.trim() : null;
}

/** One collected day of the window, with the metadata Google filed WITH it. */
export interface Ga4DayMetadata {
  date: string;
  /** `extras.ga4_collection_metadata` for that day's winning run. */
  metadata: Ga4ReportMetadata | null;
  /** True when a landing page stored for that day is literally `(other)`. */
  hasOtherRow: boolean;
}

export interface Ga4CaveatInput {
  /**
   * EVERY collected day in the window, never just the freshest one (round-2
   * verdict NEW-B5). Thresholding, sampling and schema restriction are
   * per-report flags: Google sets them on the day it withheld or sampled, and
   * the panel's number is a 28-day total. Reading one row's metadata meant a
   * window whose newest day was clean printed no caveat at all while an earlier
   * day in the same total was thresholded.
   */
  days: readonly Ga4DayMetadata[];
  /** True when the window's user total is a sum across landing pages. */
  usersAreSummed: boolean;
}

/** `n of m collected days`, or `every one of the m collected days`. */
function dayCount(hits: number, total: number): string {
  if (total > 0 && hits === total) {
    return total === 1
      ? "the one collected day"
      : `all ${total} collected days`;
  }
  return `${hits} of ${total} collected days`;
}

/**
 * Every caveat that is TRUE for this window, in the order a reader should meet
 * them. Never a placeholder: an absent flag produces no caveat — and every
 * caveat names HOW MANY days in the window carry it, because "some rows were
 * withheld" over a 28-day total is a different fact from "one day was".
 */
export function ga4Caveats(input: Ga4CaveatInput): AnalyticsCaveat[] {
  const caveats: AnalyticsCaveat[] = [];
  const total = input.days.length;
  const count = (test: (day: Ga4DayMetadata) => boolean): number =>
    input.days.filter(test).length;
  const thresholded = count(
    (day) => day.metadata?.subjectToThresholding === true,
  );
  const otherDays = count(
    (day) => day.hasOtherRow || day.metadata?.dataLossFromOtherRow === true,
  );
  const sampled = count(
    (day) =>
      Array.isArray(day.metadata?.samplingMetadatas) &&
      day.metadata.samplingMetadatas.length > 0,
  );
  const restricted = count((day) => {
    const restriction = asRecord(day.metadata?.schemaRestrictionResponse);
    const active = restriction?.activeMetricRestrictions;
    return Array.isArray(active) && active.length > 0;
  });
  if (thresholded > 0) {
    caveats.push({
      id: "thresholding",
      headline: `Google withheld some rows on ${dayCount(thresholded, total)} (thresholding)`,
      detail:
        "Google hides rows that could identify an individual — usually when Google Signals is on and the audience is small. Totals here are lower than reality by the amount Google withheld, and Google does not say how much that is.",
    });
  }
  if (otherDays > 0) {
    caveats.push({
      id: "other-row",
      headline: `Some traffic is bundled into “(other)” on ${dayCount(otherDays, total)}`,
      detail:
        "The report hit Google's cardinality limit, so the least-common landing pages were collapsed into one “(other)” row. Site totals are still right; the per-page list is missing those pages by name.",
    });
  }
  if (sampled > 0) {
    caveats.push({
      id: "sampling",
      headline: `Google sampled ${dayCount(sampled, total)}`,
      detail:
        "Google answered from a sample of sessions rather than all of them, so every number here is an estimate. A shorter date range usually returns unsampled data.",
    });
  }
  if (restricted > 0) {
    caveats.push({
      id: "schema-restriction",
      headline: `Your Google role hid some metrics on ${dayCount(restricted, total)}`,
      detail:
        "Google restricted at least one metric for the account this data was pulled with, so it is missing rather than zero. A property Analyst or Administrator sees the full set.",
    });
  }
  if (input.usersAreSummed) {
    caveats.push({
      id: "users-not-unique",
      headline: "Users are summed, so visitors can count twice",
      detail:
        "Google counts a person once per report, but these rows are one per landing page (and source, medium, campaign and device). Adding them up counts a visitor who saw two pages twice, so the real unique-user number is lower. Sessions, engaged sessions and conversions add up exactly.",
    });
  }
  return caveats;
}
