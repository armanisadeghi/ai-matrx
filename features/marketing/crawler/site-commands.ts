/**
 * The site-command family — one declaration for every streaming command the
 * scraper exposes on a site.
 *
 * Every command in `direct-client.ts` creates a DURABLE `web.crawl_session`
 * row (`scope.mode` names the command) and streams NDJSON progress until it
 * finishes. That means two things are true of all of them, and this file is
 * where both are encoded once:
 *
 *  - the run can always be WATCHED (the stream describes itself), and
 *  - the run can always be REJOINED after a reload (the session row is the
 *    durable record, and it outlives the tab that started it).
 *
 * Server contract: `matrx_scraper/web_crawl/service.py` (`scope = {"mode": …}`).
 */

import { isJsonRecord } from "@/features/marketing/types";
import type { CrawlSession } from "@/features/marketing/types";

/**
 * Modes a user launches from a marketing surface. The crawl-shaped modes
 * (`full` / `list` / `initialization` / `homepage`) are deliberately NOT here —
 * they belong to the crawl workspace and its own live feed.
 */
export const SITE_COMMAND_MODES = [
  "analysis",
  "sitemap_sync",
  "gsc_sync",
  "link_check",
  "page_fetch",
] as const;

export type SiteCommandMode = (typeof SITE_COMMAND_MODES)[number];

/** Session modes owned by the crawl workspace, not by a command surface. */
export const CRAWL_SHAPED_MODES = [
  "full",
  "list",
  "initialization",
  "homepage",
] as const;

export function isSiteCommandMode(value: string): value is SiteCommandMode {
  return SITE_COMMAND_MODES.some((mode) => mode === value);
}

export interface SiteCommandCopy {
  /** Title of the floating run window while it works. */
  runningLabel: string;
  /** Title once it finishes. */
  doneLabel: string;
  /** What the user sees before the first event lands. */
  startingMessage: string;
}

export const SITE_COMMAND_COPY: Record<SiteCommandMode, SiteCommandCopy> = {
  analysis: {
    runningLabel: "Analyzing pages",
    doneLabel: "Page analysis",
    startingMessage: "Running the audit catalogue over this site’s pages…",
  },
  sitemap_sync: {
    runningLabel: "Syncing sitemaps",
    doneLabel: "Sitemap sync",
    startingMessage: "Discovering sitemaps and ingesting their URLs…",
  },
  gsc_sync: {
    runningLabel: "Syncing Search Console",
    doneLabel: "Search Console sync",
    startingMessage: "Pulling Search Console page stats…",
  },
  link_check: {
    runningLabel: "Checking links",
    doneLabel: "Link check",
    startingMessage: "Checking internal and outbound link targets…",
  },
  page_fetch: {
    runningLabel: "Fetching page",
    doneLabel: "Page fetch",
    startingMessage: "Capturing the freshest version of this page…",
  },
};

function scopeMode(session: CrawlSession): string | null {
  if (!isJsonRecord(session.scope)) return null;
  const mode = session.scope.mode;
  return typeof mode === "string" ? mode : null;
}

/** The command a durable session belongs to, or null for a crawl-shaped one. */
export function siteCommandModeFromSession(
  session: CrawlSession,
): SiteCommandMode | null {
  const mode = scopeMode(session);
  return SITE_COMMAND_MODES.some((candidate) => candidate === mode)
    ? (mode as SiteCommandMode)
    : null;
}

/** True for the site-wide crawl the crawl workspace owns. */
export function isCrawlShapedSession(session: CrawlSession): boolean {
  const mode = scopeMode(session);
  return CRAWL_SHAPED_MODES.some((candidate) => candidate === mode);
}

/**
 * The single URL a page-fetch session targeted, recovered from the persisted
 * request. Used so a reload rejoins the fetch of the SAME page rather than
 * attaching a stranger's run to whatever page is on screen.
 */
export function siteCommandTargetFromSession(
  session: CrawlSession,
): string | null {
  if (!isJsonRecord(session.scope)) return null;
  const request = session.scope.request;
  if (!isJsonRecord(request)) return null;
  const seeds = request.seed_urls;
  if (!Array.isArray(seeds)) return null;
  const first = seeds[0];
  return typeof first === "string" && first ? first : null;
}

/** Stable identity for one watched run: one window, one store entry. */
export function siteCommandKey(
  siteId: string,
  mode: SiteCommandMode,
  target?: string | null,
): string {
  return target ? `${siteId}:${mode}:${target}` : `${siteId}:${mode}`;
}
