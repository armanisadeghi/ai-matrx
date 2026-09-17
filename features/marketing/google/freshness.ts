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
 * seeded in `migrations/google_marketing_knobs.sql`. A knob with no row RAISES
 * by design (`lib/knobs/featureKnobs.ts`), so the reader below turns that into a
 * visible, named stand-in instead of a blank line or a swallowed error.
 */

import { useQuery } from "@tanstack/react-query";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { formatRelativeTime, parseTimestamp } from "@/utils/datetime";

export const GOOGLE_MARKETING_KNOB_FEATURE = "google.marketing";
export const FRESHNESS_WARNING_HOURS_KNOB = "freshness_warning_hours";

export type FreshnessProvider = "search_console" | "analytics";

/** What Google itself does, in plain words — never a guess per surface. */
export const PROVIDER_LAG_SENTENCE: Record<FreshnessProvider, string> = {
  search_console: "Google runs about three days behind",
  analytics: "Google runs about a day behind",
};

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

export function describeFreshness(
  input: FreshnessInput,
): FreshnessDescription {
  const now = input.now ?? new Date();
  const pulled = parseTimestamp(input.pulledAt);
  const pulledHoursAgo = pulled
    ? (now.getTime() - pulled.getTime()) / 3_600_000
    : null;
  const stale =
    input.warningAfterHours !== null &&
    pulledHoursAgo !== null &&
    pulledHoursAgo > input.warningAfterHours;
  const parts: string[] = [
    input.dataThrough
      ? `data through ${formatDay(input.dataThrough)}`
      : "no data stored yet",
    pulled
      ? `pulled ${formatRelativeTime(input.pulledAt, { style: "long" })}`
      : "never pulled",
    PROVIDER_LAG_SENTENCE[input.provider],
  ];
  return {
    sentence: parts.join(" · "),
    pulledHoursAgo,
    stale,
    neverPulled: !pulled,
    thresholdUnavailable:
      input.warningAfterHours === null && pulled
        ? `The staleness threshold is not configured, so this line cannot warn you yet. Seed the ${GOOGLE_MARKETING_KNOB_FEATURE}.${FRESHNESS_WARNING_HOURS_KNOB} knob (migrations/google_marketing_knobs.sql) and apply it.`
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
