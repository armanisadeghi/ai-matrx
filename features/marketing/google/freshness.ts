/**
 * THE FRESHNESS LINE — one sentence that says how old a Google number is.
 *
 * Arman's champion note for Search Console (google-native PLAN §1): "Nobody
 * states freshness on the chart ('data through Sep 14, pulled 40 min ago,
 * Google runs ~3 days behind')." Ahrefs is the reference; we print it on every
 * surface that shows Google numbers, so a stale figure can never read as today.
 *
 * ONE describer, ONE component (`components/shared/DataFreshnessLine.tsx`), two
 * providers today: Search Console (~3 days behind) and GA4 (~1 day behind).
 * The warning threshold is a KNOB, not a constant — `google.marketing`
 * `freshness_warning_hours` (default 72, basis "GSC API lag is 2–3 days"),
 * seeded in `migrations/google_marketing_knobs.sql` and LIVE since
 * 2026-09-17 06:37:24Z (`platform.feature_knob`, value 72, read back
 * 2026-09-17 — the earlier "not yet applied / cannot warn yet" note in this
 * file and in both FEATURE.md files was already stale when it was written).
 * A knob with no row RAISES by design (`lib/knobs/featureKnobs.ts`), so the
 * reader below still turns an unreadable knob into a visible, named stand-in
 * instead of a blank line or a swallowed error — that path now means the READ
 * failed, not that the row is missing.
 */

import { useQuery } from "@tanstack/react-query";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { formatRelativeTime, parseTimestamp } from "@/utils/datetime";

export const GOOGLE_MARKETING_KNOB_FEATURE = "google.marketing";
export const FRESHNESS_WARNING_HOURS_KNOB = "freshness_warning_hours";

export type FreshnessProvider = "search_console" | "analytics" | "tag_manager";

/** What Google itself does, in plain words — never a guess per surface. */
export const PROVIDER_LAG_SENTENCE: Record<FreshnessProvider, string> = {
  search_console: "Google runs about three days behind",
  analytics: "Google runs about a day behind",
  // Tag Manager has no reporting lag at all — its caveat is a different one, and it is the whole
  // reason this line exists on a tracking snapshot: the read API exposes the container's current
  // WORKSPACE DRAFT, which can differ from what is published on the live site. A reader who
  // takes a Tag Manager verdict as "what the site does" is reading a draft as production.
  tag_manager:
    "Tag Manager shows the container's workspace draft, not what is published",
};

/**
 * Providers whose freshness is a POINT IN TIME, not a covered range. A tracking snapshot IS its
 * timestamp — there is no "data through" day — so the line must not print "no data stored yet"
 * beside a snapshot that exists. One describer, one branch, no second component.
 */
const POINT_IN_TIME_PROVIDERS: ReadonlySet<FreshnessProvider> = new Set([
  "tag_manager",
]);

export interface FreshnessInput {
  provider: FreshnessProvider;
  /** The newest calendar day of data stored (date-only, `yyyy-mm-dd`). */
  dataThrough: string | null;
  /** When we last pulled (a timestamp — `gsc_synced_at`, a run's `created_at`). */
  pulledAt: string | null;
  /** From the knob; `null` when the knob is unreadable (see `useFreshnessWarningHours`). */
  warningAfterHours: number | null;
  /** Injectable for tests. */
  now?: Date;
}

export interface FreshnessDescription {
  /** The whole line, ready to print. */
  sentence: string;
  /** Hours since the last pull, or null when we have never pulled. */
  pulledHoursAgo: number | null;
  /** True once the last pull is older than the knob's threshold. */
  stale: boolean;
  /** True when nothing has ever been pulled for this record. */
  neverPulled: boolean;
  /**
   * True when the stored pull time is AHEAD of this reader's clock. The age is
   * then unknowable, so the line says so instead of printing "pulled in 1 day"
   * (round-2 verdict NEW-B7) and nothing is called stale or fresh on it.
   */
  clockAhead: boolean;
  /** True when `dataThrough` is a day that has not happened yet. */
  dataThroughInFuture: boolean;
  /** Present when the threshold could not be read — printed, never hidden. */
  thresholdUnavailable: string | null;
}

function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((part) => Number(part));
  // Date-only column: format in UTC so it never renders a day early.
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", timeZone: "UTC" },
  );
}

/** Whole hours, rounded, for a plain-English clock-skew sentence. */
function roundedHours(value: number): string {
  const hours = Math.max(1, Math.round(value));
  return hours === 1 ? "an hour" : `${hours} hours`;
}

export function describeFreshness(
  input: FreshnessInput,
): FreshnessDescription {
  const now = input.now ?? new Date();
  const pulled = parseTimestamp(input.pulledAt);
  const pulledHoursAgo = pulled
    ? (now.getTime() - pulled.getTime()) / 3_600_000
    : null;
  // A FUTURE TIMESTAMP IS A CLOCK PROBLEM, NOT AN AGE (round-2 verdict NEW-B7).
  // `formatRelativeTime` cheerfully printed "pulled in 1 day", which reads as a
  // scheduled pull. A skew under a minute is ordinary clock jitter between two
  // machines and says nothing.
  const clockAhead = pulledHoursAgo !== null && pulledHoursAgo < -1 / 60;
  const today = now.toISOString().slice(0, 10);
  const dataThroughInFuture = Boolean(
    input.dataThrough && input.dataThrough > today,
  );
  const stale =
    !clockAhead &&
    input.warningAfterHours !== null &&
    pulledHoursAgo !== null &&
    pulledHoursAgo > input.warningAfterHours;
  const parts: string[] = [
    // A point-in-time provider contributes no range clause at all; "no data stored yet" beside a
    // real snapshot would be a lie about a record we are holding.
    ...(POINT_IN_TIME_PROVIDERS.has(input.provider) && !input.dataThrough
      ? []
      : [
          input.dataThrough
            ? dataThroughInFuture
              ? `dated through ${formatDay(input.dataThrough)}, a day that has not happened yet — the stored day is wrong, so read nothing into how fresh this looks`
              : `data through ${formatDay(input.dataThrough)}`
            : "no data stored yet",
        ]),
    pulled
      ? clockAhead
        ? `pull time is ${roundedHours(-(pulledHoursAgo as number))} ahead of your clock, so its age is unknown — one of the two clocks is wrong`
        : // 🚨 ONE CLOCK FOR BOTH HALVES (round-4 finding V14-9). `stale` is judged
          // against `now`; the printed age used to come from `formatRelativeTime`'s
          // own `Date.now()`, so a 40-minute-old pull printed "pulled 4 hours ago"
          // beside `stale=false` under a frozen test clock, and the printed half of
          // NEW-B7 could not be proven at all. The same instant now says both.
          `pulled ${formatRelativeTime(input.pulledAt, { style: "long", now: now.getTime() })}`
      : "never pulled",
    PROVIDER_LAG_SENTENCE[input.provider],
  ];
  return {
    sentence: parts.join(" · "),
    pulledHoursAgo,
    stale,
    neverPulled: !pulled,
    clockAhead,
    dataThroughInFuture,
    // THE STAND-IN NAMES ITSELF AND DATES ITSELF (NEW-B7). It used to assert
    // "The row is live (72 hours since 2026-09-17)" — a value and a date frozen
    // into the sentence, which becomes a lie the first time an organization
    // turns the knob and reads as stale prose for ever after.
    thresholdUnavailable:
      input.warningAfterHours === null && pulled
        ? `This line cannot warn you about staleness right now: the ${GOOGLE_MARKETING_KNOB_FEATURE}.${FRESHNESS_WARNING_HOURS_KNOB} setting could not be read (checked ${today}), so its value is unknown here and nothing is being called stale. Reload, and if it persists tell an administrator that the knob read is failing.`
        : null,
  };
}

/**
 * The knob read. A missing knob is NOT swallowed: the hook returns
 * `hours: null` plus the reason, which `DataFreshnessLine` prints under the
 * line so the gap is visible and fixable rather than silently unenforced.
 */
export function useFreshnessWarningHours(): {
  hours: number | null;
  unavailableReason: string | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: [
      "feature-knob",
      GOOGLE_MARKETING_KNOB_FEATURE,
      FRESHNESS_WARNING_HOURS_KNOB,
    ] as const,
    queryFn: () =>
      knobInt(GOOGLE_MARKETING_KNOB_FEATURE, FRESHNESS_WARNING_HOURS_KNOB),
    staleTime: 60_000,
    retry: false,
  });
  return {
    hours: typeof query.data === "number" ? query.data : null,
    unavailableReason: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
    isLoading: query.isLoading,
  };
}
