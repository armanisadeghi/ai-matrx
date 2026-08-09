/**
 * Scraper API Types
 *
 * Endpoints:
 * - POST /api/scraper/quick-scrape - Scrape multiple URLs
 * - POST /api/scraper/search - Search keywords (no scraping)
 * - POST /api/scraper/search-and-scrape - Search and scrape results
 * - POST /api/scraper/search-and-scrape-limited - Search and scrape (limited)
 * - POST /api/scraper/mic-check - Test endpoint
 *
 * Authentication:
 * All scraper requests require ONE of:
 * - Authorization header (Bearer token) - for authenticated users
 * - X-Fingerprint-ID header - for guest users (FingerprintJS visitor ID)
 */

// ============================================================================
// REQUEST TYPES — aliases of the generated backend contract
// ============================================================================
//
// These are NOT hand-written mirrors. `types/python-generated/api-types.ts` is
// the source of truth (regenerate with `pnpm sync-types`); aliasing here keeps
// ONE definition of the request shape for every caller. There is exactly one
// client path to these endpoints — `useScraperApi` — calling the Python
// backend directly. Never re-declare these option sets anywhere else.

import type { components } from "@/types/python-generated/api-types";

export type QuickScrapeRequest = components["schemas"]["QuickScrapeRequest"];
export type SearchKeywordsRequest =
  components["schemas"]["SearchKeywordsRequest"];
export type SearchAndScrapeRequest =
  components["schemas"]["SearchAndScrapeRequest"];
export type SearchAndScrapeLimitedRequest =
  components["schemas"]["SearchAndScrapeLimitedRequest"];

/** The scrape-shaping flags shared by quick-scrape and the search-and-scrape endpoints. */
export type ScrapeOptions = Omit<QuickScrapeRequest, "urls" | "use_cache">;

// ============================================================================
// RESPONSE TYPES (V2 Stream Events)
// ============================================================================
//
// The scraper backend now emits the unified V2 stream event protocol.
// Event types used:
//   - "phase"  (was "status_update") — PhasePayload with .phase field
//   - "data"   — TypedDataPayload with .type discriminator
//               (e.g. "fetch_results", "search_results", "scrape_batch_complete")
//   - "error"  — ErrorPayload
//   - "end"    — EndPayload
//   - "info"   — InfoPayload (user-facing status messages)
//   - "warning" — WarningPayload
//
// Import V2 types from @/lib/api/types or @/lib/api/index for consumption.
// The `consumeStream()` function from @/lib/api/stream-parser is the
// canonical stream consumer — scraper hooks should use it with callbacks.

export interface ScrapedResultsEnvelope {
  type: "fetch_results";
  metadata?: { execution_time_ms?: number; [key: string]: unknown };
  results: ScrapedResult[];
}

// ============================================================================
// SCRAPED DATA TYPES
// ============================================================================

export interface ScrapedResultHashes {
  /** Array of uint32 values (MinHash signature) */
  minhash?: number[] | string;
  /** SimHash fingerprint as integer */
  simhash?: number | string;
  outline_simhash?: number | string;
}

export interface ScrapedResult {
  /** true = scraped successfully, false = scrape failed */
  success?: boolean;
  /** Human-readable reason when success is false */
  failure_reason?: string | null;
  url?: string;
  /** Resolved URL after redirects */
  response_url?: string;
  /** HTTP status code */
  status_code?: number;
  /** CMS detected (e.g. "wordpress", "unknown") */
  cms?: string;
  /** Firewall detected (e.g. "cloudflare", "none") */
  firewall?: string;

  // ── Text variants (richest first) ──
  /** Markdown with links and images */
  markdown_renderable?: string;
  /** Markdown grouped by header */
  markdown_renderable_by_header?: Record<string, string>;
  /** Clean text with inline links — best for AI/research */
  ai_research_content?: string;
  /** Clean plain text — best for AI processing */
  ai_content?: string;
  /** Legacy plain text field */
  text_data?: string;

  organized_data?:
    | Array<{ type: string; level?: number; content: string }>
    | Record<string, unknown>;
  structured_data?: Record<string, unknown>;
  document_outline?: Array<{ type: string; level: number; content: string }>;
  tables?: unknown[];
  code_blocks?: unknown[];
  lists?: unknown[];

  overview?: {
    page_title?: string;
    url?: string;
    website?: string;
    char_count?: number;
    char_count_formatted?: number;
    has_structured_content?: boolean;
    outline?: Record<string, string[]>;
    table_count?: number;
    code_block_count?: number;
    list_count?: number;
    unique_page_name?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
  /** Top-level page title (mirrors overview.page_title) */
  title?: string;

  links?: {
    internal?: string[];
    external?: string[];
    images?: string[];
    documents?: string[];
    others?: string[];
    audio?: string[];
    videos?: string[];
    archives?: string[];
  };
  images?: string[];
  videos?: string[];
  audios?: string[];
  main_image?: string;
  content_filter_removal_details?: unknown[];
  failure_details?: unknown[];
  hashes?: ScrapedResultHashes | null;
  scraped_at?: string;
  /** Per-result metadata (json-ld, opengraph, meta_tags, etc.) */
  metadata?: Record<string, unknown>;
}

/** A single search result item as returned directly by the API */
export interface SearchResultItem {
  keyword?: string;
  type?: string;
  title?: string;
  url?: string;
  /** Result description / snippet */
  description?: string;
  /** Alias for description — some consumers use this */
  snippet?: string;
  source?: string;
  age?: string;
  thumbnail?: string | null;
  rank?: number;
}

/** Legacy grouped format — kept for backward compat */
export interface SearchResult {
  keyword?: string;
  /** Flat items when the API returns them un-grouped */
  results?: SearchResultItem[];
  total_results?: number;
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * AUTHENTICATED USER FLOW
 *
 * ```typescript
 * import { BACKEND_URLS, ENDPOINTS } from '@/lib/api/endpoints';
 *
 * const response = await fetch(`${BACKEND_URLS.production}${ENDPOINTS.scraper.quickScrape}`, {
 *   method: "POST",
 *   headers: {
 *     "Content-Type": "application/json",
 *     "Authorization": `Bearer ${supabaseSession.access_token}`,
 *   },
 *   body: JSON.stringify({
 *     urls: ["https://example.com"],
 *     get_text_data: true,
 *     get_overview: true,
 *   }),
 * });
 * ```
 *
 * GUEST USER FLOW (using centralized fingerprint service)
 *
 * ```typescript
 * import { getFingerprint } from '@/lib/services/fingerprint-service';
 * import { BACKEND_URLS, ENDPOINTS } from '@/lib/api/endpoints';
 *
 * const fingerprintId = await getFingerprint();
 *
 * const response = await fetch(`${BACKEND_URLS.production}${ENDPOINTS.scraper.quickScrape}`, {
 *   method: "POST",
 *   headers: {
 *     "Content-Type": "application/json",
 *     "X-Fingerprint-ID": fingerprintId,
 *   },
 *   body: JSON.stringify({
 *     urls: ["https://example.com"],
 *   }),
 * });
 * ```
 */
