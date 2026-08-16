"use client";

/**
 * features/marketing/content-plan/hooks/usePlanMeasureOverlay.ts
 *
 * THE AFTER of a whole plan, in one read — the listing counterpart of
 * `useNodeMeasurement` (which answers the same question for the ONE node a
 * panel has open).
 *
 * The plan tree and table already carry the CMS-page overlay
 * (`useCmsPageMap`), and every entry now carries `webPageId` — the durable
 * `client_pages.web_page_id` join to the MEASURED `web.page`. That id is all a
 * row needs to (a) open the page's Measure tab and (b) say what the live page
 * is doing. This hook supplies (b) for every visible row at once, through the
 * canonical `usePageSearchPerformance` read — never a new data path, and never
 * one query per row.
 *
 * Honest states, kept distinguishable by the shape of the result:
 *   - an entry with no `webPageId` is absent from `pageIds` entirely — the
 *     publish→crawl join has not landed, so there is nothing to measure yet
 *     and the row shows no measure door at all;
 *   - a `webPageId` with no map entry is joined but has no `v_page_list` row;
 *   - a map entry with `in_gsc: false` is measured but has no Search Console
 *     rows for its URL, which is NOT the same as zero clicks.
 */
import { useMemo } from "react";

import { usePageSearchPerformance } from "@/features/marketing/data/hooks";
import type { PageSearchPerformance } from "@/features/marketing/types";

import type { CmsPageMapEntry } from "../setup/bridge";

export interface PlanMeasureOverlay {
  /** `web.page` id → its 28d Search Console standing. */
  byWebPageId: ReadonlyMap<string, PageSearchPerformance>;
  /** How many plan-realized pages are joined to a measured page at all. */
  joinedCount: number;
  isLoading: boolean;
  error: Error | null;
}

const EMPTY: ReadonlyMap<string, PageSearchPerformance> = new Map();

export function usePlanMeasureOverlay(
  pagesByNodeId: ReadonlyMap<string, CmsPageMapEntry>,
): PlanMeasureOverlay {
  const webPageIds = useMemo(() => {
    const ids: string[] = [];
    for (const page of pagesByNodeId.values()) {
      if (page.webPageId) ids.push(page.webPageId);
    }
    return ids;
  }, [pagesByNodeId]);

  const query = usePageSearchPerformance(webPageIds);

  return {
    byWebPageId: query.data ?? EMPTY,
    joinedCount: webPageIds.length,
    // `enabled: false` (nothing joined) must not read as a perpetual spinner.
    isLoading: webPageIds.length > 0 && query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
