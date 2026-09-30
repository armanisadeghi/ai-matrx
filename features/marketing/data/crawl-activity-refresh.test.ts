/**
 * The header crawl badge must track server state even when Supabase Realtime's
 * Postgres-changes feed silently drops rows while its socket still reports
 * "connected" (2026-09-30: realtime logs show the replication slot vanishing
 * hourly; one UPDATE delivered in 30 s of 5-second heartbeats). A live run is
 * re-read on the crawler's own heartbeat cadence no matter what the socket says.
 */
import {
  CRAWL_HEARTBEAT_MS,
  crawlActivityRefetchInterval,
} from "@/features/marketing/data/crawl-activity-refresh";

describe("crawlActivityRefetchInterval", () => {
  it("re-reads a live run on the heartbeat cadence while realtime claims to be connected", () => {
    expect(crawlActivityRefetchInterval({ realtimeDegraded: false, liveSessions: 1 })).toBe(
      CRAWL_HEARTBEAT_MS,
    );
  });

  it("stays quiet when nothing runs and realtime is healthy", () => {
    expect(crawlActivityRefetchInterval({ realtimeDegraded: false, liveSessions: 0 })).toBe(false);
  });

  it("keeps the faster fallback poll when realtime is degraded", () => {
    expect(crawlActivityRefetchInterval({ realtimeDegraded: true, liveSessions: 0 })).toBe(3_000);
    expect(crawlActivityRefetchInterval({ realtimeDegraded: true, liveSessions: 2 })).toBe(3_000);
  });
});
