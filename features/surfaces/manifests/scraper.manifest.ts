/**
 * Surface manifest — Web scraper (`matrx-user/scraper`).
 *
 * The web-scraping route + overlay at `/scraper`. The user enters a URL,
 * picks a scrape mode (Quick / Full / Search), and gets back rendered
 * content, plain text, markdown, metadata, links, and hashes across
 * separate result tabs.
 *
 * Agents bound here typically operate on the scraped content (summarize
 * the page, extract entities, classify the source) or on the metadata
 * (rate quality, detect content type). Both are first-class declarations.
 *
 * State here is local to the page component (no central Redux slice yet),
 * so emit at action-trigger time from the page's own state.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Source identification (300-329) ───────────────────────────────────
  {
    name: "scraped_url",
    label: "Scraped URL",
    description:
      "The URL that was scraped. Empty when no scrape has run yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 300,
  },
  {
    name: "scraped_title",
    label: "Page title",
    description:
      "Title of the scraped page (from `<title>` or H1). Empty when no scrape has run or the page had no title.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
  },
  {
    name: "scrape_mode",
    label: "Scrape mode",
    description:
      '"quick", "full", or "search" — the kind of scrape that was run. Empty when no scrape has run yet.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 320,
  },

  // ── Content body — multiple representations (340-379) ─────────────────
  {
    name: "scraped_content_text",
    label: "Scraped text",
    description:
      "Full plain-text content of the page (stripped of HTML). The most common single-string input for content-summarization actions. Empty when no scrape has run.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 340,
  },
  {
    name: "scraped_content_markdown",
    label: "Scraped markdown",
    description:
      "Markdown rendering of the page with preserved links and basic structure. Empty when no scrape has run or markdown was not produced.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10000,
    sortOrder: 345,
  },
  {
    name: "scraped_content_html",
    label: "Scraped HTML",
    description:
      "Raw or sanitized HTML of the scraped page. Large — bind with care, prefer `scraped_content_text` or `scraped_content_markdown` for most actions.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30000,
    sortOrder: 350,
  },
  {
    name: "scraped_metadata",
    label: "Page metadata",
    description:
      "Object with OpenGraph tags, JSON-LD blocks, meta tags, author, published date, language, etc. when present. Empty object when none were extracted.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 360,
  },
  {
    name: "scraped_main_image",
    label: "Main image URL",
    description:
      "URL of the primary image identified on the page (OpenGraph image, hero image, or first large image). Empty when none was identified.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 365,
  },
  {
    name: "scraped_links",
    label: "Extracted links",
    description:
      "Object grouping the page's links by kind: `{ internal: string[], external: string[], media: string[] }`. Empty object when no links were extracted.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 370,
  },

  // ── Result status (400-449) ───────────────────────────────────────────
  {
    name: "scrape_success",
    label: "Scrape succeeded",
    description:
      "True when the most recent scrape returned content. False when an error occurred or no scrape has run yet.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 400,
  },
  {
    name: "scrape_failure_reason",
    label: "Failure reason",
    description:
      "Human-readable error message when `scrape_success` is false. Empty when the scrape succeeded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 410,
  },
  {
    name: "scrape_http_status",
    label: "HTTP status",
    description:
      "HTTP status code returned by the target server (200, 404, 500, etc.). Zero when the request never completed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 420,
  },
  {
    name: "scrape_execution_time_ms",
    label: "Execution time (ms)",
    description:
      "Wall-clock milliseconds the scrape took end-to-end. Useful for performance-aware actions.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 430,
  },
  {
    name: "active_result_tab",
    label: "Active result tab",
    description:
      'Which results tab is currently selected: "pretty", "text", "markdown", "metadata", "json", "hashes". Lets actions adapt to what the user is viewing.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 440,
  },
];

export const scraperManifest: SurfaceManifest = {
  surfaceName: "matrx-user/scraper",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createScraperScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  scraped_url?: string;
  scraped_title?: string;
  scrape_mode?: "quick" | "full" | "search";
  scraped_content_text?: string;
  scraped_content_markdown?: string;
  scraped_content_html?: string;
  scraped_metadata?: Record<string, unknown>;
  scraped_main_image?: string;
  scraped_links?: { internal?: string[]; external?: string[]; media?: string[] };
  scrape_success?: boolean;
  scrape_failure_reason?: string;
  scrape_http_status?: number;
  scrape_execution_time_ms?: number;
  active_result_tab?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
