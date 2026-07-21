/** Stable, URL-safe report identities for one crawl session. */
export const CRAWL_REPORT_KEYS = [
  "response-codes",
  "page-titles",
  "meta-descriptions",
  "headings",
  "canonicals",
  "directives",
  "images",
  "content",
  "structured-data",
  "performance",
] as const;

export type CrawlReportKey = (typeof CRAWL_REPORT_KEYS)[number];

export type CrawlReportSource = "crawl-url" | "snapshot";

export interface CrawlReportDefinition {
  key: CrawlReportKey;
  label: string;
  shortLabel: string;
  category: "Crawlability" | "Metadata" | "Content" | "Enhancements";
  description: string;
  source: CrawlReportSource;
  badge: string;
}

/**
 * One canonical catalogue drives the report index, route validation, page
 * headings, metadata, and navigation. Add a report here before adding UI.
 */
export const CRAWL_REPORTS: readonly CrawlReportDefinition[] = [
  {
    key: "response-codes",
    label: "Response codes",
    shortLabel: "Responses",
    category: "Crawlability",
    description:
      "Every encountered URL, response, redirect outcome, failure reason, scope, and crawl depth.",
    source: "crawl-url",
    badge: "Rc",
  },
  {
    key: "page-titles",
    label: "Page titles",
    shortLabel: "Titles",
    category: "Metadata",
    description:
      "Observed titles with character and rendered-pixel measurements from the canonical SEO evaluator.",
    source: "snapshot",
    badge: "Pt",
  },
  {
    key: "meta-descriptions",
    label: "Meta descriptions",
    shortLabel: "Descriptions",
    category: "Metadata",
    description:
      "Observed descriptions with character length, rendered width, and validation state.",
    source: "snapshot",
    badge: "Md",
  },
  {
    key: "headings",
    label: "Headings",
    shortLabel: "Headings",
    category: "Content",
    description:
      "Primary H1 text, H1/H2 counts, and the captured document outline for every page.",
    source: "snapshot",
    badge: "Hd",
  },
  {
    key: "canonicals",
    label: "Canonicals",
    shortLabel: "Canonicals",
    category: "Crawlability",
    description:
      "Canonical targets classified as self-referencing, canonicalized, or missing.",
    source: "snapshot",
    badge: "Ca",
  },
  {
    key: "directives",
    label: "Directives & language",
    shortLabel: "Directives",
    category: "Crawlability",
    description:
      "Robots directives, indexability, document language, and hreflang annotation counts.",
    source: "snapshot",
    badge: "Dr",
  },
  {
    key: "images",
    label: "Images",
    shortLabel: "Images",
    category: "Content",
    description:
      "Per-page image totals and missing-alt counts captured by the crawl audit.",
    source: "snapshot",
    badge: "Im",
  },
  {
    key: "content",
    label: "Content & duplicates",
    shortLabel: "Content",
    category: "Content",
    description:
      "Word and sentence counts, readability, content hashes, links, and mixed-content resources.",
    source: "snapshot",
    badge: "Ct",
  },
  {
    key: "structured-data",
    label: "Structured data",
    shortLabel: "Schema",
    category: "Enhancements",
    description:
      "Schema.org types and payload presence observed in each page capture.",
    source: "snapshot",
    badge: "Js",
  },
  {
    key: "performance",
    label: "Performance",
    shortLabel: "Performance",
    category: "Enhancements",
    description:
      "Crawler response time and transferred bytes alongside HTTP and content size context.",
    source: "snapshot",
    badge: "Pf",
  },
];

export function isCrawlReportKey(value: string): value is CrawlReportKey {
  return CRAWL_REPORT_KEYS.some((key) => key === value);
}

export function getCrawlReport(key: CrawlReportKey): CrawlReportDefinition {
  const report = CRAWL_REPORTS.find((candidate) => candidate.key === key);
  if (!report) {
    throw new Error(`Unknown crawl report: ${key}`);
  }
  return report;
}
