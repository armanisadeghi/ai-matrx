/**
 * Rows -> the registered kind values (`social_post`, `social_profile`, `outlier_row`,
 * `ad_creative`, `swipe_collection`, `post_transcript`) — pure, unit-tested.
 *
 * The kinds are the contract between a stored row, the one canonical component
 * of that kind (`components/mardown-display/blocks/social-kinds/`) and the board
 * tiles' agent surfaces. The shapes come from the registry (`kind-payload`), never
 * from a hand-written twin. A row is read as a person under RLS; nothing here
 * invents a field the row does not hold ("—" is a null, never a zero).
 */

import type { KindPayload, PartialKind } from "@/features/content-ir/kinds/kind-payload";

import { hookLineOf, num, outlierInputFrom, postAddress } from "./mappers";
import type {
  PostCardModel,
  PostStatRow,
  PostTranscriptRow,
  SocialAdRow,
  SocialPostRow,
  SocialProfileRow,
  SwipeCollectionRow,
  WatchlistHitRow,
} from "./types";

export type SocialPostKind = KindPayload<"social_post">;
export type SocialProfileKind = KindPayload<"social_profile">;
export type PostTranscriptKind = KindPayload<"post_transcript">;
export type OutlierRowKind = KindPayload<"outlier_row">;
export type AdCreativeKind = KindPayload<"ad_creative">;
export type SwipeCollectionKind = KindPayload<"swipe_collection">;

const STORED_TRACE = {
  provider: "stored",
  fallback_reason: null,
  cost_credits: 0,
  reused: true,
} as const;

function segmentsOf(value: unknown): PostTranscriptKind["segments"] {
  if (!Array.isArray(value)) return null;
  const out: NonNullable<PostTranscriptKind["segments"]> = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.text !== "string") continue;
    out.push({ text: r.text, start: num(r.start), end: num(r.end) });
  }
  return out;
}

/** A stored transcript row (or its absence) as the `post_transcript` kind. */
export function postTranscriptKind(
  postId: string,
  row: PostTranscriptRow | null,
): PostTranscriptKind {
  if (!row) {
    return { status: "none", post_id: postId, notes: [] };
  }
  return {
    status: "available",
    post_id: postId,
    text: row.text,
    segments: segmentsOf(row.segments),
    language: row.language,
    provider: row.provider,
    source: row.source,
    word_count: row.word_count ?? row.text.split(/\s+/).filter(Boolean).length,
    reused: true,
    notes: [],
  };
}

export function socialPostKind(args: {
  post: SocialPostRow;
  stat: PostStatRow | null;
  handle: string | null;
  transcript?: PostTranscriptKind | null;
}): SocialPostKind {
  const { post, stat } = args;
  return {
    post_id: post.id,
    platform: post.platform,
    platform_post_id: post.platform_post_id,
    trace: { ...STORED_TRACE },
    profile_id: post.profile_id,
    handle: args.handle,
    url: postAddress(post, args.handle),
    format: post.format,
    title: post.title,
    caption: post.caption,
    hashtags: post.hashtags ?? [],
    mentions: post.mentions ?? [],
    language: post.language,
    posted_at: post.posted_at,
    duration_seconds: num(post.duration_seconds),
    thumbnail_url: post.thumbnail_url,
    thumbnail_file_id: post.thumbnail_file_id ?? null,
    is_ad: post.is_ad,
    media: [],
    media_notes: [],
    stat: stat
      ? {
          views: num(stat.views),
          likes: num(stat.likes),
          comments: num(stat.comments),
          shares: num(stat.shares),
          saves: num(stat.saves),
          engagement_rate: num(stat.engagement_rate),
          outlier_score: num(stat.outlier_score),
          baseline_views: num(stat.baseline_views),
          baseline_window: num(stat.baseline_window),
          percentile: num(stat.percentile),
          velocity_24h: num(stat.velocity_24h),
          metrics_observed_at: stat.metrics_observed_at,
        }
      : null,
    transcript: args.transcript ?? null,
  };
}

export function socialProfileKind(row: SocialProfileRow, postIds: readonly string[] = []): SocialProfileKind {
  return {
    profile_id: row.id,
    platform: row.platform,
    handle: row.handle,
    trace: { ...STORED_TRACE },
    display_name: row.display_name,
    bio: row.bio,
    category: row.category,
    avatar_url: row.avatar_url,
    profile_url: row.profile_url,
    external_url: row.external_url,
    is_verified: row.is_verified,
    is_business: row.is_business,
    follower_count: num(row.follower_count),
    following_count: num(row.following_count),
    post_count: num(row.post_count),
    total_likes: num(row.total_likes),
    post_ids: [...postIds],
    pages_walked: 0,
    posts_upserted: 0,
    has_more: false,
    notes: [],
  };
}

/** One outlier-feed row: a post of a tracked account with its stat (null score = not an outlier row). */
export function outlierRowKind(args: {
  post: SocialPostRow;
  stat: PostStatRow;
  handle: string | null;
  role?: string | null;
}): OutlierRowKind | null {
  const score = num(args.stat.outlier_score);
  if (score === null || !args.post.profile_id) return null;
  return {
    post_id: args.post.id,
    platform: args.post.platform,
    profile_id: args.post.profile_id,
    outlier_score: score,
    handle: args.handle,
    role: args.role ?? null,
    url: postAddress(args.post, args.handle),
    format: args.post.format,
    caption: args.post.caption,
    posted_at: args.post.posted_at,
    thumbnail_url: args.post.thumbnail_url,
    thumbnail_file_id: args.post.thumbnail_file_id ?? null,
    views: num(args.stat.views),
    baseline_views: num(args.stat.baseline_views),
    percentile: num(args.stat.percentile),
    velocity_24h: num(args.stat.velocity_24h),
    engagement_rate: num(args.stat.engagement_rate),
  };
}

export function adCreativeKind(row: SocialAdRow): AdCreativeKind {
  const impressions = row.impressions_range as { max?: unknown; min?: unknown } | null;
  return {
    library: row.library,
    platform_ad_id: row.platform_ad_id,
    ad_id: row.id,
    advertiser_id: row.advertiser_platform_id,
    advertiser_name: row.advertiser_name,
    headline: row.headline,
    body: row.body,
    cta: row.cta,
    landing_url: row.landing_url,
    url: row.library_url,
    format: row.format,
    is_active: row.status === "active",
    started_at: row.started_at,
    ended_at: row.ended_at,
    impressions: num(impressions?.max ?? impressions?.min),
    media: [],
  };
}

export function swipeCollectionKind(row: SwipeCollectionRow): SwipeCollectionKind {
  return {
    collection_id: row.id,
    name: row.name,
    description: row.description,
    brand_id: row.brand_id,
  };
}

/** A watchlist hit's post ids, newest first, for the outlier feed's read. */
export function hitPostIds(hits: readonly Pick<WatchlistHitRow, "post_id" | "hit_at">[]): string[] {
  return [...hits]
    .sort((a, b) => Date.parse(b.hit_at) - Date.parse(a.hit_at))
    .map((h) => h.post_id);
}

// ---------------------------------------------------------------------------
// Kind value -> the card the one post card renders (a mid-stream value is a
// normal state, so every read is defensive)
// ---------------------------------------------------------------------------

export function postCardModelFromKind(
  value: PartialKind<SocialPostKind>,
  now = Date.now(),
): PostCardModel {
  const stat = value.stat ?? null;
  return {
    postId: value.post_id ?? "",
    platform: value.platform ?? "",
    profileId: value.profile_id ?? null,
    handle: value.handle ?? null,
    format: value.format ?? "video",
    url: value.url ?? "",
    thumbnailUrl: value.thumbnail_url ?? null,
    thumbnailFileId: value.thumbnail_file_id ?? null,
    hookLine: hookLineOf({ caption: value.caption ?? null, title: value.title ?? null }),
    postedAt: value.posted_at ?? null,
    durationSeconds: num(value.duration_seconds),
    views: num(stat?.views),
    likes: num(stat?.likes),
    comments: num(stat?.comments),
    shares: num(stat?.shares),
    isAd: value.is_ad === true,
    removed: false,
    outlier: outlierInputFrom(
      stat
        ? {
            outlier_score: num(stat.outlier_score),
            baseline_views: num(stat.baseline_views),
            percentile: num(stat.percentile),
            baseline_window: num(stat.baseline_window),
          }
        : null,
      value.posted_at ?? null,
      now,
    ),
    outlierScore: num(stat?.outlier_score),
    percentile: num(stat?.percentile),
  };
}

/** The same card for an outlier-feed row (it carries the post's own numbers). */
export function postCardModelFromOutlierRow(
  value: PartialKind<OutlierRowKind>,
  now = Date.now(),
): PostCardModel {
  return {
    postId: value.post_id ?? "",
    platform: value.platform ?? "",
    profileId: value.profile_id ?? null,
    handle: value.handle ?? null,
    format: value.format ?? "video",
    url: value.url ?? "",
    thumbnailUrl: value.thumbnail_url ?? null,
    thumbnailFileId: value.thumbnail_file_id ?? null,
    hookLine: hookLineOf({ caption: value.caption ?? null, title: null }),
    postedAt: value.posted_at ?? null,
    durationSeconds: null,
    views: num(value.views),
    likes: null,
    comments: null,
    shares: null,
    isAd: false,
    removed: false,
    outlier: outlierInputFrom(
      {
        outlier_score: num(value.outlier_score),
        baseline_views: num(value.baseline_views),
        percentile: num(value.percentile),
        baseline_window: null,
      },
      value.posted_at ?? null,
      now,
    ),
    outlierScore: num(value.outlier_score),
    percentile: num(value.percentile),
  };
}

/** An outlier-feed row from a post card (the card already carries the post's own numbers). */
export function outlierRowKindFromCard(card: PostCardModel, role?: string | null): OutlierRowKind | null {
  if (card.outlierScore === null || !card.profileId) return null;
  return {
    post_id: card.postId,
    platform: card.platform,
    profile_id: card.profileId,
    outlier_score: card.outlierScore,
    handle: card.handle,
    role: role ?? null,
    url: card.url,
    format: card.format,
    caption: card.hookLine,
    posted_at: card.postedAt,
    thumbnail_url: card.thumbnailUrl,
    thumbnail_file_id: card.thumbnailFileId,
    views: card.views,
    baseline_views: card.outlier.baselineViews,
    percentile: card.percentile,
    velocity_24h: null,
    engagement_rate: null,
  };
}
