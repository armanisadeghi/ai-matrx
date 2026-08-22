import type {
  PageCoverageFilter,
  SiteCoverageMatrix,
} from "@/features/marketing/data/service";
import type { SiteOverviewMetrics } from "@/features/marketing/types";

const COVERAGE_COUNT_FIELDS = [
  "totalPages",
  "knownPageUrls",
  "unconfirmedCandidates",
  "resourceUrls",
  "inSitemaps",
  "crawled",
  "neverCrawled",
  "sitemapNotCrawled",
  "crawledNoSitemap",
  "inGsc",
  "gscNoSitemap",
  "sitemapNoGsc",
] as const;

function coverageShapeError(field: string): never {
  throw new Error(
    `Site coverage aggregate returned an unexpected shape (${field}). ` +
      "Check web.site_page_coverage against features/marketing/lib/coverage.ts.",
  );
}

function coverageRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    coverageShapeError(field);
  }
  return value as Record<string, unknown>;
}

function coverageCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    coverageShapeError(field);
  }
  return value;
}

/**
 * Narrow the database aggregate at the read boundary. A missing, fractional,
 * negative, or otherwise drifted count is a contract defect, never zero.
 */
export function parseSiteCoverageMatrix(value: unknown): SiteCoverageMatrix {
  const root = coverageRecord(value, "coverage");
  const byProvenance = coverageRecord(
    root.byProvenance,
    "coverage.byProvenance",
  );
  const counts = Object.fromEntries(
    COVERAGE_COUNT_FIELDS.map((field) => [
      field,
      coverageCount(root[field], `coverage.${field}`),
    ]),
  ) as Pick<SiteCoverageMatrix, (typeof COVERAGE_COUNT_FIELDS)[number]>;

  return {
    ...counts,
    byProvenance: {
      gsc: coverageCount(byProvenance.gsc, "coverage.byProvenance.gsc"),
      sitemap: coverageCount(
        byProvenance.sitemap,
        "coverage.byProvenance.sitemap",
      ),
      crawl: coverageCount(byProvenance.crawl, "coverage.byProvenance.crawl"),
      manual: coverageCount(
        byProvenance.manual,
        "coverage.byProvenance.manual",
      ),
    },
  };
}

export function parseSiteOverviewPageCounts(
  value: unknown,
): Pick<
  SiteOverviewMetrics,
  | "canonicalPages"
  | "unconfirmedCandidates"
  | "resourceUrls"
  | "targetKeywordPages"
  | "pagesInGsc"
  | "blockedPages"
  | "serpIssues"
> {
  const root = coverageRecord(value, "site page rollup");
  return {
    canonicalPages: coverageCount(
      root.totalPages,
      "site page rollup.totalPages",
    ),
    unconfirmedCandidates: coverageCount(
      root.unconfirmedCandidates,
      "site page rollup.unconfirmedCandidates",
    ),
    resourceUrls: coverageCount(
      root.resourceUrls,
      "site page rollup.resourceUrls",
    ),
    targetKeywordPages: coverageCount(
      root.targetKeywordPages,
      "site page rollup.targetKeywordPages",
    ),
    pagesInGsc: coverageCount(root.inGsc, "site page rollup.inGsc"),
    blockedPages: coverageCount(
      root.blockedPages,
      "site page rollup.blockedPages",
    ),
    serpIssues: coverageCount(root.serpIssues, "site page rollup.serpIssues"),
  };
}

/**
 * Display copy for the canonical-page coverage filters. ONE place so the
 * coverage matrix tiles and the pages-table chips can never disagree.
 */
export const COVERAGE_FILTER_COPY: Record<
  PageCoverageFilter,
  { label: string; description: string }
> = {
  all_known: {
    label: "All known page URLs",
    description: "Confirmed pages plus unconfirmed crawl candidates",
  },
  unconfirmed: {
    label: "Unconfirmed candidates",
    description: "Recorded by a crawl but never backed by page evidence",
  },
  in_sitemap: {
    label: "In sitemaps",
    description: "Listed by at least one sitemap",
  },
  crawled: {
    label: "Crawled",
    description: "Has an accepted content snapshot",
  },
  never_crawled: {
    label: "Never crawled",
    description: "No accepted snapshot yet",
  },
  sitemap_not_crawled: {
    label: "In sitemaps, never crawled",
    description: "The site advertises the URL but we have no content",
  },
  crawled_no_sitemap: {
    label: "Crawled, not in any sitemap",
    description: "We captured content the sitemaps do not advertise",
  },
  in_gsc: {
    label: "In Google Search",
    description: "Google reports impressions or clicks for this page",
  },
  gsc_no_sitemap: {
    label: "In Google, not in any sitemap",
    description: "Google found and serves a page the sitemaps do not advertise",
  },
  sitemap_no_gsc: {
    label: "In sitemaps, invisible to Google",
    description: "Advertised to Google but never reported in search results",
  },
  gone: {
    label: "Gone",
    description:
      "The crawler no longer finds these URLs — restore the page or redirect it",
  },
};
