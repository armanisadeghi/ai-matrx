
import { toAdCardModel } from "../ads";
import {
  ALL_SAVED,
  DEFAULT_SWIPE_FILTERS,
  buildSwipeItems,
  collectionCounts,
  filterSwipeItems,
  itemNote,
  itemTags,
  parseEdgeMetadata,
  parseTagInput,
  swipeFacets,
  toSwipeEdge,
  visibleCollections,
} from "../swipe";
import type { AdCardModel, PostCardModel, SocialAdRow, SwipeCollectionRow } from "../types";

const NOW = Date.parse("2026-10-09T12:00:00Z");

function post(id: string, over: Partial<PostCardModel> = {}): PostCardModel {
  return {
    postId: id, platform: "tiktok", profileId: null, handle: "garyvee", format: "short", url: "https://x/" + id,
    thumbnailUrl: null, hookLine: "Stop scrolling " + id, postedAt: null, durationSeconds: null, views: 10,
    likes: 1, comments: 0, shares: 0, isAd: false, removed: false,
    outlier: { score: null, baselineViews: null, percentile: null, baselineWindow: null, ageHours: null },
    outlierScore: null, percentile: null, ...over,
  };
}

function adRow(id: string, over: Partial<SocialAdRow> = {}): SocialAdRow {
  return {
    id, library: "meta", platform_ad_id: "p" + id, advertiser_name: "Acme Roofing", advertiser_platform_id: "77",
    status: "active", started_at: "2026-09-01T00:00:00Z", ended_at: null, format: "video", headline: "Free quote",
    body: "Call today", cta: "Learn more", landing_url: "https://acme.test", placements: ["facebook"], countries: ["US"],
    impressions_range: null, spend_range: null, library_url: null, provider: "scrapecreators",
    first_seen_at: "2026-10-01T00:00:00Z", last_refreshed_at: null,
    raw_payload: { media: [{ url: "https://img/1.jpg", kind: "image" }] },
    deleted_at: null, ...over,
  } as unknown as SocialAdRow;
}

const edge = (id: string, col: string, type: string, item: string, saved: string, metadata: unknown = {}) =>
  toSwipeEdge({ id, source_id: col, target_type: type, target_id: item, created_at: saved, metadata })!;

function fixture() {
  const edges = [
    edge("e1", "c1", "social_post", "p1", "2026-10-08T00:00:00Z", { note: "great hook", tags: ["hook", "ugc"] }),
    edge("e2", "c2", "social_post", "p1", "2026-10-09T00:00:00Z", { tags: ["swipe"] }),
    edge("e3", "c1", "social_ad", "a1", "2026-08-01T00:00:00Z", { tags: ["offer"] }),
    edge("e4", "c1", "social_post", "p2", "2026-10-07T00:00:00Z"),
    edge("e5", "c1", "social_post", "gone", "2026-10-07T00:00:00Z"),
  ];
  const posts = new Map([
    ["p1", post("p1")],
    ["p2", post("p2", { platform: "instagram", format: "image", hookLine: "Roof tips", handle: "acme" })],
  ]);
  const ads = new Map<string, AdCardModel>([["a1", toAdCardModel(adRow("a1"))]]);
  return buildSwipeItems({ edges, posts, ads });
}

describe("edge metadata", () => {
  it("reads note and unique tags, tolerating junk", () => {
    expect(parseEdgeMetadata({ note: "n", tags: ["a", "a", " b ", 3] })).toEqual({ note: "n", tags: ["a", "b"] });
    expect(parseEdgeMetadata(null)).toEqual({ note: "", tags: [] });
    expect(parseEdgeMetadata([1])).toEqual({ note: "", tags: [] });
  });
  it("drops edges to things the screen does not show", () => {
    expect(toSwipeEdge({ id: "x", source_id: "c", target_type: "social_profile", target_id: "i", metadata: {}, created_at: "" })).toBeNull();
  });
  it("parses typed tags", () => {
    expect(parseTagInput("#hook, ugc\nugc,  ")).toEqual(["hook", "ugc"]);
  });
});

describe("buildSwipeItems", () => {
  it("merges one saved thing across collections and counts unreadable ones", () => {
    const { items, missing } = fixture();
    expect(missing).toBe(1);
    expect(items.map((i) => i.key).sort()).toEqual(["social_ad:a1", "social_post:p1", "social_post:p2"]);
    const p1 = items.find((i) => i.itemId === "p1")!;
    expect(p1.edges).toHaveLength(2);
  });
  it("scopes notes and tags to the collection", () => {
    const p1 = fixture().items.find((i) => i.itemId === "p1")!;
    expect(itemTags(p1, "c1")).toEqual(["hook", "ugc"]);
    expect(itemTags(p1, "c2")).toEqual(["swipe"]);
    expect(itemTags(p1, ALL_SAVED)).toEqual(["hook", "swipe", "ugc"]);
    expect(itemNote(p1, "c2")).toBe("");
    expect(itemNote(p1, ALL_SAVED)).toBe("great hook");
  });
});

describe("filterSwipeItems", () => {
  const { items } = fixture();
  const f = (over: object) => filterSwipeItems(items, { ...DEFAULT_SWIPE_FILTERS, ...over }, NOW).map((i) => i.itemId);

  it("sorts newest save first", () => {
    expect(f({})).toEqual(["p1", "p2", "a1"]);
  });
  it("filters by collection", () => {
    expect(f({ scope: "c2" })).toEqual(["p1"]);
    expect(f({ scope: "c1" })).toEqual(["p1", "p2", "a1"]);
  });
  it("filters by type, platform and format", () => {
    expect(f({ type: "ads" })).toEqual(["a1"]);
    expect(f({ type: "posts" })).toEqual(["p1", "p2"]);
    expect(f({ platform: "instagram" })).toEqual(["p2"]);
    expect(f({ platform: "meta" })).toEqual(["a1"]);
    expect(f({ format: "image" })).toEqual(["p2"]);
  });
  it("filters by tag within the collection scope", () => {
    expect(f({ tag: "hook" })).toEqual(["p1"]);
    expect(f({ scope: "c2", tag: "hook" })).toEqual([]);
  });
  it("filters by date saved", () => {
    expect(f({ saved: "7d" })).toEqual(["p1", "p2"]);
    expect(f({ saved: "90d" })).toEqual(["p1", "p2", "a1"]);
  });
  it("searches title, handle, advertiser, note and tags", () => {
    expect(f({ search: "great hook" })).toEqual(["p1"]);
    expect(f({ search: "acme roofing" })).toEqual(["a1"]);
    expect(f({ search: "OFFER" })).toEqual(["a1"]);
    expect(f({ search: "nothing like this" })).toEqual([]);
  });
});

describe("counts and facets", () => {
  const { items } = fixture();
  it("counts items per collection once", () => {
    const c = collectionCounts(items);
    expect(c.get(ALL_SAVED)).toBe(3);
    expect(c.get("c1")).toBe(3);
    expect(c.get("c2")).toBe(1);
  });
  it("facets follow the scope", () => {
    const all = swipeFacets(items, ALL_SAVED);
    expect(all.platforms.map((p) => p.value).sort()).toEqual(["instagram", "meta", "tiktok"]);
    expect(swipeFacets(items, "c2").tags).toEqual([{ value: "swipe", count: 1 }]);
  });
});

describe("archive law", () => {
  const rows = [
    { id: "1", deleted_at: null }, { id: "2", deleted_at: "2026-10-01T00:00:00Z" },
  ] as unknown as SwipeCollectionRow[];
  it("hides archived unless asked, and then shows only them", () => {
    expect(visibleCollections(rows, false).map((r) => r.id)).toEqual(["1"]);
    expect(visibleCollections(rows, true).map((r) => r.id)).toEqual(["2"]);
  });
});
