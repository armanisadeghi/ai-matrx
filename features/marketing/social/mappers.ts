/**
 * Pure mappers: database rows -> the view models the components render.
 * No I/O, so every rule here is unit-tested (`__tests__/mappers.test.ts`).
 * Numeric columns arrive as numbers or numeric strings depending on the
 * transport; `num` is the one coercion point and a missing value stays null
 * (rendered "—", never 0).
 */

import { handleFromInput } from "./link";
import { median, profileBaseline } from "./outlier";
import type {
  AccountRow,
  IngestProfileResult,
  OutlierInput,
  PostCardModel,
  PostMetricSnapshotRow,
  PostStatRow,
  ProfileSnapshotRow,
  SocialPostRow,
  SocialProfileRow,
  TrackedAccountRow,
  TrackedRole,
} from "./types";
import { isTrackedRole } from "./types";

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export { median };

const DAY_MS = 86_400_000;

/** Fewest days between two snapshots before a growth percentage is honest. */
export const GROWTH_MIN_SPAN_DAYS = 7;

export interface GrowthJudgement {
  /** Fraction (0.031 = +3.1%); null when the comparison is refused. */
  fraction: number | null;
  /** The reason a comparison was refused, or the window it covers. */
  note: string;
}

/**
 * Follower change over `windowDays`. Compares the newest snapshot with the
 * newest one at least `windowDays` old; with no such snapshot it falls back to
 * the oldest one — but only when that span is at least GROWTH_MIN_SPAN_DAYS,
 * and says which span it used. A refused comparison prints its reason and day
 * count, never a percentage over unlike windows.
 */
export function judgeFollowerGrowth(
  snapshots: readonly Pick<ProfileSnapshotRow, "observed_at" | "follower_count">[],
  windowDays = 30,
): GrowthJudgement {
  const points = snapshots
    .map((s) => ({ t: Date.parse(s.observed_at), v: num(s.follower_count) }))
    .filter((p): p is { t: number; v: number } => Number.isFinite(p.t) && p.v !== null)
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) {
    return { fraction: null, note: "Tracking since first snapshot" };
  }
  const latest = points[points.length - 1]!;
  const cutoff = latest.t - windowDays * DAY_MS;
  const base =
    [...points].reverse().find((p) => p.t <= cutoff) ?? points[0]!;
  const spanDays = Math.round((latest.t - base.t) / DAY_MS);
  if (spanDays < GROWTH_MIN_SPAN_DAYS) {
    return { fraction: null, note: `Only ${spanDays} days of snapshots` };
  }
  if (base.v === 0) return { fraction: null, note: "No baseline followers" };
  return {
    fraction: (latest.v - base.v) / base.v,
    note: `Over ${spanDays} days`,
  };
}

/**
 * Current followers: the newest snapshot that HAS a follower count, else the profile row's own
 * count. A snapshot or row with a null count never reads as "no followers".
 */
export function currentFollowers(
  profileCount: unknown,
  snapshots: readonly Pick<ProfileSnapshotRow, "observed_at" | "follower_count">[],
): number | null {
  let best: { t: number; v: number } | null = null;
  for (const s of snapshots) {
    const v = num(s.follower_count);
    const t = Date.parse(s.observed_at);
    if (v !== null && Number.isFinite(t) && (best === null || t > best.t)) best = { t, v };
  }
  return best ? best.v : num(profileCount);
}

export function formatGrowth(fraction: number | null): string {
  if (fraction === null) return "—";
  const pct = Math.round(fraction * 1000) / 10;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function ageHoursOf(postedAt: string | null, now = Date.now()): number | null {
  if (!postedAt) return null;
  const t = Date.parse(postedAt);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : null;
}

export function outlierInputFrom(
  stat: Pick<PostStatRow, "outlier_score" | "baseline_views" | "percentile" | "baseline_window"> | null,
  postedAt: string | null,
  now = Date.now(),
): OutlierInput {
  return {
    score: num(stat?.outlier_score),
    baselineViews: num(stat?.baseline_views),
    percentile: num(stat?.percentile),
    baselineWindow: num(stat?.baseline_window),
    ageHours: ageHoursOf(postedAt, now),
  };
}

/** The hook line: the analysed hook, else the first caption/title line. */
export function hookLineOf(
  post: Pick<SocialPostRow, "caption" | "title">,
  analysisHook?: string | null,
): string {
  const source = analysisHook?.trim() || post.caption?.trim() || post.title?.trim() || "";
  const first = source.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  return first.trim();
}

export function toPostCardModel(args: {
  post: SocialPostRow;
  stat: PostStatRow | null;
  handle: string | null;
  analysisHook?: string | null;
  now?: number;
}): PostCardModel {
  const { post, stat, handle, analysisHook } = args;
  const outlier = outlierInputFrom(stat, post.posted_at, args.now);
  return {
    postId: post.id,
    platform: post.platform,
    profileId: post.profile_id,
    handle,
    format: post.format,
    url: post.url,
    thumbnailUrl: post.thumbnail_url,
    hookLine: hookLineOf(post, analysisHook),
    postedAt: post.posted_at,
    durationSeconds: num(post.duration_seconds),
    views: num(stat?.views),
    likes: num(stat?.likes),
    comments: num(stat?.comments),
    shares: num(stat?.shares),
    isAd: post.is_ad,
    removed: post.status === "removed",
    outlier,
    outlierScore: outlier.score,
    percentile: outlier.percentile,
  };
}

/** `3d`, `5h`, `2mo` — relative posted age; absolute date goes in the tooltip. */
export function relativeAge(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const hours = Math.max(0, (now - t) / 3_600_000);
  if (hours < 1) return "now";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface AccountPostStat {
  profile_id: string | null;
  posted_at: string | null;
  post_id: string;
  views: number | null;
  outlier_score: number | null;
}

export interface OwnPropertyInput {
  id: string;
  kind: string;
  handle: string | null;
  url: string | null;
  display_name: string | null;
}

export function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@/, "").toLowerCase();
}

export function buildAccountRows(args: {
  tracked: readonly TrackedAccountRow[];
  profiles: readonly SocialProfileRow[];
  snapshots: readonly Pick<ProfileSnapshotRow, "profile_id" | "observed_at" | "follower_count">[];
  postStats: readonly AccountPostStat[];
  properties: readonly OwnPropertyInput[];
  now?: number;
}): AccountRow[] {
  const now = args.now ?? Date.now();
  const profileById = new Map(args.profiles.map((p) => [p.id, p]));
  const rows: AccountRow[] = [];
  const trackedPlatformHandles = new Set<string>();

  for (const t of args.tracked) {
    const profile = profileById.get(t.profile_id);
    if (!profile) continue;
    const role: TrackedRole = isTrackedRole(t.role) ? t.role : "inspiration";
    const posts = args.postStats.filter((p) => p.profile_id === profile.id);
    const baseline = profileBaseline(
      posts.map((p) => ({ postedAt: p.posted_at, views: num(p.views) })),
    );
    const recent = posts.filter((p) => {
      const at = p.posted_at ? Date.parse(p.posted_at) : NaN;
      return Number.isFinite(at) && now - at <= 30 * DAY_MS;
    });
    let best: AccountPostStat | null = null;
    for (const p of recent) {
      const s = num(p.outlier_score);
      if (s !== null && (best === null || s > (num(best.outlier_score) ?? -1))) best = p;
    }
    const profileSnaps = args.snapshots.filter((s) => s.profile_id === profile.id);
    const growth = judgeFollowerGrowth(profileSnaps);
    const lastPost = posts
      .map((p) => p.posted_at)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;
    trackedPlatformHandles.add(`${profile.platform}:${normalizeHandle(profile.handle)}`);
    rows.push({
      rowId: t.id,
      trackedAccountId: t.id,
      profileId: profile.id,
      platform: profile.platform,
      handle: profile.handle,
      displayName: t.label?.trim() || profile.display_name?.trim() || profile.handle,
      avatarUrl: profile.avatar_url,
      role,
      status: t.status,
      followers: currentFollowers(profile.follower_count, profileSnaps),
      growth: growth.fraction,
      growthNote: growth.note,
      postsTracked: posts.length,
      medianViews: baseline.medianViews,
      bestScore: best ? num(best.outlier_score) : null,
      bestPostId: best ? best.post_id : null,
      lastPostAt: lastPost,
      lastRefreshedAt: profile.last_refreshed_at,
      profileUrl: profile.profile_url,
      propertyId: t.property_id,
    });
  }

  // Own properties that are not tracked yet still list, so "Own" is complete.
  // Most properties carry only a URL (no handle): the handle comes from it.
  const trackedPropertyIds = new Set(args.tracked.map((t) => t.property_id).filter(Boolean));
  for (const prop of args.properties) {
    const shown = (prop.handle?.trim() || (prop.url ? handleFromInput(prop.url) : "")).replace(/^@/, "");
    const handle = normalizeHandle(shown);
    if (!handle || trackedPropertyIds.has(prop.id) || trackedPlatformHandles.has(`${prop.kind}:${handle}`)) continue;
    rows.push({
      rowId: `property:${prop.id}`,
      trackedAccountId: null,
      profileId: null,
      platform: prop.kind,
      handle: shown,
      displayName: prop.display_name?.trim() || shown,
      avatarUrl: null,
      role: "own",
      status: "not_tracked",
      followers: null,
      growth: null,
      growthNote: "Not tracked yet",
      postsTracked: 0,
      medianViews: null,
      bestScore: null,
      bestPostId: null,
      lastPostAt: null,
      lastRefreshedAt: null,
      profileUrl: prop.url,
      propertyId: prop.id,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Metric series (chart input)
// ---------------------------------------------------------------------------

export type PostMetricKey = "views" | "likes" | "comments" | "shares" | "saves";
export const POST_METRIC_LABELS: Record<PostMetricKey, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
};

export interface SeriesPoint {
  /** Epoch ms. */
  t: number;
  value: number;
}

/** Points for one metric; a null value is a gap (skipped), never a zero. */
export function postMetricSeries(
  snapshots: readonly Pick<PostMetricSnapshotRow, "observed_at" | PostMetricKey>[],
  metric: PostMetricKey,
): SeriesPoint[] {
  return snapshots
    .map((s) => ({ t: Date.parse(s.observed_at), value: num(s[metric]) }))
    .filter((p): p is SeriesPoint => Number.isFinite(p.t) && p.value !== null)
    .sort((a, b) => a.t - b.t);
}

/** Metrics the platform actually supplies (any non-null snapshot value). */
export function availableMetrics(
  snapshots: readonly Pick<PostMetricSnapshotRow, PostMetricKey>[],
): PostMetricKey[] {
  return (Object.keys(POST_METRIC_LABELS) as PostMetricKey[]).filter((k) =>
    snapshots.some((s) => num(s[k]) !== null),
  );
}

export function profileFollowerSeries(
  snapshots: readonly Pick<ProfileSnapshotRow, "observed_at" | "follower_count">[],
): SeriesPoint[] {
  return snapshots
    .map((s) => ({ t: Date.parse(s.observed_at), value: num(s.follower_count) }))
    .filter((p): p is SeriesPoint => Number.isFinite(p.t) && p.value !== null)
    .sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Post list filtering (account detail)
// ---------------------------------------------------------------------------

export type PostSort = "newest" | "multiple" | "views";

export interface PostFilter {
  /** "all" or a post format. */
  format: string;
  /** Days back from now; 0 = all time. */
  windowDays: number;
  /** Minimum multiplier; 0 = any. */
  minMultiple: number;
}

export const DEFAULT_POST_FILTER: PostFilter = { format: "all", windowDays: 0, minMultiple: 0 };

/** Filter then sort. A post with no score never passes a min-multiple filter. */
export function filterAndSortPosts(
  posts: readonly PostCardModel[],
  filter: PostFilter,
  sort: PostSort,
  now = Date.now(),
): PostCardModel[] {
  const cutoff = filter.windowDays > 0 ? now - filter.windowDays * DAY_MS : null;
  const kept = posts.filter((p) => {
    if (filter.format !== "all" && p.format !== filter.format) return false;
    if (cutoff !== null) {
      const at = p.postedAt ? Date.parse(p.postedAt) : NaN;
      if (!Number.isFinite(at) || at < cutoff) return false;
    }
    if (filter.minMultiple > 0 && (p.outlierScore === null || p.outlierScore < filter.minMultiple)) {
      return false;
    }
    return true;
  });
  const key = (p: PostCardModel): number => {
    if (sort === "multiple") return p.outlierScore ?? -Infinity;
    if (sort === "views") return p.views ?? -Infinity;
    return p.postedAt ? Date.parse(p.postedAt) : -Infinity;
  };
  return kept.sort((a, b) => key(b) - key(a));
}

/** Posts per week over the trailing 30 days; null with no dated posts. */
export function postsPerWeek(posts: readonly PostCardModel[], now = Date.now()): number | null {
  const dated = posts.filter((p) => p.postedAt && Number.isFinite(Date.parse(p.postedAt)));
  if (dated.length === 0) return null;
  const recent = dated.filter((p) => now - Date.parse(p.postedAt!) <= 30 * DAY_MS).length;
  return Math.round(((recent / 30) * 7) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Refresh result -> one line
// ---------------------------------------------------------------------------

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * What a profile refresh did, in one line: "3 new posts, 27 updated · 2 credits",
 * the reuse-window answer, or "no posts returned". Never a silent zero.
 */
export function refreshSummary(r: IngestProfileResult): string {
  if (r.trace?.reused) {
    return r.notes?.[0] ?? "Refreshed recently; served from the shared cache, no new fetch";
  }
  const credits =
    (r.trace?.cost_credits ?? 0) + (r.list_trace ?? []).reduce((sum, t) => sum + (t.cost_credits ?? 0), 0);
  const cost = credits > 0 ? ` · ${plural(credits, "credit")}` : "";
  if (r.pages_walked > 0 && r.posts_upserted === 0) return `No posts returned${cost}`;
  if (typeof r.posts_new === "number") {
    const updated = r.posts_updated ?? Math.max(0, r.posts_upserted - r.posts_new);
    return `${plural(r.posts_new, "new post")}, ${updated} updated${cost}`;
  }
  return `${plural(r.posts_upserted, "post")} updated${cost}`;
}
