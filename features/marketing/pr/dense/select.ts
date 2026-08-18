/**
 * Press Room selection logic — every filter, sort and count on the console.
 *
 * Pure functions over generated row types, deliberately kept out of the
 * components: the facet rail's counts and the list's contents are computed by
 * the same code, so a facet can never claim "7" and then show five rows. That
 * divergence is the classic dense-console bug and it is designed out here
 * rather than tested for.
 */

import {
  buildEvidenceLedger,
  coverageAngleId,
  urgencyOf,
  type CoverageMentionRow,
  type SourceRequestRow,
  type StoryAngleRow,
} from "./types";

export type AngleSort =
  | "priority"
  | "newsworthiness"
  | "timeliness"
  | "evidence"
  | "recent";

export interface PressFilters {
  q: string;
  angleStatuses: string[];
  actions: string[];
  endowments: string[];
  angleTypes: string[];
  requestStatuses: string[];
  platforms: string[];
  /** only angles with outstanding proof */
  onlyGaps: boolean;
  /** only angles that could be sent today */
  onlyProvable: boolean;
  sort: AngleSort;
}

export const EMPTY_FILTERS: PressFilters = {
  q: "",
  angleStatuses: [],
  actions: [],
  endowments: [],
  angleTypes: [],
  requestStatuses: [],
  platforms: [],
  onlyGaps: false,
  onlyProvable: false,
  sort: "priority",
};

export function activeFilterCount(filters: PressFilters): number {
  return (
    (filters.q ? 1 : 0) +
    filters.angleStatuses.length +
    filters.actions.length +
    filters.endowments.length +
    filters.angleTypes.length +
    filters.requestStatuses.length +
    filters.platforms.length +
    (filters.onlyGaps ? 1 : 0) +
    (filters.onlyProvable ? 1 : 0)
  );
}

function matches(haystack: (string | null)[], needle: string): boolean {
  if (!needle) return true;
  const term = needle.toLowerCase();
  return haystack.some((value) => value?.toLowerCase().includes(term));
}

function inSet(selected: string[], value: string): boolean {
  return selected.length === 0 || selected.includes(value);
}

/* ── angles ───────────────────────────────────────────────────────────────── */

export function filterAngles(
  angles: StoryAngleRow[],
  filters: PressFilters,
): StoryAngleRow[] {
  return angles.filter((row) => {
    if (!inSet(filters.angleStatuses, row.status)) return false;
    if (!inSet(filters.actions, row.recommended_action)) return false;
    if (!inSet(filters.endowments, row.endowment)) return false;
    if (!inSet(filters.angleTypes, row.angle_type)) return false;

    if (filters.onlyGaps || filters.onlyProvable) {
      const ledger = buildEvidenceLedger(row);
      if (filters.onlyGaps && ledger.provable) return false;
      if (filters.onlyProvable && !ledger.provable) return false;
    }

    return matches(
      [row.headline, row.summary, row.why_now, row.target_beat, row.angle_key],
      filters.q,
    );
  });
}

export function sortAngles(
  angles: StoryAngleRow[],
  sort: AngleSort,
): StoryAngleRow[] {
  const copy = [...angles];
  switch (sort) {
    case "newsworthiness":
      return copy.sort((a, b) => b.newsworthiness - a.newsworthiness);
    case "timeliness":
      return copy.sort((a, b) => b.timeliness - a.timeliness);
    case "evidence":
      // Least-proven first: this is the "what do I have to go and get" order.
      return copy.sort(
        (a, b) =>
          buildEvidenceLedger(a).ratio - buildEvidenceLedger(b).ratio ||
          b.priority - a.priority,
      );
    case "recent":
      return copy.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
    case "priority":
    default:
      return copy.sort((a, b) => b.priority - a.priority);
  }
}

export function countBy<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/* ── requests ─────────────────────────────────────────────────────────────── */

export function filterRequests(
  requests: SourceRequestRow[],
  filters: PressFilters,
): SourceRequestRow[] {
  return requests.filter((row) => {
    if (!inSet(filters.requestStatuses, row.status)) return false;
    if (!inSet(filters.platforms, row.platform)) return false;
    return matches(
      [
        row.query_title,
        row.query_body,
        row.outlet,
        row.journalist_name,
        row.beat,
        row.match_reason,
      ],
      filters.q,
    );
  });
}

/**
 * Deadline order, with closed states pushed to the bottom.
 *
 * A submitted or won request has no time pressure left, so ordering it by an
 * elapsed deadline would put finished work at the top of a queue.
 */
export function sortRequests(
  requests: SourceRequestRow[],
  now: number,
): SourceRequestRow[] {
  const open = new Set(["new", "matched", "drafted"]);
  return [...requests].sort((a, b) => {
    const aOpen = open.has(a.status);
    const bOpen = open.has(b.status);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const aLeft = urgencyOf(a.deadline_at, now).msLeft;
    const bLeft = urgencyOf(b.deadline_at, now).msLeft;
    if (aLeft === null) return 1;
    if (bLeft === null) return -1;
    return aLeft - bLeft;
  });
}

/* ── coverage ─────────────────────────────────────────────────────────────── */

export function filterCoverage(
  coverage: CoverageMentionRow[],
  filters: PressFilters,
): CoverageMentionRow[] {
  return coverage.filter((row) =>
    matches(
      [row.title, row.domain, row.author_name, row.key_quote, row.hit_reason],
      filters.q,
    ),
  );
}

export function sortCoverage(coverage: CoverageMentionRow[]): CoverageMentionRow[] {
  return [...coverage].sort(
    (a, b) =>
      new Date(b.published_at ?? b.discovered_at).getTime() -
      new Date(a.published_at ?? a.discovered_at).getTime(),
  );
}

/* ── cross-record joins ───────────────────────────────────────────────────── */

export function requestsForAngle(
  requests: SourceRequestRow[],
  angleId: string,
): SourceRequestRow[] {
  return requests.filter((row) => row.story_angle_id === angleId);
}

export function coverageForAngle(
  coverage: CoverageMentionRow[],
  angleId: string,
): CoverageMentionRow[] {
  return coverage.filter((row) => coverageAngleId(row) === angleId);
}

/** Coverage we found but cannot attribute to any angle we know about. */
export function unattributedCoverage(
  coverage: CoverageMentionRow[],
  angles: StoryAngleRow[],
): CoverageMentionRow[] {
  const known = new Set(angles.map((row) => row.id));
  return coverage.filter((row) => {
    if (row.is_competitor) return false;
    const id = coverageAngleId(row);
    return !id || !known.has(id);
  });
}

/* ── headline numbers for the status bar ──────────────────────────────────── */

export interface PressTotals {
  angles: number;
  pitchable: number;
  blockedOnProof: number;
  quickWins: number;
  openRequests: number;
  closingToday: number;
  landed: number;
  coverageOurs: number;
}

export function computeTotals(
  angles: StoryAngleRow[],
  requests: SourceRequestRow[],
  coverage: CoverageMentionRow[],
  now: number,
): PressTotals {
  const live = angles.filter((row) => row.status !== "dismissed");
  const ledgers = live.map(buildEvidenceLedger);
  const open = new Set(["new", "matched", "drafted"]);
  const openRequests = requests.filter((row) => open.has(row.status));

  return {
    angles: live.length,
    pitchable: ledgers.filter((ledger) => ledger.provable).length,
    blockedOnProof: ledgers.filter((ledger) => !ledger.provable).length,
    quickWins: ledgers.reduce(
      (sum, ledger) => sum + ledger.quickWins.length,
      0,
    ),
    openRequests: openRequests.length,
    closingToday: openRequests.filter((row) => {
      const bucket = urgencyOf(row.deadline_at, now).bucket;
      return bucket === "critical" || bucket === "today";
    }).length,
    landed: angles.filter((row) => row.status === "landed").length,
    coverageOurs: coverage.filter((row) => !row.is_competitor).length,
  };
}
