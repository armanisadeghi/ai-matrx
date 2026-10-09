
import {
  brandSocialRowToAccountRow,
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
  it("skips a tracked row whose profile cannot be read", () => {
    const r = buildAccountRows({ tracked: [tracked({ profile_id: "gone" })], profiles: [], snapshots: [], postStats: [], now: NOW });
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
  it("carries the stored thumbnail id (the stable field), null when none was stored", () => {
    const stored = { ...row, thumbnail_file_id: "f1c6e7a0-0000-4000-8000-000000000001" } as unknown as SocialPostRow;
    expect(toPostCardModel({ post: stored, stat: null, handle: null, now: NOW }).thumbnailFileId).toBe("f1c6e7a0-0000-4000-8000-000000000001");
    expect(toPostCardModel({ post: row, stat: null, handle: null, now: NOW }).thumbnailFileId).toBeNull();
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
  it("says new vs updated, never vendor credits", () => {
    expect(refreshSummary({ ...base, posts_new: 3, posts_updated: 27 })).toBe("3 new posts, 27 updated");
    expect(refreshSummary({ ...base, posts_new: 1, posts_updated: 29 })).toBe("1 new post, 29 updated");
  });
  it("never answers a silent zero", () => {
    expect(refreshSummary({ ...base, posts_upserted: 0, posts_new: 0, posts_updated: 0 })).toBe("No posts returned");
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

describe("brand social account rows (brand_social_accounts)", () => {
  const base = {
    row_key: "prop1", property_id: "prop1", platform: "instagram", handle: "datadestruction",
    url: "https://www.instagram.com/datadestruction/", display_name: null, property_status: "active",
    owner_kind: "company", owner_party_id: null, owner_name: null, trackable: true,
    tracked_account_id: null, tracked_role: null, tracked_status: null, tracked_label: null,
    profile_id: null, profile_handle: null, profile_display_name: null, profile_url: null, avatar_url: null,
    is_verified: null, followers: null, followers_observed_at: null, followers_30d_ago: null,
    posts_tracked: null, last_post_at: null, best_multiple_30d: null, best_post_id_30d: null, last_refreshed_at: null,
  };
  it("maps an untracked property to a Not tracked own row keyed by the property", () => {
    const r = brandSocialRowToAccountRow(base);
    expect(r).toMatchObject({ rowId: "prop1", status: "not_tracked", role: "own", trackedAccountId: null, propertyId: "prop1", trackable: true, ownerKind: "company", postsTracked: 0, followers: null, growth: null });
    expect(r.displayName).toBe("datadestruction");
  });
  it("maps a tracked account: coerces numeric strings, derives 30-day growth, keeps owner", () => {
    const r = brandSocialRowToAccountRow({
      ...base, row_key: "prop2", owner_kind: "person", owner_name: "Arman Sadeghi",
      tracked_account_id: "t9", tracked_role: "client", tracked_status: "active", profile_id: "p9",
      profile_handle: "armansadeghi", profile_display_name: "Arman", followers: "1100", followers_30d_ago: "1000",
      posts_tracked: "12", best_multiple_30d: "4.5", avatar_url: "https://x/a.jpg",
    });
    expect(r).toMatchObject({ rowId: "t9", trackedAccountId: "t9", role: "client", status: "active", followers: 1100, postsTracked: 12, bestScore: 4.5, ownerKind: "person", ownerName: "Arman Sadeghi", displayName: "Arman" });
    expect(r.growth).toBeCloseTo(0.1, 5);
  });
  it("says there is not enough history when no 30-day-old snapshot exists", () => {
    const r = brandSocialRowToAccountRow({ ...base, tracked_account_id: "t1", tracked_role: "own", tracked_status: "active", profile_id: "p1", followers: 500 });
    expect(r.growth).toBeNull();
    expect(r.growthNote).toBe("Not enough history yet");
  });
  it("marks unsupported platforms not trackable", () => {
    expect(brandSocialRowToAccountRow({ ...base, platform: "pinterest", trackable: false }).trackable).toBe(false);
  });
});
