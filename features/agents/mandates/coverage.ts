"use client";

// features/agents/mandates/coverage.ts
//
// COVERAGE — the scoreboard FALLBACK-MANDATES.md §The cost demands: for every
// live mandate, is somebody actually assigned to it?
//
//   green   Assigned          an enabled binding, or its own default holder
//   orange  Running on fallback  nothing assigned here; another mandate's
//                                holder is carrying it — that leader is NAMED
//   red     Nothing assigned  no holder and no fallback that resolves
//
// Server truth, never re-derived here. TWO shapes of the SAME classification
// (aidream services/mandates/coverage.py — one implementation, two payloads):
//
//   GET /mandates/coverage         super-admin scoreboard. Counts + the NAMED
//                                  orange and red rows; green is counted only,
//                                  because 300+ silent rows are not a work queue.
//   GET /mandates/coverage/states  authenticated, one verdict per mandate, for
//                                  the per-ROW badge on the user-facing lists.
//                                  Green is SAID here, so a badge never has to
//                                  guess: a key missing from `states` means the
//                                  report does not answer for it (an org-scoped
//                                  report skips mandates that org does not own),
//                                  never "assigned".
//
// The words on screen are the platform's: Mandate · Holder · assigned ·
// fallback. Never "job", never "coverage state".

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import type { components } from "@/types/python-generated/api-types";

export type MandateCoverageResponse =
  components["schemas"]["MandateCoverageResponse"];
export type MandateCoverageOrangeRow =
  components["schemas"]["MandateCoverageOrangeRow"];
export type MandateCoverageRedRow =
  components["schemas"]["MandateCoverageRedRow"];
export type MandateCoverageStatesResponse =
  components["schemas"]["MandateCoverageStatesResponse"];
export type MandateCoverageStateRow =
  components["schemas"]["MandateCoverageState"];

/** The three buckets, in worst-last reading order (green · orange · red). */
export type MandateCoverageBucket = "green" | "orange" | "red";

export interface MandateCoverageBucketMeta {
  /** The tile's label — Arman's vocabulary, no coined words. */
  label: string;
  /** The tooltip: what the bucket MEANS, in one sentence. */
  description: string;
  /** Tile ring + count colour. */
  toneClassName: string;
  iconClassName: string;
}

export const COVERAGE_META: Record<
  MandateCoverageBucket,
  MandateCoverageBucketMeta
> = {
  green: {
    label: "Assigned",
    description:
      "A Holder is assigned to this Mandate — its own default, or an org/user binding.",
    toneClassName:
      "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
  orange: {
    label: "Running on fallback",
    description:
      "Nothing is assigned here — another Mandate's Holder is carrying it. Named below.",
    toneClassName: "border-amber-500/40 text-amber-700 dark:text-amber-400",
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
  red: {
    label: "Nothing assigned",
    description:
      "No Holder and no fallback that resolves — this Mandate cannot run.",
    toneClassName: "border-rose-500/40 text-rose-700 dark:text-rose-400",
    iconClassName: "text-rose-600 dark:text-rose-400",
  },
};

/**
 * Per-mandate bucket lookup, so a row can wear its own coverage badge without
 * every row re-scanning the orange/red arrays.
 *
 * Green is the DEFAULT, not an assertion: the payload names only orange and
 * red, so a key absent from both is green by construction — the same rule the
 * server used to count them.
 */
export type MandateCoverageIndex = Readonly<
  Record<
    string,
    | { bucket: "orange"; leaderKey: string | null; reason: string }
    | { bucket: "red"; reason: string }
  >
>;

export function buildCoverageIndex(
  report: MandateCoverageResponse,
): MandateCoverageIndex {
  const index: Record<
    string,
    | { bucket: "orange"; leaderKey: string | null; reason: string }
    | { bucket: "red"; reason: string }
  > = {};
  for (const row of report.orange) {
    index[row.mandate_key] = {
      bucket: "orange",
      leaderKey: row.leader_key,
      reason: row.reason,
    };
  }
  // Red wins a collision — the server cannot emit a key in both, but a badge
  // that silently downgrades "cannot run" to "fallback" is the wrong failure.
  for (const row of report.red) {
    index[row.mandate_key] = { bucket: "red", reason: row.reason };
  }
  return index;
}

export function coverageBucketOf(
  index: MandateCoverageIndex,
  mandateKey: string,
): MandateCoverageBucket {
  return index[mandateKey]?.bucket ?? "green";
}

/**
 * The live board. Super-admin gated server-side; a non-admin caller gets the
 * error verbatim rather than an empty board that reads as "nothing wrong".
 */
export async function fetchMandateCoverage(
  dispatch: AppDispatch,
): Promise<MandateCoverageResponse> {
  const response = await dispatch(
    callApi({ path: "/mandates/coverage", method: "GET" }),
  );
  if (response.error) throw new Error(response.error.message);
  // Ingress validation — an empty board that reads as "nothing unassigned" is
  // the one failure this feature must never produce.
  if (!isCoverageReport(response.data)) {
    throw new Error(
      "GET /mandates/coverage did not return a coverage report — coverage is unknown, not clean.",
    );
  }
  return response.data;
}

// ---------------------------------------------------------------------------
// The per-ROW half — what a LIST badge reads.
// ---------------------------------------------------------------------------

/**
 * Verdict per mandate key. A key that is ABSENT is unanswered, not assigned —
 * that distinction is the whole reason this shape exists (see the header).
 */
export type MandateCoverageStateIndex = ReadonlyMap<
  string,
  MandateCoverageStateRow
>;

export function buildCoverageStateIndex(
  report: MandateCoverageStatesResponse,
): MandateCoverageStateIndex {
  return new Map(report.states.map((row) => [row.mandate_key, row]));
}

/** The mandate keys in one bucket — what a badge click filters the list to. */
export function coverageKeysInBucket(
  report: MandateCoverageStatesResponse,
  bucket: MandateCoverageBucket,
): string[] {
  return report.states
    .filter((row) => row.state === bucket)
    .map((row) => row.mandate_key);
}

/**
 * One verdict per mandate, for a list surface's per-row badge.
 *
 * `organizationId` scopes the report to ONE owner's mandates (law 5: screams
 * follow ownership) — the org mandate list passes its own org, and the server
 * verifies membership. Omit it for the whole live registry.
 */
export async function fetchMandateCoverageStates(
  dispatch: AppDispatch,
  organizationId?: string | null,
): Promise<MandateCoverageStatesResponse> {
  const response = await dispatch(
    callApi({
      path: "/mandates/coverage/states",
      method: "GET",
      queryParams: organizationId
        ? { organization_id: organizationId }
        : undefined,
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isCoverageStatesReport(response.data)) {
    throw new Error(
      "GET /mandates/coverage/states did not return coverage verdicts — coverage is unknown, not clean.",
    );
  }
  return response.data;
}

function isCoverageStatesReport(
  value: unknown,
): value is MandateCoverageStatesResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as { states?: unknown; counts?: unknown };
  if (!Array.isArray(body.states)) return false;
  const counts = body.counts as { green?: unknown } | undefined;
  if (typeof counts !== "object" || counts === null) return false;
  if (typeof counts.green !== "number") return false;
  return body.states.every((row) => {
    const state = (row as { mandate_key?: unknown; state?: unknown }) ?? {};
    return (
      typeof state.mandate_key === "string" &&
      (state.state === "green" ||
        state.state === "orange" ||
        state.state === "red")
    );
  });
}

function isCoverageReport(value: unknown): value is MandateCoverageResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as {
    counts?: unknown;
    orange?: unknown;
    red?: unknown;
    computed_at?: unknown;
  };
  const counts = body.counts as
    | { green?: unknown; orange?: unknown; red?: unknown }
    | undefined;
  return (
    typeof counts === "object" &&
    counts !== null &&
    typeof counts.green === "number" &&
    typeof counts.orange === "number" &&
    typeof counts.red === "number" &&
    Array.isArray(body.orange) &&
    Array.isArray(body.red) &&
    typeof body.computed_at === "string"
  );
}
