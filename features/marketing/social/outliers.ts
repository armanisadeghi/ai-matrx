/**
 * Outliers tab — the pure rules (SI-07b1). No I/O; unit-tested in
 * `__tests__/outliers.feed.test.ts`.
 *
 * A watchlist is a `platform.saved_view` row (surface `social.outliers`,
 * `subject_id` = the brand) whose `definition` is the serialized filter below.
 * What it surfaces is `social.watchlist_hit`, one row per (watchlist, post)
 * carrying the organization's triage state. Hits are COMPUTED ON VIEW: the
 * current matches are the filter applied to the brand's posts; a match with no
 * hit row is implicitly `new`. A row is written only when a person marks a post
 * seen, dismissed or saved. Nothing here runs on a schedule.
 */

import { isTrackedRole, type BrandPost, type TrackedRole } from "./types";

const DAY_MS = 86_400_000;

/** Surface key on `platform.saved_view` for Outliers watchlists. */
export const WATCHLIST_SURFACE = "social.outliers";

/**
 * The alerts seam. Alerts (in-app / email / webhook on a new hit) are NOT
 * built: they need an explicit owner approval, and nothing may notify anyone
 * on a schedule. The UI shows a disabled control named after this flag; flip
 * it only when alerts are approved and a server-side evaluation exists.
 */
export const OUTLIER_ALERTS_ENABLED = false;

export const OUTLIER_WINDOWS = [7, 30, 90] as const;
export type OutlierWindow = (typeof OUTLIER_WINDOWS)[number];
export const OUTLIER_MIN_MULTIPLES = [2, 3, 5, 10] as const;

export interface OutlierFilter {
  /** Empty = every platform. */
  platforms: string[];
  /** Empty = every role. */
  roles: TrackedRole[];
  windowDays: OutlierWindow;
  minMultiple: number;
  /** "all" or a post format. */
  format: string;
}

export const DEFAULT_OUTLIER_FILTER: OutlierFilter = {
  platforms: [],
  roles: [],
  windowDays: 30,
  minMultiple: 2,
  format: "all",
};

export type OutlierSort = "multiple" | "views" | "newest";

// ---------------------------------------------------------------------------
// Serialization (the saved_view.definition jsonb)
// ---------------------------------------------------------------------------

export interface WatchlistDefinition {
  v: 1;
  brandId: string;
  filter: OutlierFilter;
}

export function serializeWatchlistDefinition(
  brandId: string,
  filter: OutlierFilter,
): WatchlistDefinition {
  return {
    v: 1,
    brandId,
    filter: {
      platforms: [...new Set(filter.platforms)].sort(),
      roles: [...new Set(filter.roles)].sort(),
      windowDays: filter.windowDays,
      minMultiple: filter.minMultiple,
      format: filter.format,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWindow(value: unknown): value is OutlierWindow {
  return OUTLIER_WINDOWS.some((w) => w === value);
}

/** Defensive: a stale or hand-edited blob resolves to the default filter, never throws. */
export function parseWatchlistDefinition(raw: unknown): {
  brandId: string | null;
  filter: OutlierFilter;
} {
  if (!isRecord(raw)) return { brandId: null, filter: { ...DEFAULT_OUTLIER_FILTER } };
  const f = isRecord(raw.filter) ? raw.filter : {};
  const platforms = Array.isArray(f.platforms)
    ? f.platforms.filter((p): p is string => typeof p === "string")
    : [];
  const roles = Array.isArray(f.roles)
    ? f.roles.filter((r): r is TrackedRole => typeof r === "string" && isTrackedRole(r))
    : [];
  const min = typeof f.minMultiple === "number" && Number.isFinite(f.minMultiple) ? f.minMultiple : DEFAULT_OUTLIER_FILTER.minMultiple;
  return {
    brandId: typeof raw.brandId === "string" ? raw.brandId : null,
    filter: {
      platforms,
      roles,
      windowDays: isWindow(f.windowDays) ? f.windowDays : DEFAULT_OUTLIER_FILTER.windowDays,
      minMultiple: Math.max(0, min),
      format: typeof f.format === "string" && f.format ? f.format : "all",
    },
  };
}

/** True when two filters select the same posts (order-insensitive lists). */
export function sameOutlierFilter(a: OutlierFilter, b: OutlierFilter): boolean {
  return (
    JSON.stringify(serializeWatchlistDefinition("", a)) ===
    JSON.stringify(serializeWatchlistDefinition("", b))
  );
}

// ---------------------------------------------------------------------------
// Filtering + sorting
// ---------------------------------------------------------------------------

/**
 * Posts that beat their creator's baseline under `filter`. A post with no score
 * (not enough history) never passes — "—" is not an outlier.
 */
export function applyOutlierFilter(
  posts: readonly BrandPost[],
  filter: OutlierFilter,
  now = Date.now(),
): BrandPost[] {
  const cutoff = now - filter.windowDays * DAY_MS;
  return posts.filter((p) => {
    if (p.outlierScore === null || p.outlierScore < filter.minMultiple) return false;
    if (filter.platforms.length > 0 && !filter.platforms.includes(p.platform)) return false;
    if (filter.roles.length > 0 && !filter.roles.includes(p.role)) return false;
    if (filter.format !== "all" && p.format !== filter.format) return false;
    const at = p.postedAt ? Date.parse(p.postedAt) : NaN;
    return Number.isFinite(at) && at >= cutoff;
  });
}

export function sortOutliers(posts: readonly BrandPost[], sort: OutlierSort): BrandPost[] {
  const key = (p: BrandPost): number => {
    if (sort === "views") return p.views ?? -Infinity;
    if (sort === "newest") return p.postedAt ? Date.parse(p.postedAt) : -Infinity;
    return p.outlierScore ?? -Infinity;
  };
  return [...posts].sort((a, b) => key(b) - key(a));
}

// ---------------------------------------------------------------------------
// Hits (computed on view)
// ---------------------------------------------------------------------------

export type HitState = "new" | "seen" | "dismissed" | "saved";
export const HIT_STATES: readonly HitState[] = ["new", "seen", "dismissed", "saved"];

export interface HitRowLike {
  post_id: string;
  state: string;
}

export interface ResolvedHit {
  post: BrandPost;
  state: HitState;
}

/** Each current match with its triage state; no hit row means `new`. */
export function resolveHits(
  matches: readonly BrandPost[],
  hitRows: readonly HitRowLike[],
): ResolvedHit[] {
  const byPost = new Map(hitRows.map((h) => [h.post_id, h.state]));
  return matches.map((post) => {
    const raw = byPost.get(post.postId);
    const state: HitState = HIT_STATES.find((s) => s === raw) ?? "new";
    return { post, state };
  });
}

export function countNewHits(hits: readonly ResolvedHit[]): number {
  return hits.filter((h) => h.state === "new").length;
}

/** Dismissed hits hide unless the person asks for them (archived-items law). */
export function visibleHits(hits: readonly ResolvedHit[], showDismissed: boolean): ResolvedHit[] {
  return showDismissed ? [...hits] : hits.filter((h) => h.state !== "dismissed");
}
