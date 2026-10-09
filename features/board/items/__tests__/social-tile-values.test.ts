import { socialPostKind, postTranscriptKind, outlierRowKindFromCard } from "@/features/marketing/social/kind-models";
import type { PostCardModel, PostStatRow, PostTranscriptRow, SocialPostRow } from "@/features/marketing/social/types";
import { SOCIAL_POST_SURFACE_NAME, socialPostManifest } from "@/features/surfaces/manifests/social-tiles.manifest";
import { adScopeValues, outlierFeedScopeValues, postScopeValues, profileScopeValues } from "../social-tile-values";

const post = {
  id: "p1",
  platform: "tiktok",
  platform_post_id: "123",
  profile_id: "pr1",
  url: "https://www.tiktok.com/@garyvee/video/123",
  format: "video",
  title: null,
  caption: "Stop scrolling. Nobody tells you this about hiring.\nSecond line",
  hashtags: ["hiring", "growth"],
  mentions: [],
  language: "en",
  posted_at: "2026-10-01T12:00:00Z",
  duration_seconds: 31,
  thumbnail_url: null,
  is_ad: false,
} as unknown as SocialPostRow;

const stat = {
  views: 1_200_000,
  likes: 90_000,
  comments: 1200,
  shares: 4000,
  saves: null,
  engagement_rate: 0.08,
  outlier_score: 4.2,
  baseline_views: 285_000,
  baseline_window: 30,
  percentile: 97,
  velocity_24h: null,
  metrics_observed_at: null,
} as unknown as PostStatRow;

const transcriptRow = {
  text: "Here is the thing about hiring. Nobody tells you to hire slow.",
  segments: [{ text: "Here is the thing about hiring.", start: 0, end: 2 }],
  language: "en",
  provider: "p",
  source: "captions",
  word_count: 12,
} as unknown as PostTranscriptRow;

describe("the social post tile's surface values", () => {
  it("carry the caption, the transcript and the metrics in full", () => {
    const kind = socialPostKind({ post, stat, handle: "garyvee", transcript: postTranscriptKind("p1", transcriptRow) });
    const v = postScopeValues(kind);
    expect(v.post_loaded).toBe(true);
    expect(v.hook_line).toBe("Stop scrolling. Nobody tells you this about hiring.");
    expect(v.post_text).toContain("Second line");
    expect(v.transcript_status).toBe("available");
    expect(v.transcript_text).toBe(transcriptRow.text);
    expect(v.metrics).toMatchObject({ views: 1_200_000, likes: 90_000, comments: 1200, shares: 4000, saves: null });
    expect(v.outlier).toEqual({ score: 4.2, baseline_views: 285_000, percentile: 97 });
    expect(v.post_summary).toMatchObject({ has_transcript: true, handle: "garyvee" });
  });

  it("says none, and sends no text, when there is no transcript", () => {
    const v = postScopeValues(socialPostKind({ post, stat: null, handle: null, transcript: postTranscriptKind("p1", null) }));
    expect(v.transcript_status).toBe("none");
    expect(v).not.toHaveProperty("transcript_text");
    expect(v.metrics).toMatchObject({ views: null, likes: null });
    expect(v.outlier?.score).toBeNull();
  });

  it("only name values the manifest declares", () => {
    const declared = new Set(socialPostManifest.values.map((d) => d.name));
    const v = postScopeValues(socialPostKind({ post, stat, handle: "garyvee", transcript: postTranscriptKind("p1", transcriptRow) }));
    for (const key of Object.keys(v)) expect(declared.has(key)).toBe(true);
    expect(socialPostManifest.surfaceName).toBe(SOCIAL_POST_SURFACE_NAME);
  });
});

describe("the other tiles' surface values", () => {
  it("a profile lists its top outliers with hook, views and score", () => {
    const card = {
      postId: "p1", platform: "tiktok", profileId: "pr1", handle: "garyvee", format: "video", url: "u", thumbnailUrl: null,
      hookLine: "Hook", postedAt: null, durationSeconds: null, views: 10, likes: null, comments: null, shares: null,
      isAd: false, removed: false, outlier: { score: 3, baselineViews: 2, percentile: 90, baselineWindow: 30, ageHours: 100 },
      outlierScore: 3, percentile: 90,
    } satisfies PostCardModel;
    const row = outlierRowKindFromCard(card);
    expect(row).not.toBeNull();
    const feed = outlierFeedScopeValues([row!]);
    expect(feed).toMatchObject({ feed_loaded: true, post_count: 1, top_hooks: ["Hook"] });
    expect(feed.posts?.[0]).toMatchObject({ outlier_score: 3, views: 10 });
    const p = profileScopeValues(
      { profile_id: "pr1", platform: "tiktok", handle: "garyvee", trace: { reused: true }, follower_count: 1000, post_count: null } as never,
      [row!],
    );
    expect(p.follower_count).toBe(1000);
    expect(p.post_count).toBeNull();
    expect(p.top_outliers?.[0]).toMatchObject({ hook_line: "Hook", score: 3 });
  });

  it("an ad carries its copy and whether it still runs", () => {
    const v = adScopeValues({ library: "meta", platform_ad_id: "a1", headline: "H", body: "B", is_active: false } as never);
    expect(v).toMatchObject({ ad_loaded: true, headline: "H", body: "B", running: false });
  });
});
