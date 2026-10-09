import type { Json } from "@/types/database.types";
import { socialCaptureOf, socialFactsOf, socialPostCardModel, subjectVoiceOf } from "./socialSource";

const post = {
  id: "s1",
  url: "https://www.instagram.com/reel/abc/",
  title: "Four ways to change human behavior:\n\nTo ...",
  description: null,
  thumbnail_url: null,
  metadata: {
    social: {
      kind: "post", platform: "instagram", handle: "hormozi", format: "reel",
      posted_at: "2026-09-21T06:45:05Z", duration_seconds: 146.8,
      metrics: { views: 3762526, likes: 111279, comments: 1000, shares: null },
      outlier_score: 7.88, baseline_median_views: 477000, baseline_window: 30,
    },
  } as Json,
};

describe("socialFactsOf", () => {
  it("reads a post's engagement and outlier multiple; absent numbers are null, never 0", () => {
    const f = socialFactsOf(post)!;
    expect(f).toMatchObject({ kind: "post", platform: "instagram", views: 3762526, shares: null, outlierScore: 7.88 });
    expect(socialFactsOf({ ...post, metadata: { social: { kind: "post", platform: "x", handle: "a", metrics: {} } } })!.views).toBeNull();
  });
  it("is null for a web source and for a malformed marker", () => {
    expect(socialFactsOf({ ...post, metadata: {} })).toBeNull();
    expect(socialFactsOf({ ...post, metadata: { social: { kind: "other" } } })).toBeNull();
    expect(socialFactsOf({ ...post, metadata: null })).toBeNull();
  });
  it("reads a profile's followers", () => {
    const f = socialFactsOf({
      ...post,
      metadata: { social: { kind: "profile", platform: "tiktok", handle: "hormozi", profile: { followers: 846, verified: false } } },
    })!;
    expect(f).toMatchObject({ kind: "profile", followers: 846, verified: false, outlierScore: null });
  });
});

describe("socialPostCardModel", () => {
  it("feeds the shared post card: score, baseline and age carry through", () => {
    const m = socialPostCardModel(post, socialFactsOf(post)!, Date.parse("2026-09-22T06:45:05Z"));
    expect(m).toMatchObject({ postId: "s1", platform: "instagram", views: 3762526, outlierScore: 7.88, hookLine: "Four ways to change human behavior:" });
    expect(m.outlier).toMatchObject({ score: 7.88, baselineViews: 477000, baselineWindow: 30 });
    expect(m.outlier.ageHours).toBeCloseTo(24, 0);
  });
});

describe("topic metadata readers", () => {
  it("reads the measured speaking style", () => {
    const v = subjectVoiceOf({
      subject_voice: { status: "measured", sample_count: 20, word_count: 2400, confidence: 0.8,
        style: { summary: "Short, direct.", register: "casual", signature_phrases: ["here's the thing"], perspective: { a: 1 } } },
    });
    expect(v).toMatchObject({ status: "measured", summary: "Short, direct.", sampleCount: 20 });
    expect(v!.traits).toEqual([
      { label: "register", value: "casual" },
      { label: "signature phrases", value: "here's the thing" },
    ]);
  });
  it("is null when the stage recorded nothing, and keeps an honest reason when it could not run", () => {
    expect(subjectVoiceOf({ coverage_audit: {} })).toBeNull();
    expect(subjectVoiceOf({ subject_voice: { status: "no_samples", reason: "no posts" } })!.reason).toBe("no posts");
  });
  it("reads the capture outcome per handle", () => {
    const c = socialCaptureOf({ social_capture: { status: "partial", handles: { tiktok: { handle: "h", status: "failed", error: "x" } } } })!;
    expect(c.handles[0]).toMatchObject({ platform: "tiktok", status: "failed", error: "x" });
  });
});
