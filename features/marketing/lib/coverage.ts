import type { PageCoverageFilter } from "@/features/marketing/data/service";

/**
 * Display copy for the canonical-page coverage filters. ONE place so the
 * coverage matrix tiles and the pages-table chips can never disagree.
 */
export const COVERAGE_FILTER_COPY: Record<
  PageCoverageFilter,
  { label: string; description: string }
> = {
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
};
