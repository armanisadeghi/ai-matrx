/**
 * How often the site's live crawl state is re-read from the database.
 *
 * Realtime (Postgres Changes on web.crawl_session) is an accelerator, never the
 * only path: on 2026-09-30 its replication slot was vanishing hourly and it
 * delivered one UPDATE in 30 s of 5-second heartbeats while the socket still
 * reported "connected" — so the header badge froze at a stale count. While any
 * session is live the page re-reads on the crawler's own heartbeat cadence
 * (matrx-scraper `progress_every_seconds`, 5 s); idle and healthy, it is quiet.
 */
export const CRAWL_HEARTBEAT_MS = 5_000;
const DEGRADED_REALTIME_POLL_MS = 3_000;

export function crawlActivityRefetchInterval({
  realtimeDegraded,
  liveSessions,
}: {
  realtimeDegraded: boolean;
  liveSessions: number;
}): number | false {
  if (realtimeDegraded) return DEGRADED_REALTIME_POLL_MS;
  return liveSessions > 0 ? CRAWL_HEARTBEAT_MS : false;
}
