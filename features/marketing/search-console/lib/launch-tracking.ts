/**
 * New Pages launch tracking — pure helpers (Jest-tested, no IO) over the
 * `web.page.launch_tracking` jsonb column. The workflow this encodes is
 * Arman's: (1) add the page here and request indexing in GSC, (2) wait —
 * the FIRST impression is the milestone victory, (3) track early
 * performance closely while volume is still too low to surface anywhere.
 *
 * `launchLifecycle` is the ONE derivation of a tracked page's stage —
 * chips, sorting, and copy all read it; nothing re-derives day math.
 */

import type { Json } from "@/types/database.types";

/** The stored `web.page.launch_tracking` shape. NULL column = not tracked. */
export interface LaunchTracking {
  /** ISO timestamp when the page was added to the tracker. */
  added_at: string;
  added_by: string;
  /** ISO timestamp when indexing was requested in GSC (step 1 done). */
  indexing_requested_at: string | null;
  notes: string | null;
}

export type LaunchStage =
  | "not_requested"
  | "awaiting_first_impression"
  | "live";

export interface LaunchLifecycle {
  stage: LaunchStage;
  /** Days since the page entered the tracker. */
  daysTracked: number;
  /** Days since indexing was requested (null before step 1). */
  daysSinceRequest: number | null;
  /** Days since the first impression (null until it lands). */
  daysLive: number | null;
  firstImpressionDate: string | null;
}

export function parseLaunchTracking(raw: Json | null): LaunchTracking | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, Json | undefined>;
  const addedAt = record.added_at;
  const addedBy = record.added_by;
  if (typeof addedAt !== "string" || addedAt === "") return null;
  return {
    added_at: addedAt,
    added_by: typeof addedBy === "string" ? addedBy : "",
    indexing_requested_at:
      typeof record.indexing_requested_at === "string"
        ? record.indexing_requested_at
        : null,
    notes: typeof record.notes === "string" ? record.notes : null,
  };
}

export function buildLaunchTracking(input: {
  addedBy: string;
  indexingRequested: boolean;
  notes?: string | null;
  now?: Date;
}): LaunchTracking {
  const nowIso = (input.now ?? new Date()).toISOString();
  return {
    added_at: nowIso,
    added_by: input.addedBy,
    indexing_requested_at: input.indexingRequested ? nowIso : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
  };
}

function daysBetween(fromIso: string, now: Date): number {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((now.getTime() - from) / 86_400_000));
}

/**
 * Derive the lifecycle stage. `firstImpressionDate` comes from
 * `seo.gsc_perf_page_first_dates` (all-history winning-run MIN) — a date
 * BEFORE tracking began still counts as live (the page simply wasn't new).
 */
export function launchLifecycle(
  tracking: LaunchTracking,
  firstImpressionDate: string | null,
  now: Date = new Date(),
): LaunchLifecycle {
  const daysTracked = daysBetween(tracking.added_at, now);
  const daysSinceRequest = tracking.indexing_requested_at
    ? daysBetween(tracking.indexing_requested_at, now)
    : null;
  if (firstImpressionDate) {
    return {
      stage: "live",
      daysTracked,
      daysSinceRequest,
      daysLive: daysBetween(`${firstImpressionDate}T00:00:00Z`, now),
      firstImpressionDate,
    };
  }
  return {
    stage: tracking.indexing_requested_at
      ? "awaiting_first_impression"
      : "not_requested",
    daysTracked,
    daysSinceRequest,
    daysLive: null,
    firstImpressionDate: null,
  };
}

export const LAUNCH_STAGE_LABELS: Record<
  LaunchStage,
  { label: string; description: string }
> = {
  not_requested: {
    label: "Not requested",
    description: "Tracked, but indexing has not been requested in GSC yet",
  },
  awaiting_first_impression: {
    label: "Awaiting first impression",
    description: "Indexing requested — waiting for Google to show it once",
  },
  live: {
    label: "Live in search",
    description: "Google has shown this page — the first victory is in",
  },
};
