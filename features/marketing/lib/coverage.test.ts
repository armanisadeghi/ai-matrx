import { parseSiteCoverageMatrix } from "@/features/marketing/lib/coverage";

const VALID_COVERAGE = {
  totalPages: 4001,
  knownPageUrls: 4402,
  unconfirmedCandidates: 401,
  resourceUrls: 106,
  inSitemaps: 3772,
  crawled: 1073,
  neverCrawled: 2928,
  sitemapNotCrawled: 2709,
  crawledNoSitemap: 10,
  inGsc: 2596,
  gscNoSitemap: 229,
  sitemapNoGsc: 1405,
  byProvenance: { sitemap: 3707, crawl: 80, gsc: 214, manual: 0 },
};

describe("parseSiteCoverageMatrix", () => {
  it("accepts the complete database aggregate", () => {
    expect(parseSiteCoverageMatrix(VALID_COVERAGE)).toEqual(VALID_COVERAGE);
  });

  it.each([
    ["missing count", { ...VALID_COVERAGE, crawled: undefined }],
    ["negative count", { ...VALID_COVERAGE, crawled: -1 }],
    ["fractional count", { ...VALID_COVERAGE, crawled: 1.5 }],
    ["missing provenance", { ...VALID_COVERAGE, byProvenance: {} }],
  ])("rejects a %s instead of silently substituting zero", (_label, value) => {
    expect(() => parseSiteCoverageMatrix(value)).toThrow(
      "Site coverage aggregate returned an unexpected shape",
    );
  });
});
