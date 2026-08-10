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
  RESULT_LIMIT_MAX,
  RESULT_LIMIT_MIN,
  SCRAPE_MODES,
  SCRAPE_MODE_ENUM_TEXT,
} from "@/features/scraper/scrape-command";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

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
    name: "max_results",
    label: "Max results",
    description:
      "Maximum number of hits the web-search (\"search\") mode will request for the keyword — the budget beside the keyword field. These hits come back unscraped. Absent outside web-search mode.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 309,
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
    name: "selected_hit_index",
    label: "Selected hit index",
    description:
      "Zero-based index of the web-search hit the user currently has open in the detail pane, within search_hits. Absent when no search has run or no hit is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 422,
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

/**
 * Write targets — the scrape COMMAND, staged for the user to run.
 *
 * What earns a target here is the planning half of this surface: which URL to
 * scrape, which keyword to search, in which mode, and how many pages deep. All
 * four are things an agent derives from the conversation ("check what their
 * pricing page says", "pull the top 10 results for X") and all four have read
 * twins, so the evidence loop closes: read `scrape_mode` / `target_url` /
 * `search_keyword` / `max_pages`, write them back.
 *
 * RUNNING the scrape is deliberately NOT agent-drivable. It spends real
 * wall-clock time and puts load on someone else's server, so it stays a human
 * click — the agent stages the command, the user presses Scrape. Everything
 * downstream of a run (the results, the extracted content, the metadata) is
 * observed evidence and is read-only by nature.
 *
 * WHY ONE COMMAND OBJECT PLUS ONE SCALAR, and not four scalars or one blob:
 *
 *  - `scrape_command` bundles mode + url + keyword because they are ONE
 *    decision that must resolve ATOMICALLY. The mode picks which config input
 *    the workspace renders AND which of the two keyword stores is live (deep
 *    mode's own keyword vs. the web-search form's). Split into separate
 *    targets, an agent that sets the keyword and then the mode would have its
 *    keyword land in whichever store the PREVIOUS mode pointed at — a real
 *    race on staged React state, and one that fails silently because the user
 *    just sees an empty field. One object means the handler sees the mode and
 *    the field together and can refuse an incoherent pair outright.
 *  - `scrape_page_limit` stays separate because it is a genuinely different
 *    decision: not "what do we scrape" but "how much of someone else's server
 *    do we spend". It is routinely adjusted without touching the target, it
 *    carries its own bounds vocabulary, and it is the one field here a user
 *    might want to accept or decline on its own — which is exactly what a
 *    separate ask dialog gives them. It also has a clean 1:1 read twin
 *    (`max_pages`), which the bundled command object cannot have.
 *  - `scrape_result_limit` is `scrape_page_limit`'s twin for web-search mode,
 *    and separate for the same reason. It exists because the "Max" input beside
 *    the keyword field was not a declared read value at all until 2026-08-10,
 *    so search mode's budget could be neither read nor set; `max_results`
 *    closes that and gives this target its 1:1 twin. The ceiling is much
 *    higher than the page budget on purpose — those hits arrive unscraped.
 *
 * WHY THE TWO SELECTION TARGETS: `selected_result_page` and
 * `selected_search_hit` are not part of the command at all. They answer a
 * different question, at a different time, against different evidence: "of the
 * N things ALREADY fetched, which one is worth looking at?" That is a real
 * judgement an agent makes well after reading `results_overview` /
 * `search_hits`, and it is `mode: "ui"` — nothing is fetched, nothing is
 * persisted, and a wrong pick costs one click to undo. `selected_search_hit`
 * is deliberately the FURTHEST an agent goes toward a scrape: it can put the
 * hit it judged best in front of the user, and the user presses Scrape.
 *
 * `active_result_tab` was considered and declined on the judgement bar: it is a
 * pure mechanical view flip, and an agent already holds every representation of
 * the page in its context, so it knows nothing the user doesn't about which tab
 * they want.
 *
 * MOUNTS: `ScraperFloatingWorkspace` (the `scraperWindow` panel) is the only
 * mount that registers a `SurfaceRuntimeProvider` for this surface, so it is
 * the only mount that offers these targets. The `/scraper/*` route pages
 * (`app/(core)/scraper/**`) have their own local URL and keyword inputs but
 * mount no surface runtime at all — they emit none of this surface's read
 * values either, so an agent there has neither the evidence to write from nor
 * a handler to write through. Giving them targets would mean adopting the
 * surface on those routes first (read side included); that is its own task,
 * not a write-target one. Deepest-wins resolution means adding it later
 * shadows nothing declared here.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "scrape_command",
    label: "Scrape command",
    description:
      `Stages WHAT the workspace will scrape and in which mode. Value is a partial patch object: { mode?: ${SCRAPE_MODE_ENUM_TEXT}, url?: string, keyword?: string } — omitted keys keep their current value, and at least one key must be present. Modes: ${SCRAPE_MODES.map((m) => `"${m.value}" (${m.summary})`).join(", ")}. \`url\` applies only in "${SCRAPE_MODES.find((m) => m.input === "url")!.value}" mode and is stored normalized (https:// is added when the scheme is omitted); \`keyword\` applies only in ${SCRAPE_MODES.filter((m) => m.input === "keyword").map((m) => `"${m.value}"`).join(" and ")} mode. Sending a field the resolved mode does not use is REFUSED rather than staged into an input the user cannot see — send the mode in the SAME call as the field it enables. Take a URL from what is IN FRONT OF YOU — one in search_hits or scraped_links, or one the user gave you. Never write a URL you are recalling rather than reading: a plausible-looking address for a page that does not exist wastes the user's run against a real server. Read the current command back from scrape_mode / target_url / search_keyword. This only STAGES the command: the user still presses Scrape, and running the scrape is never an agent action. Refused while is_scraping is true — a run is in flight and the inputs are locked.`,
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    group: "target",
    sortOrder: 100,
  },
  {
    name: "scrape_page_limit",
    label: "Max pages",
    description:
      `Stages how many pages the deep ("${SCRAPE_MODES.find((m) => m.usesPageLimit)!.value}") mode will scrape — the page budget, separate from the scrape target. Value: an integer from ${PAGE_LIMIT_MIN} to ${PAGE_LIMIT_MAX} (the same bounds the deep-mode page input enforces on the user); anything outside that, or a non-integer, is refused. Applies to deep mode only — web-search mode has its own budget, scrape_result_limit. Read back from max_pages, which the surface reports only while deep mode is active. Staged only: the user still presses Search + scrape. Refused while is_scraping is true — a run is in flight and the inputs are locked.`,
    valueType: "number",
    updatesValue: "max_pages",
    mode: "draft",
    applyPolicy: "ask",
    group: "target",
    sortOrder: 110,
  },
  {
    name: "scrape_result_limit",
    label: "Max results",
    description:
      `Stages how many hits the web-search ("${SCRAPE_MODES.find((m) => m.usesResultLimit)!.value}") mode will request — the twin of scrape_page_limit for the mode that searches without scraping. Value: an integer from ${RESULT_LIMIT_MIN} to ${RESULT_LIMIT_MAX} (the same bounds the "Max" input enforces on the user); anything outside that, or a non-integer, is refused. Applies to web-search mode only. These hits come back UNSCRAPED, which is why the ceiling is far higher than the page budget: 50 hits is one search request, where 50 pages is 50 fetches against other people's servers. Read back from max_results, which the surface reports only while web-search mode is active. Staged only: the user still presses Search. Refused while is_scraping is true — a run is in flight and the inputs are locked.`,
    valueType: "number",
    updatesValue: "max_results",
    mode: "draft",
    applyPolicy: "ask",
    group: "target",
    sortOrder: 120,
  },
  {
    name: "selected_result_page",
    label: "Selected scraped page",
    description:
      "Opens one ALREADY-SCRAPED page in the results pane — the same as the user clicking it in the Pages sidebar, and it resets the pane to the Pretty tab exactly as that click does. Value is the zero-based index into results_overview (read it first; the order matches). An out-of-range index is refused with the real count. Nothing is fetched and nothing is persisted: this only changes which of the pages already in this session is on screen, so use it to put the page you just analysed in front of the user. Only available in the URL (\"quick\") and Deep (\"full\") modes, where the scraped-pages sidebar and results pane are rendered.",
    valueType: "number",
    updatesValue: "selected_result_index",
    mode: "ui",
    // Moving what the user is reading mid-thought is cheap and instantly
    // reversible, but it IS a change to their screen — same posture as
    // keyword-intelligence's `open_keyword`. Decline is a normal outcome.
    applyPolicy: "ask",
    group: "results",
    sortOrder: 410,
  },
  {
    name: "selected_search_hit",
    label: "Selected search hit",
    description:
      "Opens one web-search hit in the hit detail pane — the same as the user clicking it in the results list. Value is the zero-based index into search_hits (read it first; the order matches). An out-of-range index is refused with the real count. Nothing is fetched: this SELECTS a hit, it does not scrape it — the Scrape button beside the hit stays the user's to press. This is the useful stopping point once you have judged which hit is actually worth fetching: put it in front of the user and let them run it. Only available in the Web (\"search\") mode, where the hit list and detail pane are rendered.",
    valueType: "number",
    updatesValue: "selected_hit_index",
    mode: "ui",
    applyPolicy: "ask",
    group: "results",
    sortOrder: 422,
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
You can STAGE the next run for the user but never start it: scrape_command sets the mode and its target, scrape_page_limit the deep-mode page budget, scrape_result_limit the web-search hit budget. Staging only fills the form — the user presses Scrape, because a run spends real time against someone else's server.
selected_result_page and selected_search_hit put something ALREADY fetched on screen; neither fetches anything. When you have judged which search hit is worth scraping, select it and let the user press the button.
The scraped_* values are fetched evidence and are NOT writable — a page's body, title, links and metadata are what a real server returned, and this pane feeds RAG ingestion directly, so never try to "correct" them.
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
  scrape_mode: "quick" | "full" | "search";
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
  max_results?: number;
  scraped_url?: string;
  scraped_title?: string;
  scraped_content_text?: string;
  scraped_content_markdown?: string;
  scraped_metadata?: Record<string, unknown>;
  scraped_main_image?: string;
  scraped_links?: { internal?: string[]; external?: string[]; media?: string[] };
  selected_result_index?: number;
  search_hits?: ScraperSearchHitEntry[];
  selected_hit_index?: number;
  scrape_failure_reason?: string;
  scrape_execution_time_ms?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
