/**
 * Surface manifest — Web scraper (`matrx-user/scraper`).
 *
 * The web-scraping workspace (the `scraperWindow` floating panel, plus the
 * `/scraper` route surfaces). The user enters a URL or keyword, picks a mode
 * (Web search / single-URL Quick / keyword Deep batch), and reads back
 * rendered content, plain text, markdown, metadata, and links across
 * separate result tabs — with a sidebar list of every scraped page.
 *
 * Agents bound here typically operate on the scraped content (summarize
 * the page, extract entities, classify the source), on the metadata
 * (rate quality, detect content type), or on the run itself (pick the best
 * result, retry failures). Both content and metadata are first-class
 * declarations.
 *
 * The write half (`writeTargets`, below) covers the other direction: an agent
 * can STAGE the next scrape command — target, mode, page budget — but never
 * run it. See the docblock above `writeTargets` for the split and the
 * per-mount reasoning.
 *
 * State is local to the workspace component (no central Redux slice), so
 * `ScraperFloatingWorkspace` rebuilds `contextData` from live state via
 * `features/scraper/agent-context/buildScraperContextData.ts`.
 *
 * Agent-writable since 2026-08-10: one draft target (`scrape_request`) stages
 * the next scrape's inputs into the same form state the user types into. The
 * scrape itself is never agent-triggered. See the block above `writeTargets`
 * for which fields earned a target and why `target_url` was the close call.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  PAGE_LIMIT_MAX,
  PAGE_LIMIT_MIN,
  SCRAPE_MODES,
  SCRAPE_MODE_ENUM_TEXT,
} from "@/features/scraper/scrape-command";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/**
 * THE scrape-mode vocabulary — the single source of truth for the three modes
 * the workspace offers, in the wire spelling agents read on `scrape_mode` and
 * write on `scrape_request`.
 *
 * Declared here (not in the feature) because `buildScraperContextData.ts`
 * already imports this manifest; the reverse would be circular. That file maps
 * the workspace's internal mode ids (`url` / `batch` / `web`) onto these, and
 * the write handler maps back — both against this constant, so the enum can
 * never drift from the prose in `scrape_request.description`, which is built
 * from it.
 */
export const SCRAPE_MODES = ["quick", "full", "search"] as const;

/** One of the three modes in {@link SCRAPE_MODES}. */
export type ScrapeMode = (typeof SCRAPE_MODES)[number];

const groups: SurfaceValueGroup[] = [
  {
    key: "target",
    label: "Target",
    sortOrder: 100,
    description: "What the user is scraping — the URL / keyword inputs and the selected page.",
  },
  {
    key: "extracted_content",
    label: "Extracted content",
    sortOrder: 200,
    description: "The body of the selected scraped page in its different representations.",
  },
  {
    key: "page_metadata",
    label: "Page metadata",
    sortOrder: 300,
    description: "Structured metadata extracted from the selected page.",
  },
  {
    key: "results",
    label: "Results",
    sortOrder: 400,
    description: "The full result set of this session — scraped pages and web-search hits.",
  },
  {
    key: "run_state",
    label: "Run state",
    sortOrder: 500,
    description: "Outcome and progress of the most recent scrape.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Target — inputs + selected page identity ──────────────────────────
  {
    name: "target_url",
    label: "Target URL",
    description:
      "The URL currently typed in the single-URL input — what the user intends to scrape next. Empty in web/keyword modes or before the user types one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 300,
    group: "target",
  },
  {
    name: "search_keyword",
    label: "Search keyword",
    description:
      "The keyword typed for web search or deep (search + scrape) mode. Empty in single-URL mode or before the user types one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 305,
    group: "target",
  },
  {
    name: "max_pages",
    label: "Max pages",
    description:
      "Maximum number of pages the deep (search + scrape) mode will scrape. Absent outside deep mode.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 308,
    group: "target",
  },
  {
    name: "scraped_url",
    label: "Scraped URL",
    description:
      "The URL of the scraped page the user is currently reading. Empty when no scrape has run yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 310,
    group: "target",
  },
  {
    name: "scraped_title",
    label: "Page title",
    description:
      "Title of the scraped page (from `<title>` or H1). Empty when no scrape has run or the page had no title.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 315,
    group: "target",
  },
  {
    name: "scrape_mode",
    label: "Scrape mode",
    description:
      '"quick" (single URL), "full" (keyword deep batch), or "search" (web search only). Always populated — reflects the workspace\'s active mode even before any scrape runs.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 320,
    group: "target",
  },

  // ── Extracted content — multiple representations ──────────────────────
  {
    name: "scraped_content_text",
    label: "Scraped text",
    description:
      "Full plain-text content of the selected page (stripped of HTML). The most common single-string input for content-summarization actions. Empty when no scrape has run.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 340,
    group: "extracted_content",
  },
  {
    name: "scraped_content_markdown",
    label: "Scraped markdown",
    description:
      "Markdown rendering of the selected page with preserved links and basic structure. Empty when no scrape has run or markdown was not produced.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10000,
    sortOrder: 345,
    group: "extracted_content",
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
    group: "extracted_content",
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
    group: "extracted_content",
  },

  // ── Page metadata ─────────────────────────────────────────────────────
  {
    name: "scraped_metadata",
    label: "Page metadata",
    description:
      "Object with OpenGraph tags, JSON-LD blocks, meta tags, author, published date, language, etc. when present. Empty object when none were extracted.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 360,
    group: "page_metadata",
  },

  // ── Results — the session's result set ────────────────────────────────
  {
    name: "results_overview",
    label: "Scraped pages overview",
    description:
      "One entry per scraped page in this session's sidebar list: `{ url, title, char_count, has_content }`. Empty array before any scrape. Always populated.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    sortOrder: 400,
    group: "results",
  },
  {
    name: "result_count",
    label: "Scraped page count",
    description:
      "Number of scraped pages in this session (equivalent to `results_overview.length`). Always populated; zero before any scrape.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 405,
    group: "results",
  },
  {
    name: "selected_result_index",
    label: "Selected result index",
    description:
      "Zero-based index of the scraped page the user is reading, within results_overview. Absent when no results exist yet.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 410,
    group: "results",
  },
  {
    name: "search_hits",
    label: "Web search hits",
    description:
      "Web-search results from keyword mode, one entry per hit: `{ title, url, snippet, rank }`. Absent when no keyword search has run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 420,
    group: "results",
  },
  {
    name: "search_hit_count",
    label: "Web search hit count",
    description:
      "Number of web-search hits from the latest keyword search. Always populated; zero when no search has run.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 425,
    group: "results",
  },

  // ── Run state ─────────────────────────────────────────────────────────
  {
    name: "scrape_success",
    label: "Scrape succeeded",
    description:
      "True when the selected scraped page has content. False when the scrape failed, came back empty, or no scrape has run yet. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 500,
    group: "run_state",
  },
  {
    name: "scrape_failure_reason",
    label: "Failure reason",
    description:
      "Human-readable error message when the most recent scrape failed. Absent when the scrape succeeded or nothing has run.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 510,
    group: "run_state",
  },
  {
    name: "scrape_execution_time_ms",
    label: "Execution time (ms)",
    description:
      "Wall-clock milliseconds the selected page's scrape took end-to-end. Absent when the API did not report it or no scrape has run.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 520,
    group: "run_state",
  },
  {
    name: "active_result_tab",
    label: "Active result tab",
    description:
      'Which results tab is currently selected: "pretty", "text", "markdown", "metadata", "json", "hashes". Always populated — lets actions adapt to what the user is viewing.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 530,
    group: "run_state",
  },
  {
    name: "is_scraping",
    label: "Scrape in progress",
    description:
      "True while a scrape or search request is in flight. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 540,
    group: "run_state",
  },
];

// ── Write targets (read/write v1) ───────────────────────────────────────────
//
// WHAT EARNED A TARGET, AND WHY (the judgment bar, applied honestly).
//
// This surface has exactly one thing a user composes: the NEXT scrape request.
// Everything from `scraped_url` onward is observed OUTPUT — read-only evidence
// pulled off live pages — and is deliberately not writable: an agent that could
// edit scraped content could launder invention into something the user reads as
// fact. Result selection and the Scrape button are likewise excluded; running a
// scrape is an outbound request against a third-party site, and that stays the
// user's press.
//
// So the writable half is the request form's four fields, and they are declared
// as ONE object target rather than four micro-targets because the user composes
// them as one decision — the mode determines which input is even rendered, and
// `max_pages` is meaningless outside deep mode. One target lets the handler
// check that coherence; four could not.
//
// `search_keyword` and `max_pages` are the easy YES: drafting a good search
// query from a fuzzy intent ("find me recent writeups on X") is exactly the
// authored-content case, and the page count is the planning number that rides
// with it. `scrape_mode` is a YES for the same reason — "search the web for X"
// vs "read this page" vs "search and read the top 5" is a real routing decision
// an agent makes from the user's own words.
//
// `target_url` was the close call, and it is IN — with its risk written into the
// contract rather than waved off. The failure mode is real: an agent that
// half-remembers a URL from training can produce a plausible, well-formed
// address for a page that never existed, and a URL is closer to identity
// ("which page do you mean") than to authored content. What tips it is that
// this surface PRODUCES the URLs an agent would want to write: `search_hits`
// carries the web-search results and `scraped_links` carries every link off the
// page the user is reading, both declared read values. The honest use is
// transcription from that evidence — "put hit #3 in the box" — not recall, so
// the description forbids recall explicitly, the handler rejects anything that
// isn't an absolute http(s) URL, and `ask` puts the full URL in front of the
// user before it lands. Two human gates remain after that: the staged value is
// visible in the input, and the scrape itself is still a button the user
// presses. A well-formed but wrong URL is stopped by the person, which is the
// right place to stop it.
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "scrape_request",
    label: "Scrape request",
    description:
      "Stages the NEXT scrape request into the workspace's input form — the same fields the user types into. The user still presses Scrape; this never fetches anything. " +
      `Value: an object with any of { scrape_mode?: ${SCRAPE_MODES.join(" | ")}, target_url?: string, search_keyword?: string, max_pages?: number }; ` +
      "omitted fields keep what the user already typed, so send only what you are changing. " +
      'Each mode uses a different input, so send the field that matches: "quick" scrapes one page and uses target_url; "search" runs a keyword web search and uses search_keyword; "full" searches then scrapes the top results and uses search_keyword plus max_pages (1-20). ' +
      "Sending a field the resulting mode does not use is rejected rather than silently dropped. " +
      "target_url must be an absolute http:// or https:// URL, and you must take it from what is in front of you — a url in search_hits or scraped_links, or one the user gave you. Never write a URL you are recalling rather than reading; a plausible-looking address for a page that does not exist wastes the user's request. " +
      "Read target_url, search_keyword, max_pages and scrape_mode to see what is currently staged. Refused while is_scraping is true — a run is in flight and the inputs are locked.",
    valueType: "object",
    // No 1:1 read twin: this one target stages four declared values
    // (target_url / search_keyword / max_pages / scrape_mode), which the
    // description names for the evidence loop.
    mode: "draft",
    applyPolicy: "ask",
    group: "target",
    sortOrder: 100,
  },
];

export const scraperManifest: SurfaceManifest = {
  surfaceName: "matrx-user/scraper",
  readiness: "verified",
  label: "Scraper",
  urlPattern: "/scraper",
  intro: `<surface_intro>
You are on the Web scraper surface: the user scrapes live web pages (single URL, keyword web search, or keyword deep batch) and reads back extracted content.
The primary payload is the SELECTED scraped page: scraped_url / scraped_title identify it, scraped_content_text (also the baseline content) and scraped_content_markdown carry its body, scraped_metadata and scraped_links carry its structure. results_overview lists every page scraped this session; search_hits lists web-search results not yet scraped.
Everything here is OBSERVED evidence pulled from live pages — never invent content that isn't in the scraped body. Check scrape_success / scrape_failure_reason before treating the content as valid; an empty body means the page came back blank, not that the site has no content.
target_url and search_keyword are the user's live inputs — what they intend to scrape next, distinct from what has already been scraped.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One scraped page as emitted in the `results_overview` surface value. */
export interface ScraperResultOverviewEntry {
  url: string;
  title: string;
  char_count: number;
  has_content: boolean;
}

/** One web-search hit as emitted in the `search_hits` surface value. */
export interface ScraperSearchHitEntry {
  title: string;
  url: string;
  snippet?: string;
  rank?: number;
}

export function createScraperScope(values: {
  // alwaysAvailable: true → required
  scrape_mode: ScrapeMode;
  results_overview: ScraperResultOverviewEntry[];
  result_count: number;
  search_hit_count: number;
  scrape_success: boolean;
  active_result_tab: string;
  is_scraping: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  target_url?: string;
  search_keyword?: string;
  max_pages?: number;
  scraped_url?: string;
  scraped_title?: string;
  scraped_content_text?: string;
  scraped_content_markdown?: string;
  scraped_metadata?: Record<string, unknown>;
  scraped_main_image?: string;
  scraped_links?: { internal?: string[]; external?: string[]; media?: string[] };
  selected_result_index?: number;
  search_hits?: ScraperSearchHitEntry[];
  scrape_failure_reason?: string;
  scrape_execution_time_ms?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
