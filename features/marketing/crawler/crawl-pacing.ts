import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";

/**
 * How fast the crawler is going against a host right now, and WHY.
 *
 * Arman ruled on 2026-08-20 that a crawl must detect the host's platform, honour
 * its `robots.txt`, and otherwise start LOW and climb until the host pushes back
 * — never open at a flat rate and get rate-limited first. That makes the active
 * rate a moving number the user cannot infer from the setting they typed, and
 * crawler vision point 8 is explicit that a silently-clamped setting is a
 * defect. This is the shape that un-silences it.
 *
 * Server contract: `matrx_scraper/events.py::CrawlPacingEvent`, produced by
 * `matrx_scraper/host_pacing.py`.
 */
export interface CrawlPacingState {
  host: string;
  /** The rate in force right now. */
  currentRps: number;
  /** The most this host will be pushed to, given everything known about it. */
  ceilingRps: number;
  /**
   * The rate at which the host ACTUALLY refused us, if it ever has. `null`
   * means "not found yet" — never "unlimited".
   */
  discoveredCeilingRps: number | null;
  /** Which rule set the ceiling. Drives the human explanation below. */
  source: string;
  platform: string | null;
  platformDisplay: string | null;
  frontedBy: string | null;
  crawlDelaySeconds: number | null;
  /** True when the configured maximum is higher than what this host allows. */
  userMaxReduced: boolean;
  limitHits: number;
  /** The server's own sentences, already written for a non-technical reader. */
  notes: string[];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Read one `crawl_pacing` event, or null if this is not one. */
export function crawlPacingFromEvent(
  event: CrawlLiveEvent | null | undefined,
): CrawlPacingState | null {
  if (!event || event.event_type !== "crawl_pacing") return null;
  const host = stringOrNull(event.host);
  const currentRps = numberOrNull(event.current_rps);
  const ceilingRps = numberOrNull(event.ceiling_rps);
  if (!host || currentRps === null || ceilingRps === null) return null;
  return {
    host,
    currentRps,
    ceilingRps,
    discoveredCeilingRps: numberOrNull(event.discovered_ceiling_rps),
    source: stringOrNull(event.source) ?? "floor",
    platform: stringOrNull(event.platform),
    platformDisplay: stringOrNull(event.platform_display),
    frontedBy: stringOrNull(event.fronted_by),
    crawlDelaySeconds: numberOrNull(event.crawl_delay_seconds),
    userMaxReduced: event.user_max_reduced === true,
    limitHits: numberOrNull(event.limit_hits) ?? 0,
    notes: Array.isArray(event.notes)
      ? event.notes.filter((note): note is string => typeof note === "string")
      : [],
  };
}

/**
 * The latest pacing state for the host the crawl is actually working.
 *
 * A crawl that follows subdomains paces each host separately, so the last
 * event wins rather than being merged — showing an average of two hosts'
 * rates would be a number that describes neither.
 */
export function latestCrawlPacing(
  events: CrawlLiveEvent[],
): CrawlPacingState | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const pacing = crawlPacingFromEvent(events[index]);
    if (pacing) return pacing;
  }
  return null;
}

/** One short line naming the rule that set the ceiling. */
export function pacingSourceLabel(pacing: CrawlPacingState): string {
  switch (pacing.source) {
    case "platform_published":
      return `${pacing.platformDisplay ?? "Platform"} published limit`;
    case "platform_observed":
      return `${pacing.platformDisplay ?? "Platform"} profile`;
    case "robots_crawl_delay":
      return pacing.crawlDelaySeconds
        ? `robots.txt Crawl-delay ${pacing.crawlDelaySeconds}s`
        : "robots.txt";
    case "remembered":
      return "Learned from earlier crawls";
    case "user_max":
      return "Your configured maximum";
    default:
      return "Discovering the limit";
  }
}
