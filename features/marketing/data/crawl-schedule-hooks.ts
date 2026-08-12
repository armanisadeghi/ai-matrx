"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSiteCrawlSchedule,
  saveSiteCrawlSchedule,
  setSiteCrawlScheduleEnabled,
  type SaveCrawlScheduleInput,
  type SaveCrawlScheduleResult,
} from "@/features/marketing/data/crawl-schedule-service";
import { marketingKeys } from "@/features/marketing/data/hooks";
import type { CrawlSchedule } from "@/features/marketing/types";

export const crawlScheduleKey = (siteId: string) =>
  [...marketingKeys.site(siteId), "crawl-schedule"] as const;

export function useSiteCrawlSchedule(siteId: string) {
  return useQuery({
    queryKey: crawlScheduleKey(siteId),
    queryFn: ({ signal }) => getSiteCrawlSchedule(siteId, signal),
    enabled: Boolean(siteId),
    // `next_run_at` is stamped by the server dispatcher, not by this write —
    // after a save it is NULL until the next drain (≤1 min). Refetching on
    // that cadence is what turns "Scheduling…" into a real next-run time
    // without the user reloading.
    refetchInterval: 60_000,
  });
}

function writeSchedule(
  queryClient: ReturnType<typeof useQueryClient>,
  siteId: string,
  result: SaveCrawlScheduleResult,
): void {
  const row: CrawlSchedule =
    result.status === "saved" ? result.schedule : result.current;
  queryClient.setQueryData(crawlScheduleKey(siteId), row);
}

export function useSaveSiteCrawlSchedule(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCrawlScheduleInput) => saveSiteCrawlSchedule(input),
    // A conflict still carries the CURRENT row — seeding it means the user's
    // next attempt is guarded against the real version rather than failing
    // again on the stale one they started from.
    onSuccess: (result) => writeSchedule(queryClient, siteId, result),
  });
}

export function useSetSiteCrawlScheduleEnabled(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      schedule: Pick<CrawlSchedule, "id" | "version">;
      enabled: boolean;
    }) => setSiteCrawlScheduleEnabled(input.schedule, input.enabled),
    onSuccess: (result) => writeSchedule(queryClient, siteId, result),
  });
}
