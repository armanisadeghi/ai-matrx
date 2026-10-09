/**
 * What a social tile tells the agent (pure): the surface values of each tile, built from the SAME
 * kind values the tile renders. A chat tile joined by a line receives these in full, so the post's
 * caption, transcript and metrics must be here — `__tests__/social-tile-values.test.ts` fails when
 * one goes missing. A number that is not measured stays null (never 0); a missing transcript says
 * `none` and carries no text.
 */

import type {
  AdCreativeKind,
  OutlierRowKind,
  SocialPostKind,
  SocialProfileKind,
  SwipeCollectionKind,
} from "@/features/marketing/social/kind-models";
import { hookLineOf, num } from "@/features/marketing/social/mappers";
import type {
  SocialAdScopeValues,
  SocialOutlierFeedScopeValues,
  SocialPostScopeValues,
  SocialProfileScopeValues,
  SocialSwipeScopeValues,
} from "@/features/surfaces/manifests/social-tiles.manifest";

export function postScopeValues(post: SocialPostKind): SocialPostScopeValues {
  const stat = post.stat ?? null;
  const caption = post.caption ?? post.title ?? "";
  const hook = hookLineOf({ caption: post.caption ?? null, title: post.title ?? null });
  const transcriptText = post.transcript?.text ?? null;
  const metrics = {
    views: num(stat?.views),
    likes: num(stat?.likes),
    comments: num(stat?.comments),
    shares: num(stat?.shares),
    saves: num(stat?.saves),
    engagement_rate: num(stat?.engagement_rate),
  };
  const outlier = {
    score: num(stat?.outlier_score),
    baseline_views: num(stat?.baseline_views),
    percentile: num(stat?.percentile),
  };
  const status = transcriptText ? "available" : "none";
  return {
    post_loaded: true,
    post_id: post.post_id,
    platform: post.platform,
    ...(post.handle ? { handle: post.handle } : {}),
    ...(post.url ? { url: post.url } : {}),
    ...(post.posted_at ? { posted_at: post.posted_at } : {}),
    ...(post.format ? { format: post.format } : {}),
    hook_line: hook,
    post_text: caption,
    hashtags: post.hashtags ?? [],
    transcript_status: status,
    ...(transcriptText ? { transcript_text: transcriptText } : {}),
    ...(post.transcript?.language ? { transcript_language: post.transcript.language } : {}),
    metrics,
    outlier,
    post_summary: {
      platform: post.platform,
      handle: post.handle ?? null,
      hook_line: hook,
      metrics,
      outlier,
      has_transcript: status === "available",
    },
  };
}

export function profileScopeValues(profile: SocialProfileKind, outliers: readonly OutlierRowKind[]): SocialProfileScopeValues {
  return {
    profile_loaded: true,
    profile_id: profile.profile_id,
    platform: profile.platform,
    handle: profile.handle,
    ...(profile.display_name ? { display_name: profile.display_name } : {}),
    ...(profile.bio ? { bio: profile.bio } : {}),
    follower_count: num(profile.follower_count),
    post_count: num(profile.post_count),
    top_outliers: outliers.map((o) => ({
      post_id: o.post_id,
      hook_line: hookLineOf({ caption: o.caption ?? null, title: null }),
      views: num(o.views),
      score: num(o.outlier_score),
      posted_at: o.posted_at ?? null,
    })),
  };
}

export function outlierFeedScopeValues(rows: readonly OutlierRowKind[]): SocialOutlierFeedScopeValues {
  const posts = rows.map((o) => ({
    post_id: o.post_id,
    platform: o.platform,
    handle: o.handle ?? null,
    hook_line: hookLineOf({ caption: o.caption ?? null, title: null }),
    views: num(o.views),
    outlier_score: num(o.outlier_score),
    percentile: num(o.percentile),
    posted_at: o.posted_at ?? null,
    url: o.url ?? null,
  }));
  return {
    feed_loaded: true,
    post_count: posts.length,
    top_hooks: posts.slice(0, 5).map((p) => p.hook_line),
    posts,
  };
}

export function adScopeValues(ad: AdCreativeKind): SocialAdScopeValues {
  return {
    ad_loaded: true,
    ...(ad.ad_id ? { ad_id: ad.ad_id } : {}),
    library: ad.library,
    ...(ad.advertiser_name ? { advertiser_name: ad.advertiser_name } : {}),
    ...(ad.headline ? { headline: ad.headline } : {}),
    ...(ad.body ? { body: ad.body } : {}),
    ...(ad.cta ? { cta: ad.cta } : {}),
    ...(ad.landing_url ? { landing_url: ad.landing_url } : {}),
    ...(ad.is_active !== null && ad.is_active !== undefined ? { running: ad.is_active } : {}),
    ...(ad.started_at ? { started_at: ad.started_at } : {}),
    ...(ad.ended_at ? { ended_at: ad.ended_at } : {}),
  };
}

export function swipeScopeValues(collection: SwipeCollectionKind): SocialSwipeScopeValues {
  return {
    collection_loaded: true,
    collection_id: collection.collection_id,
    name: collection.name,
    ...(collection.description ? { description: collection.description } : {}),
  };
}
