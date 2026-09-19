"use client";

/**
 * The tracking knob: `google.tracking.snapshot_max_age_hours` (default 168 — a week).
 *
 * WHAT IT MEANS, and what it is NOT: how old OUR last look at the container may be before the
 * tracking line marks it stale and the Re-check button starts asking to be pressed. It is
 * deliberately not `google.marketing.freshness_warning_hours`, which means "the data PROVIDER is
 * behind" — Google's own reporting lag. A container changes when a person edits it, not on a
 * daily cadence, so the two questions have different right answers and one number cannot serve
 * both (`migrations/google_tracking_knobs.sql` carries the full basis).
 *
 * 🚨 A MISSING ROW RAISES BY DESIGN (`lib/knobs/featureKnobs.ts` has no fallback). This reader
 * turns that raise into `hours: null` plus the reason, which the panel PRINTS — so the line still
 * states when the snapshot was taken and says plainly that it cannot judge whether that is too
 * old. It never invents a default and calls it the organization's setting.
 */

import { useQuery } from "@tanstack/react-query";

import { knobInt } from "@/lib/knobs/featureKnobs";

export const TRACKING_KNOB_FEATURE = "google.tracking";
export const SNAPSHOT_MAX_AGE_HOURS_KNOB = "snapshot_max_age_hours";

/** The value seeded by `migrations/google_tracking_knobs.sql`, for documentation only. */
export const SEEDED_SNAPSHOT_MAX_AGE_HOURS = 168;

export function useTrackingSnapshotMaxAgeHours(): {
  hours: number | null;
  unavailableReason: string | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: [
      "feature-knob",
      TRACKING_KNOB_FEATURE,
      SNAPSHOT_MAX_AGE_HOURS_KNOB,
    ] as const,
    queryFn: () => knobInt(TRACKING_KNOB_FEATURE, SNAPSHOT_MAX_AGE_HOURS_KNOB),
    staleTime: 60_000,
    retry: false,
  });
  return {
    hours: typeof query.data === "number" ? query.data : null,
    unavailableReason: query.isError
      ? trackingKnobStandIn(
          query.error instanceof Error ? query.error.message : String(query.error),
        )
      : null,
    isLoading: query.isLoading,
  };
}

/**
 * The visible stand-in. It names the setting, the file that seeds it and what is NOT happening
 * because it could not be read — never a blank line and never a swallowed error (Law 4).
 */
export function trackingKnobStandIn(reason: string): string {
  return (
    `This panel cannot tell you whether the snapshot below is too old: the ` +
    `${TRACKING_KNOB_FEATURE}.${SNAPSHOT_MAX_AGE_HOURS_KNOB} setting could not be read ` +
    `(${reason}), so nothing here is being called stale. If it persists, tell an administrator ` +
    `that the setting seeded by migrations/google_tracking_knobs.sql is missing or unreadable.`
  );
}
