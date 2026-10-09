
import {
  adThumbnail, creditsLabel, daysLive, isLikelyWinner, newSinceLook, parseAdvertiserDefinition, runLabel, sortAds,
  toAdCardModel,
} from "../ads";
import type { AdCardModel, SocialAdRow } from "../types";

const NOW = Date.parse("2026-10-09T00:00:00Z");

function ad(over: Partial<AdCardModel>): AdCardModel {
  return {
    adId: "1", library: "meta", platformAdId: "p", advertiser: "A", advertiserPlatformId: null, headline: "", body: "",
    cta: "", landingUrl: null, libraryUrl: null, format: "video", status: "active", startedAt: "2026-09-01T00:00:00Z",
    endedAt: null, placements: [], countries: [], thumbnailUrl: null, firstSeenAt: null, removed: false, ...over,
  };
}

describe("run length", () => {
  it("counts to now while active", () => {
    expect(daysLive(ad({}), NOW)).toBe(38);
    expect(runLabel(ad({}), NOW)).toBe("Live 38d");
  });
  it("stops at the end date once inactive", () => {
    const a = ad({ status: "inactive", endedAt: "2026-09-13T00:00:00Z" });
    expect(daysLive(a, NOW)).toBe(12);
    expect(runLabel(a, NOW)).toBe("Ran 12d");
  });
  it("has no answer without a start", () => {
    expect(daysLive(ad({ startedAt: null }), NOW)).toBeNull();
    expect(runLabel(ad({ startedAt: null }), NOW)).toBe("");
  });
  it("likely winner is a fact about active ads past the knob", () => {
    expect(isLikelyWinner(ad({}), 30, NOW)).toBe(true);
    expect(isLikelyWinner(ad({}), 60, NOW)).toBe(false);
    expect(isLikelyWinner(ad({ status: "inactive", endedAt: "2026-09-02T00:00:00Z" }), 30, NOW)).toBe(false);
  });
});

describe("newSinceLook", () => {
  const ads = [ad({ adId: "old", firstSeenAt: "2026-10-01T00:00:00Z" }), ad({ adId: "new", firstSeenAt: "2026-10-05T00:00:00Z" }), ad({ adId: "none" })];
  it("returns only ads first seen after the last look", () => {
    expect(newSinceLook(ads, "2026-10-03T00:00:00Z").map((a) => a.adId)).toEqual(["new"]);
  });
  it("no look yet = everything is new", () => {
    expect(newSinceLook(ads, null)).toHaveLength(3);
  });
});

describe("sorting", () => {
  const a = ad({ adId: "a", startedAt: "2026-10-01T00:00:00Z" });
  const b = ad({ adId: "b", startedAt: "2026-08-01T00:00:00Z" });
  it("latest by start, longest by days live", () => {
    expect(sortAds([b, a], "latest", NOW).map((x) => x.adId)).toEqual(["a", "b"]);
    expect(sortAds([a, b], "longest", NOW).map((x) => x.adId)).toEqual(["b", "a"]);
  });
});

describe("row mapping", () => {
  it("prefers a thumbnail, then an image, never a video", () => {
    expect(adThumbnail([{ url: "v", kind: "video" }, { url: "i", kind: "image" }, { url: "t", kind: "thumbnail" }])).toBe("t");
    expect(adThumbnail([{ url: "v", kind: "video" }])).toBeNull();
    expect(adThumbnail(undefined)).toBeNull();
  });
  it("maps a row", () => {
    const m = toAdCardModel({
      id: "x", library: "tiktok", platform_ad_id: "9", advertiser_name: "B", advertiser_platform_id: null, status: "weird",
      started_at: null, ended_at: null, format: null, headline: " H ", body: null, cta: null, landing_url: null,
      placements: ["facebook"], countries: [], library_url: null, first_seen_at: "2026-10-01T00:00:00Z",
      raw_payload: {}, deleted_at: null,
    } as unknown as SocialAdRow);
    expect(m).toMatchObject({ status: "unknown", format: "other", headline: "H", placements: ["facebook"], thumbnailUrl: null });
  });
});

describe("advertiser definition", () => {
  it("accepts a complete document and refuses the rest", () => {
    const ok = parseAdvertiserDefinition({ library: "meta", advertiser: " Acme ", lastLookAt: "2026-10-01T00:00:00Z" });
    expect(ok).toMatchObject({ library: "meta", advertiser: "Acme", advertiserPlatformId: null });
    expect(parseAdvertiserDefinition({ library: "bing", advertiser: "x", lastLookAt: "2026-10-01T00:00:00Z" })).toBeNull();
    expect(parseAdvertiserDefinition({ library: "meta", advertiser: "", lastLookAt: "2026-10-01T00:00:00Z" })).toBeNull();
    expect(parseAdvertiserDefinition({ library: "meta", advertiser: "x", lastLookAt: "nope" })).toBeNull();
  });
  it("says what a search costs", () => {
    expect(creditsLabel(1)).toBe("1 credit");
    expect(creditsLabel(3)).toBe("3 credits");
    expect(creditsLabel(null)).toBe("Cost not reported");
  });
});

import { filterAds, formatMix, landingPageRanking } from "../ads";

describe("advertiser summary", () => {
  const ads = [
    ad({ adId: "1", format: "video", landingUrl: "https://a.test" }),
    ad({ adId: "2", format: "video", landingUrl: "https://a.test" }),
    ad({ adId: "3", format: "image", landingUrl: "https://b.test" }),
    ad({ adId: "4", format: "image", landingUrl: "https://b.test", status: "inactive" }),
    ad({ adId: "5", format: "carousel", landingUrl: null }),
  ];
  it("counts the format mix, biggest first", () => {
    expect(formatMix(ads)).toEqual([
      { format: "image", count: 2 }, { format: "video", count: 2 }, { format: "carousel", count: 1 },
    ]);
  });
  it("ranks landing pages by share of ACTIVE ads", () => {
    const r = landingPageRanking(ads);
    expect(r[0]).toEqual({ url: "https://a.test", count: 2, share: 0.5 });
    expect(r[1]).toEqual({ url: "https://b.test", count: 1, share: 0.25 });
  });
  it("filters active only and by format", () => {
    expect(filterAds(ads, { activeOnly: true, format: "all" })).toHaveLength(4);
    expect(filterAds(ads, { activeOnly: false, format: "image" })).toHaveLength(2);
  });
});
