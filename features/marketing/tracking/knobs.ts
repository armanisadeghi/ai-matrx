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

/**
 * WHERE THE SENTENCE IS READ. The stand-in used to be written for the panel alone — "this panel
 * cannot tell you whether the snapshot below is too old" — and once the reason reached the chips
 * (V-28 NEW-1) that same sentence was printed on the brand's site table, its phone cards and the
 * site record's Connections board, where there is no panel and nothing below (V-29 NEW-2). The
 * surface is an argument now, and it is REQUIRED: a new caller must say where it will be read.
 */
export type TrackingKnobSurface = "panel" | "chip";

export function useTrackingSnapshotMaxAgeHours(surface: TrackingKnobSurface): {
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
          { surface },
        )
      : null,
    isLoading: query.isLoading,
  };
}

/**
 * WHAT CANNOT BE JUDGED, said where it is read. One opening per surface — declared here, once,
 * beside each other — and ONE tail, so the two sentences can never drift into two stand-ins.
 */
const STAND_IN_OPENING: Record<TrackingKnobSurface, string> = {
  /** The tracking panel, which prints the snapshot's own line directly beneath this sentence. */
  panel: "This panel cannot tell you whether the snapshot below is too old",
  /** A chip on a row, a card or a status board: a label, with no snapshot line anywhere near it. */
  chip: "Nothing here can tell you whether this site's last tracking check is too old",
};

/**
 * The visible stand-in. It names the setting, the file that seeds it and what is NOT happening
 * because it could not be read — never a blank line and never a swallowed error (Law 4).
 */
export function trackingKnobStandIn(
  reason: string,
  options: { surface: TrackingKnobSurface },
): string {
  return (
    `${STAND_IN_OPENING[options.surface]}: the ` +
    `${TRACKING_KNOB_FEATURE}.${SNAPSHOT_MAX_AGE_HOURS_KNOB} setting could not be read ` +
    `(${reason}), so nothing here is being called stale. If it persists, tell an administrator ` +
    `that the setting seeded by migrations/google_tracking_knobs.sql is missing or unreadable.`
  );
}
