import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import {
  createScraperScope,
  type ScrapeMode,
  type ScraperResultOverviewEntry,
  type ScraperSearchHitEntry,
} from "@/features/surfaces/manifests/scraper.manifest";
import type { ScraperResult } from "@/features/scraper/hooks/useScraperApi";
import type { SearchResultItem } from "@/features/scraper/types/scraper-api";
import type { ScrapedDetailTabId } from "@/features/scraper/parts/ScrapedResultDetailTabs";
import { contentLength } from "@/features/scraper/utils/scraper-floating-helpers";
import {
  toScrapeMode,
  type WorkspaceMode,
} from "@/features/scraper/scrape-command";

/**
 * Placements offered by the scraper context menu (target wiring with
 * surfaceName) — agent actions and quick actions.
 *
 * `content-block` (insert a template at the cursor) is intentionally excluded:
 * the config-region menus pass `getTextarea={() => null}` (the URL / keyword
 * fields are single-line ProInputs, not an editable textarea) and the results
 * region is read-only, so a content-block row would have nowhere to insert and
 * silently no-op.
 */
export const SCRAPER_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.QUICK_ACTION,
] as const;

/**
 * Shared menu props for `matrx-user/scraper`.
 *
 * `sourceFeature` is trace-attribution only; `surfaceName` is what drives
 * surface-binding resolution. `"scraper"` is the surface's own attribution
 * literal in the `SourceFeature` union
 * (`features/agents/types/instance.types.ts`).
 *
 * `isEditable` defaults to `true` here (the editable URL / keyword config
 * region); the presentational results region passes `isEditable={false}`.
 */
export const SCRAPER_CONTEXT_MENU_PROPS = {
  sourceFeature: "scraper" as const,
  surfaceName: "matrx-user/scraper" as const,
  isEditable: true as const,
  enabledPlacements: [...SCRAPER_CONTEXT_MENU_PLACEMENTS],
};

/** The workspace's three input modes mapped onto the manifest's `scrape_mode`. */
export type ScraperWorkspaceMode = "web" | "url" | "batch";

export const MODE_TO_SCRAPE_MODE: Record<ScraperWorkspaceMode, ScrapeMode> = {
  // Single-URL quick scrape.
  url: "quick",
  // Keyword search → scrape N pages (the "deep" mode).
  batch: "full",
  // Keyword web search (no scrape until a hit is opened).
  web: "search",
};

/**
 * The inverse of {@link MODE_TO_SCRAPE_MODE} — the wire `scrape_mode` an agent
 * reads and writes, back to the workspace's internal mode id.
 *
 * Derived by inverting the map rather than re-typed, so the `scrape_request`
 * write handler can never accept a mode the context builder doesn't emit.
 */
export const SCRAPE_MODE_TO_WORKSPACE_MODE = Object.fromEntries(
  Object.entries(MODE_TO_SCRAPE_MODE).map(([workspaceMode, scrapeMode]) => [
    scrapeMode,
    workspaceMode as ScraperWorkspaceMode,
  ]),
) as Record<ScrapeMode, ScraperWorkspaceMode>;

/** Map the live `links` bag onto the manifest's `{ internal, external, media }`. */
function buildLinkGroups(links: ScraperResult["links"] | undefined): {
  internal: string[];
  external: string[];
  media: string[];
} {
  const media = [
    ...(links?.images ?? []),
    ...(links?.videos ?? []),
    ...(links?.audio ?? []),
    ...(links?.documents ?? []),
  ].filter(Boolean);
  return {
    internal: links?.internal ?? [],
    external: links?.external ?? [],
    media,
  };
}

/** One row of the sidebar's page list → the `results_overview` entry shape. */
function toOverviewEntry(r: ScraperResult): ScraperResultOverviewEntry {
  const chars = contentLength(r);
  return {
    url: r.url,
    title: r.overview?.page_title || "",
    char_count: chars,
    has_content: chars > 0,
  };
}

/** One web-search hit → the `search_hits` entry shape. */
function toSearchHitEntry(hit: SearchResultItem): ScraperSearchHitEntry {
  return {
    title: hit.title || "",
    url: hit.url || "",
    snippet: hit.description || hit.snippet || undefined,
    rank: typeof hit.rank === "number" ? hit.rank : undefined,
  };
}

export interface BuildScraperContextDataArgs {
  /** Current workspace input mode. */
  mode: ScraperWorkspaceMode;
  /** The selected scraped result the user is reading (null before any scrape). */
  selected: ScraperResult | null;
  /** Which results tab is currently active. */
  activeTab: ScrapedDetailTabId;
  /** Text the user highlighted in the presentational content (empty if none). */
  selection?: string;
  /**
   * Hook-level error for the in-flight operation, when the most recent scrape
   * failed. Per-row failures surface here (the workspace forwards `activeError`).
   */
  failureReason?: string | null;
  /** The URL typed in the single-URL input (may not be scraped yet). */
  targetUrl?: string;
  /** The keyword typed for web-search / deep mode. */
  searchKeyword?: string;
  /** Max pages configured for deep (search + scrape) mode. */
  maxPages?: number;
  /** Every scraped page in this session's sidebar list. */
  results?: ScraperResult[];
  /** Zero-based index of `selected` within `results`. */
  selectedIndex?: number;
  /** Web-search hits from keyword mode (not yet scraped). */
  searchHits?: SearchResultItem[];
  /** True while any scrape/search request is in flight. */
  isScraping?: boolean;
}

/**
 * Canonical `contextData` for `matrx-user/scraper`. Pure mapping of live
 * workspace state → `createScraperScope(...)` using the manifest's exact value
 * names. Baselines emitted real: `content` = the scraped text the user reads,
 * `selection` = highlighted text, `context` = a compact scrape summary blob.
 *
 * Intentionally NOT emitted (nothing in the FE holds them): raw HTML — the FE
 * `ScraperResult` (useScraperApi) only retains text/markdown variants — and
 * the target server's HTTP status code, which the hook surfaces via
 * diagnostics, not a code.
 */
export function buildScraperContextData(
  args: BuildScraperContextDataArgs,
): Record<string, unknown> {
  const {
    mode,
    selected,
    activeTab,
    selection = "",
    failureReason,
    targetUrl,
    searchKeyword,
    maxPages,
    results = [],
    selectedIndex,
    searchHits = [],
    isScraping = false,
  } = args;

  const scrapeMode = toScrapeMode(mode);
  const resultsOverview = results.map(toOverviewEntry);
  const hitEntries = searchHits.map(toSearchHitEntry);

  // Guaranteed keys — emitted on every launch regardless of scrape state.
  const base = {
    scrape_mode: scrapeMode,
    active_result_tab: activeTab as string,
    results_overview: resultsOverview,
    result_count: resultsOverview.length,
    search_hit_count: hitEntries.length,
    is_scraping: isScraping,
    target_url: targetUrl?.trim() || undefined,
    search_keyword: searchKeyword?.trim() || undefined,
    max_pages: maxPages || undefined,
    search_hits: hitEntries.length > 0 ? hitEntries : undefined,
    selected_result_index:
      results.length > 0 && typeof selectedIndex === "number"
        ? selectedIndex
        : undefined,
  };

  if (!selected) {
    // Nothing scraped yet — emit the always-honest run/target state + an
    // empty context blob so a binding to a generic value never resolves to
    // nothing.
    return createScraperScope({
      ...base,
      scrape_success: false,
      scrape_failure_reason: failureReason || undefined,
      context: { surface: "scraper", mode: scrapeMode, hasResult: false },
    }) as Record<string, unknown>;
  }

  const text = selected.plainTextContent || selected.textContent || "";
  const markdown = selected.markdownRenderable || "";
  const title = selected.overview?.page_title || "";
  const charCount =
    typeof selected.overview?.char_count === "number"
      ? selected.overview.char_count
      : text.length;
  const links = buildLinkGroups(selected.links);
  const executionTimeMs =
    typeof selected.metadata?.execution_time_ms === "number"
      ? selected.metadata.execution_time_ms
      : undefined;
  // A row that produced text is a success; an empty body means the page came
  // back blank (the workspace shows the same amber "empty" state).
  const succeeded = text.length > 0;

  const context: Record<string, unknown> = {
    surface: "scraper",
    mode: scrapeMode,
    active_tab: activeTab,
    url: selected.url,
    title,
    char_count: charCount,
    image_count: selected.images?.length ?? 0,
    internal_link_count: links.internal.length,
    external_link_count: links.external.length,
    succeeded,
  };

  return createScraperScope({
    ...base,
    scraped_url: selected.url || undefined,
    scraped_title: title || undefined,
    scraped_content_text: text || undefined,
    scraped_content_markdown: markdown || undefined,
    scraped_metadata: selected.metadata as Record<string, unknown>,
    scraped_main_image: selected.mainImage || undefined,
    scraped_links: links,
    scrape_success: succeeded,
    scrape_failure_reason: succeeded
      ? undefined
      : failureReason || undefined,
    scrape_execution_time_ms: executionTimeMs,

    // Baselines — real values from the surface.
    selection: selection || undefined,
    content: text || undefined,
    context,
  }) as Record<string, unknown>;
}
