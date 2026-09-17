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
    | "users-not-unique"
    /**
     * 🚨 NOT A CAVEAT ABOUT THE DATA — a caveat about the MEASUREMENT (round-4
     * finding V14-4, B side). Google reports thresholding, sampling and the
     * `(other)` bundle only when they apply, and this window's stored report
     * carries none of them: that is "nothing was flagged", which is not the same
     * claim as "checked and clean". Live on 2026-09-17 all 62,301 GA4 rows carry
     * ONE metadata object — `{timeZone, currencyCode, schemaRestrictionResponse:
     * {}}` — so no honesty caveat has ever fired on this platform, and a silent
     * clean number would be the GA4 lie §1 names, wearing our own colours.
     */
    | "flags-not-affirmed";
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
  /** NEW 2026-09-17 — the report window these flags actually describe. */
  report_date_range?: unknown;
  /** NEW 2026-09-17 — the RFC3339 UTC instant the report was captured. */
  captured_at?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

interface Ga4ReportWindow {
  start: string;
  end: string;
}

/** `{start, end}` as ISO date strings, or null when absent/malformed. */
function asReportDateRange(value: unknown): Ga4ReportWindow | null {
  const record = asRecord(value);
  const start = record?.start;
  const end = record?.end;
  return typeof start === "string" && typeof end === "string"
    ? { start, end }
    : null;
}

/** "Sep 1–28" (same month) or "Sep 1 – Oct 3" (spans months), in UTC. */
function formatMonthDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((part) => Number(part));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", timeZone: "UTC" },
  );
}

function formatReportWindow(range: Ga4ReportWindow): string {
  const startLabel = formatMonthDay(range.start);
  if (range.start.slice(0, 7) === range.end.slice(0, 7)) {
    return `${startLabel}–${Number(range.end.slice(8, 10))}`;
  }
  return `${startLabel} – ${formatMonthDay(range.end)}`;
}

/** "Sep 29 07:15 UTC" from an RFC3339 instant; the raw string if unparsable. */
function formatCapturedAt(iso: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  const datePart = instant.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const timePart = instant.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hourCycle: "h23",
  });
  return `${datePart} ${timePart} UTC`;
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
 * WHAT WINDOW A FLAG COVERS (2026-09-17, GA4 collection honesty metadata).
 *
 * The flags describe the whole REPORT, not one day, so "all N collected days"
 * was never the true fact — it was the count of day-ROWS the flag happened to
 * ride, not the window Google actually reported on. `report_date_range` +
 * `captured_at` are the true fact when a matched day carries them; a day
 * collected before 2026-09-17 never does, so the per-day count remains the
 * honest fallback for it, named as such rather than silently reused as if it
 * were the report window.
 */
function describeFlagWindow(
  matchedDays: readonly Ga4DayMetadata[],
  totalDays: number,
): string {
  const ranges = matchedDays
    .map((day) => asReportDateRange(day.metadata?.report_date_range))
    .filter((range): range is Ga4ReportWindow => range !== null);
  if (ranges.length === 0) {
    return `on ${dayCount(matchedDays.length, totalDays)} (report window not recorded)`;
  }
  const start = [...ranges].sort((a, b) => (a.start < b.start ? -1 : 1))[0]!
    .start;
  const end = [...ranges].sort((a, b) => (a.end > b.end ? -1 : 1))[0]!.end;
  const capturedAts = matchedDays
    .map((day) => day.metadata?.captured_at)
    .filter((value): value is string => typeof value === "string")
    .sort();
  const capturedPhrase =
    capturedAts.length > 0
      ? `, captured ${formatCapturedAt(capturedAts[capturedAts.length - 1]!)}`
      : "";
  const unrecorded = matchedDays.length - ranges.length;
  const gapPhrase =
    unrecorded > 0
      ? ` (window unknown for ${unrecorded} other day${unrecorded === 1 ? "" : "s"})`
      : "";
  return `for ${formatReportWindow({ start, end })}${capturedPhrase}${gapPhrase}`;
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
    const matched = input.days.filter(
      (day) => day.metadata?.subjectToThresholding === true,
    );
    caveats.push({
      id: "thresholding",
      headline: `Google withheld some rows ${describeFlagWindow(matched, total)} (thresholding)`,
      detail:
        "Google hides rows that could identify an individual — usually when Google Signals is on and the audience is small. Totals here are lower than reality by the amount Google withheld, and Google does not say how much that is.",
    });
  }
  if (otherDays > 0) {
    const matched = input.days.filter(
      (day) => day.hasOtherRow || day.metadata?.dataLossFromOtherRow === true,
    );
    caveats.push({
      id: "other-row",
      headline: `Some traffic is bundled into “(other)” ${describeFlagWindow(matched, total)}`,
      detail:
        "The report hit Google's cardinality limit, so the least-common landing pages were collapsed into one “(other)” row. Site totals are still right; the per-page list is missing those pages by name.",
    });
  }
  if (sampled > 0) {
    const matched = input.days.filter(
      (day) =>
        Array.isArray(day.metadata?.samplingMetadatas) &&
        day.metadata.samplingMetadatas.length > 0,
    );
    caveats.push({
      id: "sampling",
      headline: `Google sampled ${describeFlagWindow(matched, total)}`,
      detail:
        "Google answered from a sample of sessions rather than all of them, so every number here is an estimate. A shorter date range usually returns unsampled data.",
    });
  }
  if (restricted > 0) {
    const matched = input.days.filter((day) => {
      const restriction = asRecord(day.metadata?.schemaRestrictionResponse);
      const active = restriction?.activeMetricRestrictions;
      return Array.isArray(active) && active.length > 0;
    });
    caveats.push({
      id: "schema-restriction",
      headline: `Your Google role hid some metrics ${describeFlagWindow(matched, total)}`,
      detail:
        "Google restricted at least one metric for the account this data was pulled with, so it is missing rather than zero. A property Analyst or Administrator sees the full set.",
    });
  }
  // 🚨 WHAT WAS NOT MEASURED IS SAID TOO (§ V14-4, B side). Only when Google
  // flagged NOTHING: a window with a real flag has a real caveat and needs no
  // note about the ones it did not carry.
  //
  // 🚨 THE CENSUS BUG (2026-09-17, B-19 adoption): this used to be `.some()` —
  // ANY one day in the window carrying any of the three keys silently affirmed
  // the WHOLE window, so a window straddling the 2026-09-17 cutover (some days
  // captured under the new explicit-false contract, earlier days genuinely
  // never captured) read as fully affirmed and lost this note for the days
  // that truly were never captured. The three keys always arrive TOGETHER now
  // (`Ga4CollectionMetadata` requires all three), so checking one is checking
  // all three per day; the fix is requiring EVERY day in the window to carry
  // them, not just one.
  const capturedDays = count((day) => {
    const metadata = asRecord(day.metadata);
    return (
      metadata !== null &&
      "subjectToThresholding" in metadata &&
      "dataLossFromOtherRow" in metadata &&
      "samplingMetadatas" in metadata
    );
  });
  const fullyAffirmed = total > 0 && capturedDays === total;
  if (total > 0 && caveats.length === 0 && !fullyAffirmed) {
    caveats.push({
      id: "flags-not-affirmed",
      headline:
        "Nothing was flagged for this window — which is not the same as a clean bill of health",
      detail:
        "Google only mentions withheld rows, sampling and “(other)” bundling when they apply, and AI Matrx stores its answer word for word rather than inventing a “no”. So these numbers carry no known distortion — and no positive all-clear either. At least one collected day in this window predates 2026-09-17, when AI Matrx began persisting that answer explicitly (and the window it describes, and when it was captured) — for that day it truly was never captured, and it cannot be back-filled from the original response.",
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
