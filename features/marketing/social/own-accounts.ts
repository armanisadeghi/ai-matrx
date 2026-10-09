/**
 * Which of a brand's own social properties can be tracked now, and what to say when none can.
 * Pure: the KPI empty state and the Accounts tab share one answer (no copy of this logic in a
 * component).
 */

import { TRACKABLE_PLATFORMS, type AccountRow } from "./types";

/** Own property rows the server can track now (its platform is wired). */
export function trackableOwn(row: AccountRow): boolean {
  return !row.trackedAccountId && Boolean(row.propertyId) && row.trackable !== false && TRACKABLE_PLATFORMS.has(row.platform);
}

export type OwnTrackingState =
  /** At least one own property can be tracked now: offer "Track own accounts". */
  | { kind: "trackable"; rows: AccountRow[] }
  /** Own properties exist but every one is on a platform the server cannot read yet. */
  | { kind: "coming"; platforms: string[] }
  /** No own property to track at all: offer to add an account. */
  | { kind: "none" };

export function ownTrackingState(rows: readonly AccountRow[]): OwnTrackingState {
  const trackable = rows.filter(trackableOwn);
  if (trackable.length > 0) return { kind: "trackable", rows: trackable };
  const waiting = rows.filter((r) => !r.trackedAccountId && Boolean(r.propertyId));
  if (waiting.length > 0) return { kind: "coming", platforms: [...new Set(waiting.map((r) => r.platform))] };
  return { kind: "none" };
}
