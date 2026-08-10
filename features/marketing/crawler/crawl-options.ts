/**
 * THE crawl-command vocabulary — the enums, bounds, and labels of the crawl
 * options the New Crawl launch form exposes.
 *
 * Why this module exists: three places have to agree on the same words and
 * numbers, and they used to agree only by re-typing.
 *   - the launch form (`components/crawls/NewCrawlWorkspace.tsx`) renders them,
 *   - the `matrx-user/marketing-crawls` surface manifest SPELLS them out to
 *     agents in its `crawl_options` write-target description,
 *   - that target's handler VALIDATES against them.
 * A manifest promising `render_mode: http_first | …` while the handler checks
 * a different list is exactly the drift that makes an agent-writable surface
 * lie, so all three import from here. Deliberately dependency-free: the
 * manifest module graph must stay free of the supabase client that
 * `crawler/direct-client.ts` pulls in.
 *
 * `CrawlStartOptions.render_mode` (direct-client.ts) derives its union from
 * `CRAWL_RENDER_MODES` here, so the type cannot drift from the runtime list.
 *
 * Not covered here: the settings workspace's own render-mode copy
 * (`components/settings/SiteSettingsWorkspace.tsx`) still carries slightly
 * different label wording for the same four modes. Left as-is — that page's
 * copy is not this surface's to restyle.
 */

/** Every render mode the scraper accepts, in the launch form's display order. */
export const CRAWL_RENDER_MODES = [
  "http_first",
  "http_only",
  "browser_always",
  "browser_with_screenshot",
] as const;

export type CrawlRenderMode = (typeof CRAWL_RENDER_MODES)[number];

export function isCrawlRenderMode(value: unknown): value is CrawlRenderMode {
  return (
    typeof value === "string" &&
    (CRAWL_RENDER_MODES as readonly string[]).includes(value)
  );
}

/** THE canonical label per render mode — the launch form's select options. */
export const CRAWL_RENDER_MODE_LABELS: Record<CrawlRenderMode, string> = {
  http_first: "HTTP, browser fallback",
  http_only: "HTTP only",
  browser_always: "Browser every page",
  browser_with_screenshot: "Browser + screenshots",
};

/**
 * The boolean knobs the launch form renders, in display order. A `Record` copy
 * map keyed by this union is what guarantees the checkboxes, the manifest
 * description, and the handler's accepted-key list stay the same set.
 */
export const CRAWL_COMMAND_TOGGLES = [
  "seed_from_sitemap",
  "follow_subdomains",
  "capture_screenshots",
  "respect_robots",
] as const;

export type CrawlCommandToggle = (typeof CRAWL_COMMAND_TOGGLES)[number];

/** THE canonical label per toggle. */
export const CRAWL_COMMAND_TOGGLE_LABELS: Record<CrawlCommandToggle, string> = {
  seed_from_sitemap: "Seed from sitemap",
  follow_subdomains: "Follow subdomains",
  capture_screenshots: "Capture screenshots",
  respect_robots: "Respect robots.txt",
};

/**
 * Page-limit bounds. The ceiling is the backend's hard cap (aidream
 * `schemas.py` `max_pages le=50_000`), not a UI preference.
 */
export const CRAWL_MAX_PAGES_BOUNDS = { min: 1, max: 50_000 } as const;

/** Parallel-fetch bounds. Above ~8 the crawl starts hurting the target host. */
export const CRAWL_CONCURRENCY_BOUNDS = { min: 1, max: 32 } as const;
