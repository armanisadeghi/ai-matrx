/**
 * Pure mappers: database rows -> the view models the components render.
 * No I/O, so every rule here is unit-tested (`__tests__/mappers.test.ts`).
 * Numeric columns arrive as numbers or numeric strings depending on the
 * transport; `num` is the one coercion point and a missing value stays null
 * (rendered "—", never 0).
 */

import { median, outlierMetric, profileBaseline } from "./outlier";
import { canonicalPostUrl } from "./link";
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

/** The designed new-account state: not an error, just not enough history yet. */
export const GROWTH_PENDING_NOTE = "Growth appears after a few days";

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
    return { fraction: null, note: GROWTH_PENDING_NOTE };
  }
  const latest = points[points.length - 1]!;
  const cutoff = latest.t - windowDays * DAY_MS;
  const base =
    [...points].reverse().find((p) => p.t <= cutoff) ?? points[0]!;
  const spanDays = Math.round((latest.t - base.t) / DAY_MS);
  if (spanDays < GROWTH_MIN_SPAN_DAYS) {
    return { fraction: null, note: GROWTH_PENDING_NOTE };
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
  views?: number | null,
  platform?: string | null,
): OutlierInput {
  const metric = outlierMetric(platform);
  return {
    ...(metric !== "views" ? { metric } : {}),
    // `views` here is the value of the platform's PRIMARY metric (saves for Pinterest, likes for Reddit/Threads).
    ...(views === null && stat ? { noViews: true } : {}),
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

/** The stored post's address from the stored post and its author (see `canonicalPostUrl`). */
export function postAddress(post: Pick<SocialPostRow, "platform" | "platform_post_id" | "url">, handle: string | null): string {
  return canonicalPostUrl({ platform: post.platform, platformPostId: post.platform_post_id, handle, url: post.url }) ?? post.url;
}

export function toPostCardModel(args: {
  post: SocialPostRow;
  stat: PostStatRow | null;
  handle: string | null;
  analysisHook?: string | null;
  now?: number;
}): PostCardModel {
  const { post, stat, handle, analysisHook } = args;
  const metric = outlierMetric(post.platform);
  const outlier = outlierInputFrom(stat, post.posted_at, args.now, stat ? num(stat[metric]) : undefined, post.platform);
  return {
    postId: post.id,
    platform: post.platform,
    profileId: post.profile_id,
    handle,
    format: post.format,
    url: postAddress(post, handle),
    thumbnailUrl: post.thumbnail_url,
    thumbnailFileId: post.thumbnail_file_id ?? null,
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

/** Accessible name of a post's open control: who posted it plus a short caption excerpt (never the whole caption). */
export function openPostLabel(handle: string | null | undefined, hookLine: string | null | undefined, max = 60): string {
  const who = handle ? `Open post by @${handle.replace(/^@/, "")}` : "Open post";
  const text = (hookLine ?? "").replace(/\s+/g, " ").trim();
  if (!text) return who;
  const excerpt = text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  return `${who}: ${excerpt}`;
}

/** A YouTube channel id (`UC` + 22 characters): an address, never a name a person would say. */
export function isRawChannelId(handle: string | null | undefined): boolean {
  return /^@?UC[\w-]{22}$/.test((handle ?? "").trim());
}

/**
 * Display name and handle once each: when the name is just the handle, the handle stands alone.
 * A raw YouTube channel id is never shown as a name or a handle: the stored name stands, else "YouTube channel".
 */
export function accountLabels(
  displayName: string,
  handle: string,
  platform?: string | null,
): { primary: string; secondary: string | null } {
  const norm = (v: string) => v.replace(/^@/, "").trim().toLowerCase();
  const name = displayName.trim();
  if (isRawChannelId(handle) && (!platform || platform === "youtube")) {
    return { primary: !name || isRawChannelId(name) ? "YouTube channel" : name, secondary: null };
  }
  const at = handle ? `@${handle.replace(/^@/, "")}` : "";
  if (!name || norm(name) === norm(handle)) return { primary: at || name, secondary: null };
  return { primary: name, secondary: at || null };
}

/** The account's name in a sentence (a confirm, a toast): its name or @handle, never a raw channel id. */
export function accountName(row: { displayName: string; handle: string; platform: string }): string {
  return accountLabels(row.displayName, row.handle, row.platform).primary;
}

/** The person-owner chip says whose account it is; on a person brand every such account is the brand's person, so it adds nothing. */
export function showOwnerChip(row: { ownerKind?: "company" | "person" }, brandKind: "company" | "person"): boolean {
  return row.ownerKind === "person" && brandKind !== "person";
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

/** LAST POST cell text: how long ago the newest post went out; "No posts" when none are stored. Never the outlier no-baseline text. */
export function lastPostLabel(lastPostAt: string | null, postsTracked: number, now = Date.now()): string {
  if (!lastPostAt || !Number.isFinite(Date.parse(lastPostAt))) return postsTracked > 0 ? "—" : "No posts";
  const age = relativeAge(lastPostAt, now);
  return age === "now" ? "just now" : `${age} ago`;
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

export function normalizeHandle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@/, "").toLowerCase();
}

export function buildAccountRows(args: {
  tracked: readonly TrackedAccountRow[];
  profiles: readonly SocialProfileRow[];
  snapshots: readonly Pick<ProfileSnapshotRow, "profile_id" | "observed_at" | "follower_count">[];
  postStats: readonly AccountPostStat[];
  now?: number;
}): AccountRow[] {
  const now = args.now ?? Date.now();
  const profileById = new Map(args.profiles.map((p) => [p.id, p]));
  const rows: AccountRow[] = [];

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
    rows.push({
      rowId: t.id,
      trackedAccountId: t.id,
      profileId: profile.id,
      platform: profile.platform,
      handle: profile.handle,
      displayName: t.label?.trim() || profile.display_name?.trim() || profile.handle,
      avatarUrl: profile.avatar_url,
      avatarFileId: profile.avatar_file_id ?? null,
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

  return rows;
}

/** One row of `social.brand_social_accounts(p_brand_id)`; numerics may arrive as strings. */
export interface BrandSocialAccountRpcRow {
  row_key: string;
  property_id: string | null;
  platform: string;
  handle: string | null;
  url: string | null;
  display_name: string | null;
  property_status: string | null;
  owner_kind: string | null;
  owner_party_id: string | null;
  owner_name: string | null;
  trackable: boolean | null;
  tracked_account_id: string | null;
  tracked_role: string | null;
  tracked_status: string | null;
  tracked_label: string | null;
  profile_id: string | null;
  profile_handle: string | null;
  profile_display_name: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  followers: number | string | null;
  followers_observed_at: string | null;
  followers_30d_ago: number | string | null;
  posts_tracked: number | string | null;
  last_post_at: string | null;
  best_multiple_30d: number | string | null;
  best_post_id_30d: string | null;
  last_refreshed_at: string | null;
  /** The stored avatar copy (files.id); null = none stored, so the avatar door is never asked. */
  avatar_file_id?: string | null;
}

/**
 * The ONE mapping from the brand's social-account read to the row both the Overview card and
 * Socials -> Accounts render. Growth is `followers / followers_30d_ago - 1`; with no 30-day-old
 * snapshot it is null and says so (never 0).
 */
export function brandSocialRowToAccountRow(r: BrandSocialAccountRpcRow): AccountRow {
  const tracked = Boolean(r.tracked_account_id);
  const handle = (r.profile_handle ?? r.handle ?? "").replace(/^@/, "");
  const followers = num(r.followers);
  const before = num(r.followers_30d_ago);
  const growth = tracked && followers !== null && before !== null && before > 0 ? followers / before - 1 : null;
  const display =
    r.tracked_label?.trim() || r.profile_display_name?.trim() || r.display_name?.trim() || handle || r.platform;
  return {
    // Stable across tracking: a property keeps ONE key before and after it is tracked (no remount, no re-sort).
    rowId: r.property_id ? `property:${r.property_id}` : (r.tracked_account_id ?? r.row_key),
    trackedAccountId: r.tracked_account_id,
    profileId: r.profile_id,
    platform: r.platform,
    handle,
    displayName: display,
    avatarUrl: r.avatar_url,
    avatarFileId: r.avatar_file_id ?? null,
    avatarHint: r.avatar_url,
    role: r.tracked_role && isTrackedRole(r.tracked_role) ? r.tracked_role : "own",
    status: tracked ? (r.tracked_status ?? "active") : "not_tracked",
    followers,
    growth,
    growthNote: !tracked ? "Not tracked yet" : growth === null ? "Not enough history yet" : "Last 30 days",
    postsTracked: num(r.posts_tracked) ?? 0,
    medianViews: null,
    bestScore: num(r.best_multiple_30d),
    bestPostId: r.best_post_id_30d,
    lastPostAt: r.last_post_at,
    lastRefreshedAt: r.last_refreshed_at,
    profileUrl: r.profile_url ?? r.url,
    propertyId: r.property_id,
    ownerKind: r.owner_kind === "person" ? "person" : "company",
    ownerName: r.owner_name,
    trackable: Boolean(r.trackable),
    isVerified: Boolean(r.is_verified),
    externalUrl: r.url ?? r.profile_url,
  };
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

/** A calendar day in the reader's own locale, never an ambiguous 10/9/2026: "Oct 9, 2026". */
export function formatDay(value: string | number | Date): string {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

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
 * What a profile refresh did, in one line: "3 new posts, 27 updated", the
 * reuse-window answer, or "no posts returned". Never a silent zero. The cost is
 * not named: a provider charge is a hard cost charged in points, shown only when
 * worth a warning (cost.ts).
 */
export function refreshSummary(r: IngestProfileResult): string {
  if (r.trace?.reused) {
    return "Up to date (refreshed in the last 12 hours)";
  }
  if (r.pages_walked > 0 && r.posts_upserted === 0) return "No posts returned";
  if (typeof r.posts_new === "number") {
    const updated = r.posts_updated ?? Math.max(0, r.posts_upserted - r.posts_new);
    return `${plural(r.posts_new, "new post")}, ${updated} updated`;
  }
  return `${plural(r.posts_upserted, "post")} updated`;
}
