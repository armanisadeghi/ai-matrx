import { isJsonRecord } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";
import {
  defaultCrawlOptions,
  type CrawlStartOptions,
} from "@/features/marketing/crawler/direct-client";

/**
 * THE one crawl_defaults round-trip. Site settings and the launch form both
 * read and write through this module — the previous two partial mappers
 * disagreed on render modes and destroyed advanced fields on save
 * (docs/MARKETING_PROGRAM_BOARD.md "Crawl defaults are lossy").
 */

const RENDER_MODES: readonly CrawlStartOptions["render_mode"][] = [
  "http_only",
  "http_first",
  "browser_always",
  "browser_with_screenshot",
];

function readNumber(raw: Json | undefined, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? raw
    : fallback;
}

function readBoolean(raw: Json | undefined, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function readStringArray(raw: Json | undefined, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.filter((item): item is string => typeof item === "string");
}

/** Parse the FULL CrawlStartOptions contract out of site.settings. */
export function crawlOptionsFromSettings(settings: Json): CrawlStartOptions {
  const root = isJsonRecord(settings) ? settings : {};
  const raw = isJsonRecord(root.crawl_defaults) ? root.crawl_defaults : {};
  const renderMode = raw.render_mode;
  return {
    max_pages: readNumber(raw.max_pages, defaultCrawlOptions.max_pages),
    max_depth:
      typeof raw.max_depth === "number" && raw.max_depth > 0
        ? raw.max_depth
        : defaultCrawlOptions.max_depth,
    concurrency: readNumber(raw.concurrency, defaultCrawlOptions.concurrency),
    follow_subdomains: readBoolean(
      raw.follow_subdomains,
      defaultCrawlOptions.follow_subdomains,
    ),
    respect_robots: readBoolean(
      raw.respect_robots,
      defaultCrawlOptions.respect_robots,
    ),
    seed_from_sitemap: readBoolean(
      raw.seed_from_sitemap,
      defaultCrawlOptions.seed_from_sitemap,
    ),
    include_patterns: readStringArray(
      raw.include_patterns,
      defaultCrawlOptions.include_patterns,
    ),
    exclude_patterns: readStringArray(
      raw.exclude_patterns,
      defaultCrawlOptions.exclude_patterns,
    ),
    politeness_delay_ms:
      typeof raw.politeness_delay_ms === "number" &&
      Number.isFinite(raw.politeness_delay_ms) &&
      raw.politeness_delay_ms >= 0
        ? raw.politeness_delay_ms
        : defaultCrawlOptions.politeness_delay_ms,
    render_mode: RENDER_MODES.includes(
      renderMode as CrawlStartOptions["render_mode"],
    )
      ? (renderMode as CrawlStartOptions["render_mode"])
      : defaultCrawlOptions.render_mode,
    capture_screenshots: readBoolean(
      raw.capture_screenshots,
      defaultCrawlOptions.capture_screenshots,
    ),
    screenshot_kinds: readStringArray(
      raw.screenshot_kinds,
      defaultCrawlOptions.screenshot_kinds,
    ),
    seed_urls: readStringArray(raw.seed_urls, defaultCrawlOptions.seed_urls),
    list_mode: readBoolean(raw.list_mode, defaultCrawlOptions.list_mode),
    host_rps: readNumber(raw.host_rps, defaultCrawlOptions.host_rps),
    host_burst: readNumber(raw.host_burst, defaultCrawlOptions.host_burst),
  };
}

/**
 * Serialize the full contract back into settings, merging: unknown keys some
 * other authority wrote inside crawl_defaults survive, and sibling settings
 * keys are untouched. Returns the new `settings` object to persist.
 */
export function settingsWithCrawlDefaults(
  settings: Json,
  options: CrawlStartOptions,
): Record<string, Json> {
  const root = isJsonRecord(settings) ? settings : {};
  const existing = isJsonRecord(root.crawl_defaults) ? root.crawl_defaults : {};
  return {
    ...root,
    crawl_defaults: {
      ...existing,
      max_pages: options.max_pages,
      max_depth: options.max_depth,
      concurrency: options.concurrency,
      follow_subdomains: options.follow_subdomains,
      respect_robots: options.respect_robots,
      seed_from_sitemap: options.seed_from_sitemap,
      include_patterns: options.include_patterns,
      exclude_patterns: options.exclude_patterns,
      politeness_delay_ms: options.politeness_delay_ms,
      render_mode: options.render_mode,
      capture_screenshots: options.capture_screenshots,
      screenshot_kinds: options.screenshot_kinds,
      seed_urls: options.seed_urls,
      list_mode: options.list_mode,
      host_rps: options.host_rps,
      host_burst: options.host_burst,
    },
  };
}

export interface InvalidCrawlPattern {
  field: "include_patterns" | "exclude_patterns";
  pattern: string;
  error: string;
}

/**
 * Validate include/exclude regexes BEFORE the request leaves the browser —
 * the server historically accepted invalid patterns and silently skipped
 * them, widening constrained crawls ("Crawler input fails open").
 */
export function invalidCrawlPatterns(
  options: Pick<CrawlStartOptions, "include_patterns" | "exclude_patterns">,
): InvalidCrawlPattern[] {
  const problems: InvalidCrawlPattern[] = [];
  const check = (field: InvalidCrawlPattern["field"], patterns: string[]) => {
    for (const pattern of patterns) {
      if (!pattern.trim()) {
        problems.push({ field, pattern, error: "Empty pattern" });
        continue;
      }
      try {
        new RegExp(pattern);
      } catch (error) {
        problems.push({
          field,
          pattern,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  check("include_patterns", options.include_patterns);
  check("exclude_patterns", options.exclude_patterns);
  return problems;
}

/** Parse one-pattern-per-line textarea input into a pattern list. */
export function parsePatternLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
