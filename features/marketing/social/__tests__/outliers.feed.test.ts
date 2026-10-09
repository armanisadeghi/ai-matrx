import {
  DEFAULT_OUTLIER_FILTER,
  OUTLIER_ALERTS_ENABLED,
  applyOutlierFilter,
  countNewHits,
  parseWatchlistDefinition,
  resolveHits,
  sameOutlierFilter,
  serializeWatchlistDefinition,
  sortOutliers,
  visibleHits,
} from "../outliers";
import type { BrandPost } from "../types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-09T12:00:00Z");

function post(id: string, over: Partial<BrandPost> = {}): BrandPost {
  return {
    postId: id,
    platform: "tiktok",
    profileId: "p1",
    handle: "creator",
    format: "video",
    url: `https://x/${id}`,
    thumbnailUrl: null,
    hookLine: id,
    postedAt: new Date(NOW - 2 * DAY).toISOString(),
    durationSeconds: 30,
    views: 1000,
    likes: 10,
    comments: 1,
    shares: 1,
    isAd: false,
    removed: false,
    outlier: { score: 3, baselineViews: 300, percentile: 90, baselineWindow: 30, ageHours: 48 },
    outlierScore: 3,
    percentile: 90,
    role: "competitor",
    trackedAccountId: "t1",
    ...over,
  };
}

describe("watchlist definition serialization", () => {
  it("round-trips a filter and is order-insensitive for lists", () => {
    const filter = { ...DEFAULT_OUTLIER_FILTER, platforms: ["youtube", "tiktok"], roles: ["own" as const, "competitor" as const], windowDays: 90 as const, minMultiple: 5, format: "reel" };
    const def = serializeWatchlistDefinition("brand-1", filter);
    const back = parseWatchlistDefinition(JSON.parse(JSON.stringify(def)));
    expect(back.brandId).toBe("brand-1");
    expect(back.filter.platforms).toEqual(["tiktok", "youtube"]);
    expect(sameOutlierFilter(back.filter, { ...filter, platforms: ["tiktok", "youtube"] })).toBe(true);
    expect(back.filter.windowDays).toBe(90);
    expect(back.filter.minMultiple).toBe(5);
  });
  it("a stale or hand-edited blob falls back to defaults instead of throwing", () => {
    expect(parseWatchlistDefinition(null).filter).toEqual(DEFAULT_OUTLIER_FILTER);
    const odd = parseWatchlistDefinition({ brandId: 7, filter: { windowDays: 14, roles: ["boss", "own"], platforms: [1, "x"], minMultiple: "big" } });
    expect(odd.brandId).toBeNull();
    expect(odd.filter.windowDays).toBe(30);
    expect(odd.filter.roles).toEqual(["own"]);
    expect(odd.filter.platforms).toEqual(["x"]);
    expect(odd.filter.minMultiple).toBe(DEFAULT_OUTLIER_FILTER.minMultiple);
  });
});

describe("applyOutlierFilter", () => {
  const posts = [
    post("a"),
    post("low", { outlierScore: 1.2 }),
    post("none", { outlierScore: null }),
    post("old", { postedAt: new Date(NOW - 40 * DAY).toISOString() }),
    post("yt", { platform: "youtube", role: "own", format: "short", outlierScore: 8 }),
  ];
  it("keeps only scored posts at or over the min multiple inside the window", () => {
    expect(applyOutlierFilter(posts, DEFAULT_OUTLIER_FILTER, NOW).map((p) => p.postId)).toEqual(["a", "yt"]);
  });
  it("widening the window brings the old post back", () => {
    const ids = applyOutlierFilter(posts, { ...DEFAULT_OUTLIER_FILTER, windowDays: 90 }, NOW).map((p) => p.postId);
    expect(ids).toContain("old");
  });
  it("platform, role, format and min multiple narrow", () => {
    expect(applyOutlierFilter(posts, { ...DEFAULT_OUTLIER_FILTER, platforms: ["youtube"] }, NOW).map((p) => p.postId)).toEqual(["yt"]);
    expect(applyOutlierFilter(posts, { ...DEFAULT_OUTLIER_FILTER, roles: ["own"] }, NOW).map((p) => p.postId)).toEqual(["yt"]);
    expect(applyOutlierFilter(posts, { ...DEFAULT_OUTLIER_FILTER, format: "short" }, NOW).map((p) => p.postId)).toEqual(["yt"]);
    expect(applyOutlierFilter(posts, { ...DEFAULT_OUTLIER_FILTER, minMultiple: 5 }, NOW).map((p) => p.postId)).toEqual(["yt"]);
  });
  it("sorts by multiple, views and newest", () => {
    const m = sortOutliers([post("a"), post("yt", { outlierScore: 8, views: 5 })], "multiple");
    expect(m[0]!.postId).toBe("yt");
    expect(sortOutliers([post("a"), post("yt", { outlierScore: 8, views: 5 })], "views")[0]!.postId).toBe("a");
  });
});

describe("watchlist hits are computed on view", () => {
  const matches = [post("a"), post("b"), post("c")];
  it("a match with no hit row is new", () => {
    const hits = resolveHits(matches, []);
    expect(hits.map((h) => h.state)).toEqual(["new", "new", "new"]);
    expect(countNewHits(hits)).toBe(3);
  });
  it("seen and dismissed come from hit rows; dismissed hides until asked", () => {
    const hits = resolveHits(matches, [
      { post_id: "a", state: "seen" },
      { post_id: "b", state: "dismissed" },
      { post_id: "gone", state: "new" },
    ]);
    expect(countNewHits(hits)).toBe(1);
    expect(visibleHits(hits, false).map((h) => h.post.postId)).toEqual(["a", "c"]);
    expect(visibleHits(hits, true)).toHaveLength(3);
  });
  it("an unknown stored state reads as new, never throws", () => {
    expect(resolveHits([post("a")], [{ post_id: "a", state: "weird" }])[0]!.state).toBe("new");
  });
});

describe("alerts seam", () => {
  it("is off: nothing may notify anyone until alerts are approved", () => {
    expect(OUTLIER_ALERTS_ENABLED).toBe(false);
  });
});
