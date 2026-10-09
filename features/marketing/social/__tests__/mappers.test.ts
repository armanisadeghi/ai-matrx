
import {
  buildAccountRows,
  filterAndSortPosts,
  formatGrowth,
  hookLineOf,
  judgeFollowerGrowth,
  lastPostLabel,
  median,
  num,
  postMetricSeries,
  availableMetrics,
  postsPerWeek,
  refreshSummary,
  relativeAge,
  toPostCardModel,
} from "../mappers";
import type { PostCardModel, SocialPostRow, SocialProfileRow, TrackedAccountRow } from "../types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-09T12:00:00Z");
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

describe("num / median", () => {
  it("coerces numeric strings and keeps missing as null", () => {
    expect(num("3.5")).toBe(3.5);
    expect(num(null)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("abc")).toBeNull();
  });
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("follower growth judge", () => {
  it("compares the newest snapshot with one 30 days older", () => {
    const g = judgeFollowerGrowth([
      { observed_at: iso(31), follower_count: 1000 },
      { observed_at: iso(15), follower_count: 1020 },
      { observed_at: iso(0), follower_count: 1100 },
    ]);
    expect(g.fraction).toBeCloseTo(0.1, 5);
    expect(formatGrowth(g.fraction)).toBe("+10.0%");
  });
  it("refuses a span under a week and says why", () => {
    const g = judgeFollowerGrowth([
      { observed_at: iso(3), follower_count: 1000 },
      { observed_at: iso(0), follower_count: 1100 },
    ]);
    expect(g.fraction).toBeNull();
    expect(g.note).toBe("Only 3 days of snapshots");
    expect(formatGrowth(g.fraction)).toBe("—");
  });
  it("one snapshot is not a growth", () => {
    expect(judgeFollowerGrowth([{ observed_at: iso(0), follower_count: 5 }]).fraction).toBeNull();
  });
  it("a zero baseline is refused, not infinity", () => {
    const g = judgeFollowerGrowth([
      { observed_at: iso(40), follower_count: 0 },
      { observed_at: iso(0), follower_count: 10 },
    ]);
    expect(g.fraction).toBeNull();
  });
  it("ignores null follower counts", () => {
    const g = judgeFollowerGrowth([
      { observed_at: iso(40), follower_count: null },
      { observed_at: iso(0), follower_count: 10 },
    ]);
    expect(g.fraction).toBeNull();
  });
});

function profile(over: Partial<SocialProfileRow>): SocialProfileRow {
  return {
    id: "p1",
    platform: "tiktok",
    handle: "mrbeast",
    display_name: "MrBeast",
    follower_count: 143_400_000,
    avatar_url: null,
    profile_url: null,
    last_refreshed_at: iso(1),
    ...over,
  } as SocialProfileRow;
}
function tracked(over: Partial<TrackedAccountRow>): TrackedAccountRow {
  return { id: "t1", profile_id: "p1", role: "inspiration", status: "active", label: null, property_id: null, brand_id: null, ...over } as TrackedAccountRow;
}

describe("account rows", () => {
  const rows = buildAccountRows({
    tracked: [tracked({})],
    profiles: [profile({})],
    snapshots: [
      { profile_id: "p1", observed_at: iso(35), follower_count: 100 },
      { profile_id: "p1", observed_at: iso(0), follower_count: 110 },
    ],
    postStats: [
      { profile_id: "p1", post_id: "a", posted_at: iso(2), views: 100, outlier_score: 3.2 },
      { profile_id: "p1", post_id: "b", posted_at: iso(10), views: 300, outlier_score: 8 },
      { profile_id: "p1", post_id: "c", posted_at: iso(60), views: 200, outlier_score: 20 },
      { profile_id: "other", post_id: "z", posted_at: iso(1), views: 9, outlier_score: 99 },
    ],
    properties: [
      { id: "prop1", kind: "tiktok", handle: "@MrBeast", url: null, display_name: null },
      { id: "prop2", kind: "instagram", handle: "oakstreet", url: "https://instagram.com/oakstreet", display_name: "Oak Street" },
    ],
    now: NOW,
  });

  it("rolls up posts, median views and the best multiple in the last 30 days", () => {
    const row = rows.find((r) => r.trackedAccountId === "t1")!;
    expect(row.postsTracked).toBe(3);
    expect(row.medianViews).toBe(200);
    // the 20x post is 60 days old: only posts in the last 30d count
    expect(row.bestScore).toBe(8);
    expect(row.bestPostId).toBe("b");
    expect(row.growth).toBeCloseTo(0.1, 5);
  });
  it("lists an own property that is not tracked, once", () => {
    const own = rows.filter((r) => r.role === "own");
    expect(own).toHaveLength(1);
    expect(own[0]!.platform).toBe("instagram");
    expect(own[0]!.status).toBe("not_tracked");
    expect(own[0]!.followers).toBeNull();
  });
  it("does not duplicate a property whose handle is already tracked", () => {
    expect(rows.find((r) => r.rowId === "property:prop1")).toBeUndefined();
  });
  it("lists an own property that has only a URL, with the handle from the URL (Data Destruction: 8 of 9)", () => {
    const r = buildAccountRows({
      tracked: [tracked({ property_id: "prop-tracked" })],
      profiles: [profile({})],
      snapshots: [],
      postStats: [],
      properties: [
        { id: "ig", kind: "instagram", handle: null, url: "https://www.instagram.com/datadestruction/", display_name: null },
        { id: "fb", kind: "facebook", handle: null, url: "https://www.facebook.com/DataDestructioninc/", display_name: null },
        { id: "yt", kind: "youtube", handle: null, url: "https://www.youtube.com/c/armansadeghi", display_name: null },
        { id: "prop-tracked", kind: "youtube", handle: null, url: "https://www.youtube.com/channel/UCF4Ku_RBslqV3A36j6KddZQ", display_name: null },
      ],
      now: NOW,
    });
    const own = r.filter((x) => x.status === "not_tracked").map((x) => `${x.platform}:${x.handle}`);
    expect(own).toEqual(["instagram:datadestruction", "facebook:DataDestructioninc", "youtube:armansadeghi"]);
  });
  it("skips a tracked row whose profile cannot be read", () => {
    const r = buildAccountRows({ tracked: [tracked({ profile_id: "gone" })], profiles: [], snapshots: [], postStats: [], properties: [], now: NOW });
    expect(r).toHaveLength(0);
  });
});

function post(over: Partial<PostCardModel>): PostCardModel {
  return {
    postId: "x", platform: "tiktok", profileId: "p1", handle: "h", format: "video", url: "u", thumbnailUrl: null,
    hookLine: "", postedAt: iso(1), durationSeconds: null, views: 1, likes: 1, comments: null, shares: null,
    isAd: false, removed: false, outlier: { score: null, baselineViews: null, percentile: null, baselineWindow: null, ageHours: 24 },
    outlierScore: null, percentile: null, ...over,
  };
}

describe("post filter and sort", () => {
  const posts = [
    post({ postId: "a", format: "video", outlierScore: 5, views: 10, postedAt: iso(2) }),
    post({ postId: "b", format: "image", outlierScore: 1.2, views: 99, postedAt: iso(40) }),
    post({ postId: "c", format: "video", outlierScore: null, views: 50, postedAt: iso(5) }),
  ];
  const f = { format: "all", windowDays: 0, minMultiple: 0 };
  it("sorts by newest, multiple and views", () => {
    expect(filterAndSortPosts(posts, f, "newest", NOW).map((p) => p.postId)).toEqual(["a", "c", "b"]);
    expect(filterAndSortPosts(posts, f, "multiple", NOW).map((p) => p.postId)).toEqual(["a", "b", "c"]);
    expect(filterAndSortPosts(posts, f, "views", NOW).map((p) => p.postId)).toEqual(["b", "c", "a"]);
  });
  it("filters by format and window", () => {
    expect(filterAndSortPosts(posts, { ...f, format: "video" }, "newest", NOW)).toHaveLength(2);
    expect(filterAndSortPosts(posts, { ...f, windowDays: 30 }, "newest", NOW).map((p) => p.postId)).toEqual(["a", "c"]);
  });
  it("a post with no score never passes a min multiple", () => {
    expect(filterAndSortPosts(posts, { ...f, minMultiple: 2 }, "newest", NOW).map((p) => p.postId)).toEqual(["a"]);
  });
  it("posts per week uses the trailing 30 days", () => {
    expect(postsPerWeek(posts, NOW)).toBe(0.5);
    expect(postsPerWeek([], NOW)).toBeNull();
  });
});

describe("post card model", () => {
  const row = {
    id: "p9", platform: "tiktok", profile_id: "p1", format: "video", url: "https://t/1", thumbnail_url: null,
    caption: "\n  First line hook\nsecond line", title: null, posted_at: iso(0.1), duration_seconds: "6.5", is_ad: false, status: "live",
  } as unknown as SocialPostRow;
  it("uses the first caption line as the hook and flags a young post", () => {
    const m = toPostCardModel({
      post: row,
      stat: { views: 1000, likes: 10, comments: null, shares: null, outlier_score: "4.2", baseline_views: "250", percentile: "90", baseline_window: 30 } as never,
      handle: "h",
      now: NOW,
    });
    expect(m.hookLine).toBe("First line hook");
    expect(m.outlierScore).toBe(4.2);
    expect(m.comments).toBeNull();
    expect(m.durationSeconds).toBe(6.5);
    expect(m.outlier.ageHours).toBeLessThan(24);
  });
  it("prefers the analysed hook", () => {
    expect(hookLineOf({ caption: "cap", title: null }, "  Real hook ")).toBe("Real hook");
  });
  it("a removed post is flagged", () => {
    expect(toPostCardModel({ post: { ...row, status: "removed" }, stat: null, handle: null, now: NOW }).removed).toBe(true);
  });
});

describe("metric series", () => {
  const snaps = [
    { observed_at: iso(2), views: 100, likes: null, comments: null, shares: null, saves: null },
    { observed_at: iso(1), views: null, likes: 5, comments: null, shares: null, saves: null },
    { observed_at: iso(0), views: 300, likes: 9, comments: null, shares: null, saves: null },
  ];
  it("skips null values as gaps, never zeros", () => {
    expect(postMetricSeries(snaps, "views").map((p) => p.value)).toEqual([100, 300]);
  });
  it("offers only metrics the platform supplies", () => {
    expect(availableMetrics(snaps)).toEqual(["views", "likes"]);
  });
});

describe("relative age", () => {
  it("formats hours, days and months", () => {
    expect(relativeAge(iso(0.1), NOW)).toBe("2h");
    expect(relativeAge(iso(3), NOW)).toBe("3d");
    expect(relativeAge(iso(65), NOW)).toBe("2mo");
    expect(relativeAge(null, NOW)).toBe("—");
  });
});

describe("refreshSummary", () => {
  const base = {
    profile_id: "p", platform: "tiktok", handle: "h", pages_walked: 1, posts_upserted: 30, post_ids: [], has_more: true,
    trace: { provider: "scrapecreators", fallback_reason: null, cost_credits: 1, reused: false },
    list_trace: [{ provider: "scrapecreators", fallback_reason: null, cost_credits: 1, reused: false }],
    notes: [],
  };
  it("says new vs updated and the cost", () => {
    expect(refreshSummary({ ...base, posts_new: 3, posts_updated: 27 })).toBe("3 new posts, 27 updated · 2 credits");
    expect(refreshSummary({ ...base, posts_new: 1, posts_updated: 29 })).toBe("1 new post, 29 updated · 2 credits");
  });
  it("never answers a silent zero", () => {
    expect(refreshSummary({ ...base, posts_upserted: 0, posts_new: 0, posts_updated: 0 })).toBe("No posts returned · 2 credits");
  });
  it("names the reuse window when nothing was fetched", () => {
    const reused = { ...base, trace: { ...base.trace, reused: true, cost_credits: 0 }, list_trace: [], pages_walked: 0, posts_upserted: 0, notes: ["Refreshed within the last 12h; served from the shared cache."] };
    expect(refreshSummary(reused)).toBe("Refreshed within the last 12h; served from the shared cache.");
  });
});

describe("currentFollowers", () => {
  it("reads the newest snapshot that has a count, never a null one", async () => {
    const { currentFollowers } = await import("../mappers");
    const snaps = [
      { observed_at: "2026-10-09T09:32:58Z", follower_count: 21_400_000 },
      { observed_at: "2026-10-09T09:45:17Z", follower_count: null },
    ];
    expect(currentFollowers(null, snaps)).toBe(21_400_000);
    expect(currentFollowers(5, [])).toBe(5);
    expect(currentFollowers(null, [])).toBeNull();
  });
});

describe("last post label", () => {
  it("shows the age of the newest post, never the outlier no-baseline text", () => {
    expect(lastPostLabel(iso(3), 12, NOW)).toBe("3d ago");
    expect(lastPostLabel(iso(0), 12, NOW)).toBe("just now");
  });
  it("says No posts when none are stored and a dash when posts lack dates", () => {
    expect(lastPostLabel(null, 0, NOW)).toBe("No posts");
    expect(lastPostLabel(null, 4, NOW)).toBe("—");
    expect(lastPostLabel(null, 0, NOW)).not.toMatch(/\+ posts/);
  });
});
