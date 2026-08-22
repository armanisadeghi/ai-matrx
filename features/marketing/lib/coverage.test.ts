import {
  parseSiteCoverageMatrix,
  parseSiteOverviewPageCounts,
} from "@/features/marketing/lib/coverage";

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

const VALID_PAGE_ROLLUP = {
  ...VALID_COVERAGE,
  targetKeywordPages: 212,
  blockedPages: 19,
  serpIssues: 31,
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

describe("parseSiteOverviewPageCounts", () => {
  it("maps the shared page rollup into the overview contract", () => {
    expect(parseSiteOverviewPageCounts(VALID_PAGE_ROLLUP)).toEqual({
      canonicalPages: 4001,
      unconfirmedCandidates: 401,
      resourceUrls: 106,
      targetKeywordPages: 212,
      pagesInGsc: 2596,
      blockedPages: 19,
      serpIssues: 31,
    });
  });

  it.each([
    [
      "missing target-keyword count",
      { ...VALID_PAGE_ROLLUP, targetKeywordPages: undefined },
    ],
    ["negative blocked count", { ...VALID_PAGE_ROLLUP, blockedPages: -1 }],
    ["fractional SERP count", { ...VALID_PAGE_ROLLUP, serpIssues: 1.5 }],
  ])("rejects a %s instead of silently substituting zero", (_label, value) => {
    expect(() => parseSiteOverviewPageCounts(value)).toThrow(
      "Site coverage aggregate returned an unexpected shape",
    );
  });
});
