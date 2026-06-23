import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import { createScraperScope } from "@/features/surfaces/manifests/scraper.manifest";
import type { ScraperResult } from "@/features/scraper/hooks/useScraperApi";
import type { ScrapedDetailTabId } from "@/features/scraper/parts/ScrapedResultDetailTabs";

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

const MODE_TO_SCRAPE_MODE: Record<
  ScraperWorkspaceMode,
  "quick" | "full" | "search"
> = {
  // Single-URL quick scrape.
  url: "quick",
  // Keyword search → scrape N pages (the "deep" mode).
  batch: "full",
  // Keyword web search (no scrape until a hit is opened).
  web: "search",
};

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
}

/**
 * Canonical `contextData` for `matrx-user/scraper`. Pure mapping of live
 * workspace state → `createScraperScope(...)` using the manifest's exact value
 * names. Baselines emitted real: `content` = the scraped text the user reads,
 * `selection` = highlighted text, `context` = a compact scrape summary blob.
 */
export function buildScraperContextData(
  args: BuildScraperContextDataArgs,
): Record<string, unknown> {
  const { mode, selected, activeTab, selection = "", failureReason } = args;

  const scrapeMode = MODE_TO_SCRAPE_MODE[mode];

  if (!selected) {
    // Nothing scraped yet — emit only the always-honest mode/tab + an empty
    // context blob so a binding to a generic value never resolves to nothing.
    return createScraperScope({
      scrape_mode: scrapeMode,
      active_result_tab: activeTab,
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
    scraped_url: selected.url || undefined,
    scraped_title: title || undefined,
    scrape_mode: scrapeMode,
    scraped_content_text: text || undefined,
    scraped_content_markdown: markdown || undefined,
    // `scraped_content_html` is intentionally omitted — the FE `ScraperResult`
    // (useScraperApi) never retains raw HTML, only text/markdown variants.
    scraped_metadata: selected.metadata as Record<string, unknown>,
    scraped_main_image: selected.mainImage || undefined,
    scraped_links: links,
    scrape_success: succeeded,
    scrape_failure_reason: succeeded
      ? undefined
      : failureReason || undefined,
    // `scrape_http_status` is intentionally omitted — not present on the FE
    // `ScraperResult`; the hook surfaces failures via diagnostics, not a code.
    scrape_execution_time_ms: executionTimeMs,
    active_result_tab: activeTab,

    // Baselines — real values from the surface.
    selection: selection || undefined,
    content: text || undefined,
    context,
  }) as Record<string, unknown>;
}
