import type { PostCardModel } from "@/features/marketing/social/types";
import { feedPlan, postLayout, profilePlan, rankPostsForTile, sparklinePath, swipeCols } from "../social-tile-model";

function card(over: Partial<PostCardModel>): PostCardModel {
  return {
    postId: "p",
    platform: "tiktok",
    profileId: "pr",
    handle: "a",
    format: "video",
    url: "https://x",
    thumbnailUrl: null,
    hookLine: "",
    postedAt: null,
    durationSeconds: null,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    isAd: false,
    removed: false,
    outlier: { score: null, baselineViews: null, percentile: null, baselineWindow: null, ageHours: null },
    outlierScore: null,
    percentile: null,
    ...over,
  };
}

describe("rankPostsForTile", () => {
  it("puts the biggest multiple first, then views, then newest; nulls never outrank numbers", () => {
    const ranked = rankPostsForTile([
      card({ postId: "none-old", views: 10, postedAt: "2026-01-01T00:00:00Z" }),
      card({ postId: "big-views", views: 900 }),
      card({ postId: "two-x", outlierScore: 2, views: 5 }),
      card({ postId: "ten-x", outlierScore: 10, views: 1 }),
      card({ postId: "none-new", views: 10, postedAt: "2026-06-01T00:00:00Z" }),
    ]);
    expect(ranked.map((p) => p.postId)).toEqual(["ten-x", "two-x", "big-views", "none-new", "none-old"]);
  });

  it("does not mutate its input", () => {
    const input = [card({ postId: "a", views: 1 }), card({ postId: "b", views: 2 })];
    rankPostsForTile(input);
    expect(input.map((p) => p.postId)).toEqual(["a", "b"]);
  });
});

describe("profilePlan", () => {
  it("a small tile is one row of three thumbnails with no stat strip or sparkline", () => {
    const plan = profilePlan({ w: 330, h: 300 }, 12, 10);
    expect(plan).toMatchObject({ cols: 3, rows: 1, stats: false, spark: false });
    expect(plan.cells).toBe(3);
  });

  it("a large tile shows the stat strip, several rows and the sparkline", () => {
    const plan = profilePlan({ w: 620, h: 800 }, 40, 10);
    expect(plan.stats).toBe(true);
    expect(plan.spark).toBe(true);
    expect(plan.rows).toBeGreaterThanOrEqual(2);
    expect(plan.cols).toBeGreaterThanOrEqual(4);
  });

  it("never plans more cells than there are posts, and no sparkline without a series", () => {
    expect(profilePlan({ w: 620, h: 800 }, 2, 10).cells).toBe(2);
    expect(profilePlan({ w: 620, h: 800 }, 40, 1).spark).toBe(false);
    expect(profilePlan({ w: 620, h: 800 }, 0, 0).cells).toBe(0);
  });
});

describe("layout choices", () => {
  it("splits a wide post tile and stacks a narrow one", () => {
    expect(postLayout({ w: 620, h: 560 })).toBe("split");
    expect(postLayout({ w: 360, h: 560 })).toBe("stack");
    expect(postLayout({ w: 620, h: 240 })).toBe("stack");
  });

  it("a narrow feed is a list and a wide one a grid with more columns as it grows", () => {
    expect(feedPlan({ w: 320, h: 600 }).layout).toBe("list");
    const wide = feedPlan({ w: 900, h: 600 });
    expect(wide.layout).toBe("grid");
    expect(wide.cols).toBeGreaterThan(feedPlan({ w: 420, h: 600 }).cols);
  });

  it("swipe columns stay between two and six", () => {
    expect(swipeCols({ w: 100, h: 300 })).toBe(2);
    expect(swipeCols({ w: 4000, h: 300 })).toBe(6);
  });
});

describe("sparklinePath", () => {
  it("is null below two points", () => {
    expect(sparklinePath([], 100, 40)).toBeNull();
    expect(sparklinePath([{ t: 1, value: 5 }], 100, 40)).toBeNull();
  });

  it("draws rising values from bottom-left to top-right inside the padding", () => {
    const path = sparklinePath(
      [
        { t: 0, value: 10 },
        { t: 10, value: 20 },
      ],
      100,
      40,
      3,
    );
    expect(path).toBe("M3.0 37.0 L97.0 3.0");
  });

  it("draws a flat series as a centred line", () => {
    const path = sparklinePath(
      [
        { t: 0, value: 7 },
        { t: 5, value: 7 },
      ],
      100,
      40,
    );
    expect(path).toBe("M3.0 20.0 L97.0 20.0");
  });
});
