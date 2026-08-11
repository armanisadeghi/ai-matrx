/**
 * Agent write handlers for the site settings surface
 * (`matrx-user/marketing-site-settings`).
 *
 * Every handler stages a DRAFT into the same form state the user's own typing
 * edits — never a parallel write path, never a silent persist. A bad shape
 * THROWS: the writeback seam turns a throw into an error the agent reads and
 * can correct, and silently coercing a wrong value is how an agent learns
 * nothing while the user gets a setting they did not ask for.
 *
 * Declared in `features/surfaces/manifests/marketing-site-settings.manifest.ts`
 * — the description prose there is the contract the agent actually sees.
 */

import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { CrawlStartOptions } from "@/features/marketing/crawler/direct-client";
import type { MarketingSite } from "@/features/marketing/types";

const RENDER_MODES: CrawlStartOptions["render_mode"][] = [
  "http_only",
  "http_first",
  "browser_always",
  "browser_with_screenshot",
];

const LIFECYCLE_VALUES: MarketingSite["status"][] = [
  "active",
  "paused",
  "error",
];

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object value.");
  }
  return value as Record<string, unknown>;
}

function patternList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of regular-expression strings.`);
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(`${field} entries must be non-empty strings.`);
    }
    try {
      new RegExp(entry);
    } catch (error) {
      throw new Error(
        `${field} entry ${entry} is not a valid regular expression: ${
          error instanceof Error ? error.message : "unparseable"
        }`,
      );
    }
    return entry;
  });
}

function boundedInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be a whole number.`);
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}.`);
  }
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be true or false.`);
  return value;
}

export function buildCrawlPolicyWriteHandlers(controls: {
  setCrawl: (updater: (current: CrawlStartOptions) => CrawlStartOptions) => void;
  setIncludeText: (value: string) => void;
  setExcludeText: (value: string) => void;
  setStatus: (value: MarketingSite["status"]) => void;
}): SurfaceWriteHandlers {
  return {
    crawl_scope_patterns: (value) => {
      const input = record(value);
      let touched = false;
      if (input.include_patterns !== undefined) {
        controls.setIncludeText(
          patternList(input.include_patterns, "include_patterns").join("\n"),
        );
        touched = true;
      }
      if (input.exclude_patterns !== undefined) {
        controls.setExcludeText(
          patternList(input.exclude_patterns, "exclude_patterns").join("\n"),
        );
        touched = true;
      }
      if (!touched) {
        throw new Error(
          "Provide include_patterns and/or exclude_patterns as arrays of regular-expression strings.",
        );
      }
    },

    crawl_budget: (value) => {
      const input = record(value);
      const next: Partial<CrawlStartOptions> = {};
      if (input.max_pages !== undefined) {
        next.max_pages = boundedInteger(input.max_pages, "max_pages", 1, 50_000);
      }
      if (input.concurrency !== undefined) {
        next.concurrency = boundedInteger(input.concurrency, "concurrency", 1, 32);
      }
      if (input.host_rps !== undefined) {
        next.host_rps = boundedInteger(input.host_rps, "host_rps", 1, 50);
      }
      if (input.max_depth !== undefined) {
        // null and 0 both mean "follow links as deep as they go" — the form
        // stores unlimited as null and renders it as 0.
        next.max_depth =
          input.max_depth === null
            ? null
            : boundedInteger(input.max_depth, "max_depth", 0, 100) || null;
      }
      if (!Object.keys(next).length) {
        throw new Error(
          "Provide at least one of max_pages, max_depth, concurrency, host_rps.",
        );
      }
      controls.setCrawl((current) => ({ ...current, ...next }));
    },

    crawl_behavior: (value) => {
      const input = record(value);
      const next: Partial<CrawlStartOptions> = {};
      if (input.render_mode !== undefined) {
        if (
          !RENDER_MODES.includes(input.render_mode as CrawlStartOptions["render_mode"])
        ) {
          throw new Error(
            `render_mode must be one of: ${RENDER_MODES.join(" | ")}.`,
          );
        }
        next.render_mode = input.render_mode as CrawlStartOptions["render_mode"];
      }
      for (const field of [
        "respect_robots",
        "seed_from_sitemap",
        "follow_subdomains",
        "capture_screenshots",
      ] as const) {
        if (input[field] !== undefined) {
          next[field] = bool(input[field], field);
        }
      }
      if (!Object.keys(next).length) {
        throw new Error(
          "Provide at least one of render_mode, respect_robots, seed_from_sitemap, follow_subdomains, capture_screenshots.",
        );
      }
      controls.setCrawl((current) => ({ ...current, ...next }));
    },

    site_lifecycle: (value) => {
      const input = record(value);
      const status = input.status;
      if (!LIFECYCLE_VALUES.includes(status as MarketingSite["status"])) {
        throw new Error(`status must be one of: ${LIFECYCLE_VALUES.join(" | ")}.`);
      }
      controls.setStatus(status as MarketingSite["status"]);
    },
  };
}
