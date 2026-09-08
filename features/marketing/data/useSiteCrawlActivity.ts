"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { defineChannelNamespace, type RealtimeStatus } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import {
  marketingKeys,
  useActiveCrawlSessions,
  useRecentLiveCrawlEvents,
} from "@/features/marketing/data/hooks";
import { isCrawlShapedSession } from "@/features/marketing/crawler/site-commands";
import {
  crawlLiveEventFromDurableRow,
  type CrawlLiveEvent,
} from "@/features/marketing/crawler/direct-client";
import type { CrawlSession } from "@/features/marketing/types";


/**
 * The channel's live state, straight from `@ai-matrx/realtime`. Aliased rather
 * than redeclared so the two can never drift into a silent mapping bug.
 */
export type CrawlRealtimeStatus = RealtimeStatus;

export interface SiteCrawlActivity {
  /**
   * The live site-wide CRAWL (`full` / `list` / `initialization` / `homepage`),
   * never a command session. A GSC sync reading as "a crawl is running" is
   * what taking the newest active row of any mode used to produce.
   */
  activeCrawl: CrawlSession | null;
  /**
   * Every live session for this site, commands included. `useSiteCommandRun`
   * reads this to rejoin a command that was already running when the page
   * loaded — the durable half of THE FLOATING LAW.
   */
  activeSessions: CrawlSession[];
  events: CrawlLiveEvent[];
  isLoading: boolean;
  error: Error | null;
  realtimeStatus: CrawlRealtimeStatus;
  refresh: () => void;
}

function catchUpCrawlActivity(
  queryClient: QueryClient,
  siteId: string,
  crawlId: string | null,
): void {
  void queryClient.invalidateQueries({
    queryKey: marketingKeys.crawlSessions(siteId),
  });
  if (!crawlId) return;
  void queryClient.invalidateQueries({
    queryKey: marketingKeys.liveCrawlEvents(siteId, crawlId),
    exact: true,
  });
  void queryClient.invalidateQueries({
    queryKey: marketingKeys.crawl(siteId, crawlId),
    exact: true,
  });
}

/**
 * One site-scoped Realtime owner for crawl activity.
 *
 * crawl_session is the low-frequency heartbeat. Every heartbeat catches up
 * the bounded durable event feed, so refreshes and connection gaps lose
 * nothing without broadcasting enormous page_parsed payloads.
 */
/** One place names this channel. A second, different declaration throws. */
const crawlActivityChannel = defineChannelNamespace({
  namespace: "marketing-crawls",
  parts: ["siteId"],
  description: "web.crawl_session rows for one marketing site",
});

export function useSiteCrawlActivity(siteId: string): SiteCrawlActivity {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] =
    useState<CrawlRealtimeStatus>("connecting");
  const fallbackPolling = realtimeStatus !== "connected";
  const active = useActiveCrawlSessions(siteId, fallbackPolling);
  const activeSessions = active.data ?? [];
  const activeCrawl = activeSessions.find(isCrawlShapedSession) ?? null;
  const activeId = activeCrawl?.id ?? null;
  const activeIdRef = useRef<string | null>(activeId);
  const durableEvents = useRecentLiveCrawlEvents(
    siteId,
    activeId,
    fallbackPolling,
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // REALTIME: `@ai-matrx/realtime` owns this channel. What was here was a raw
  // `.channel(...).subscribe()` plus ~55 lines of the package's own job — a
  // reconnect ladder, an attempt counter, a 30s backoff-reset timer, a
  // catch-up-after-connect flag and manual teardown. It reconnected on a
  // channel error but knew nothing about a slept tab, so a laptop that closed
  // mid-crawl reopened to a progress view frozen at the last event it heard,
  // with the status dot still reading "connected".
  const { status } = useChannel(
    siteId
      ? {
          topic: crawlActivityChannel.topic({ siteId }),
          postgresChanges: [
            {
              event: "*",
              schema: "web",
              table: "crawl_session",
              filter: `site_id=eq.${siteId}`,
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              fingerprint: (row) =>
                JSON.stringify([row.status ?? null, row.updated_at ?? null]),
              onChange: () =>
                catchUpCrawlActivity(queryClient, siteId, activeIdRef.current),
            },
          ],
          // Realtime has no replay. Reconnect, tab wake, network restore and
          // queue overflow all land here — one catch-up read, not a poll.
          onBackfill: () =>
            catchUpCrawlActivity(queryClient, siteId, activeIdRef.current),
        }
      : null,
  );

  // The polling fallback is gated on the SAME truth the package reports, so a
  // degraded channel still shows a degraded dot and still polls. The two unions
  // are identical by construction — `CrawlRealtimeStatus` is the package's
  // `RealtimeStatus`, which is why this is an assignment and not a mapping.
  useEffect(() => {
    setRealtimeStatus(status);
  }, [status]);

  const restoredEvents = (durableEvents.data ?? []).flatMap((row) => {
    const event = crawlLiveEventFromDurableRow(row);
    return event ? [event] : [];
  });

  return {
    activeCrawl,
    activeSessions,
    events: restoredEvents,
    isLoading: active.isLoading,
    error:
      active.error instanceof Error
        ? active.error
        : durableEvents.error instanceof Error
          ? durableEvents.error
          : null,
    realtimeStatus,
    refresh: () =>
      catchUpCrawlActivity(queryClient, siteId, activeIdRef.current),
  };
}
