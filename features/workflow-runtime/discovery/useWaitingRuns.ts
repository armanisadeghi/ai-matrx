"use client";

/**
 * `useWaitingRuns` — the "waiting on you" inbox's data (census #38).
 *
 * The live OpenAPI contract does not expose `GET /runs/waiting` yet. This hook
 * therefore fails closed instead of bypassing the typed client or pretending
 * that another endpoint carries the same projection. Once the route appears
 * in generated `keyof paths`, the intended typed fetch and announcement-driven
 * refetch can be restored from the preceding wip commit.
 *
 * A failed read is a stated error, never an empty list: "nothing is waiting on
 * you" and "we could not check" are opposite answers, and showing the
 * reassuring one for the alarming one is the exact failure this inbox exists
 * to prevent.
 */

import type { WaitingRunRow } from "./waiting";

export interface WaitingRunsState {
  rows: WaitingRunRow[];
  loading: boolean;
  /** Set when the projection could not be read — never rendered as "all clear". */
  error: string | null;
  refresh: () => void;
}

const WAITING_ROUTE_UNAVAILABLE =
  "Could not check what is waiting on you because the live API does not expose the waiting-runs projection yet.";

function refreshUnavailableWaitingRuns(): void {
  // The live contract is immutable for the lifetime of this build. A refresh
  // cannot make an endpoint absent from generated OpenAPI appear.
}

export function useWaitingRuns(): WaitingRunsState {
  return {
    rows: [],
    loading: false,
    error: WAITING_ROUTE_UNAVAILABLE,
    refresh: refreshUnavailableWaitingRuns,
  };
}
