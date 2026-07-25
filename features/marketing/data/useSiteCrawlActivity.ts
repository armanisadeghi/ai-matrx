"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/utils/supabase/client";
import { uniqueChannelTopic } from "@/utils/supabase/realtime";
import {
  marketingKeys,
  useActiveCrawl,
  useRecentLiveCrawlEvents,
} from "@/features/marketing/data/hooks";
import {
  crawlLiveEventFromDurableRow,
  type CrawlLiveEvent,
} from "@/features/marketing/crawler/direct-client";
import type { CrawlSession } from "@/features/marketing/types";

const BACKOFF_RESET_AFTER_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export type CrawlRealtimeStatus =
  "connecting" | "connected" | "reconnecting" | "disconnected";

export interface SiteCrawlActivity {
  activeCrawl: CrawlSession | null;
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
export function useSiteCrawlActivity(siteId: string): SiteCrawlActivity {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] =
    useState<CrawlRealtimeStatus>("connecting");
  const fallbackPolling = realtimeStatus !== "connected";
  const active = useActiveCrawl(siteId, fallbackPolling);
  const activeId = active.data?.id ?? null;
  const activeIdRef = useRef<string | null>(activeId);
  const durableEvents = useRecentLiveCrawlEvents(
    siteId,
    activeId,
    fallbackPolling,
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!siteId) return undefined;
    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffResetTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const clearTimers = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (backoffResetTimer) clearTimeout(backoffResetTimer);
      reconnectTimer = null;
      backoffResetTimer = null;
    };

    const subscribe = (catchUpAfterConnect: boolean) => {
      if (disposed) return;
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }

      channel = supabase
        .channel(uniqueChannelTopic(`marketing-crawls:${siteId}`))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "web",
            table: "crawl_session",
            filter: `site_id=eq.${siteId}`,
          },
          () => catchUpCrawlActivity(queryClient, siteId, activeIdRef.current),
        )
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            setRealtimeStatus("connected");
            if (backoffResetTimer) clearTimeout(backoffResetTimer);
            backoffResetTimer = setTimeout(() => {
              reconnectAttempt = 0;
              backoffResetTimer = null;
            }, BACKOFF_RESET_AFTER_MS);
            if (catchUpAfterConnect) {
              catchUpCrawlActivity(queryClient, siteId, activeIdRef.current);
            }
            return;
          }
          if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
          setRealtimeStatus("reconnecting");
          if (reconnectTimer) return;
          const delay = Math.min(
            1_000 * 2 ** reconnectAttempt,
            MAX_RECONNECT_DELAY_MS,
          );
          reconnectAttempt += 1;
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            subscribe(true);
          }, delay);
        });
    };

    subscribe(true);

    return () => {
      disposed = true;
      clearTimers();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient, siteId]);

  const restoredEvents = (durableEvents.data ?? []).flatMap((row) => {
    const event = crawlLiveEventFromDurableRow(row);
    return event ? [event] : [];
  });

  return {
    activeCrawl: active.data ?? null,
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
