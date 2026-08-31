"use client";

/**
 * THE RUN URL'S ACTIONS — ONE definition of what a right-clicked
 * `web.crawl_url` row offers, shared by every surface that shows one:
 * `CrawlUrlsTable` (the full ledger) and `CrawlReportWorkspace` (the
 * per-report response-log projection of the same rows).
 *
 * Plain function, not a hook — same shape as `pageMenuSection` /
 * `snapshotMenuSection`: the host keeps the clicked row in STATE and rebuilds
 * `extraSections` off it.
 *
 * 🚨 NO NEW READ OR WRITE PATH LIVES HERE. Both items are navigation: to the
 * canonical page this URL resolved to, or to the raw URL itself.
 */

import { ExternalLink, FileSearch } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  applyAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** The one thing every run-URL-showing surface can say about a row. */
export interface CrawlUrlMenuRow {
  siteId: string;
  brandId: string | null;
  crawlUrlId: string;
  pageId: string | null;
  rawUrl: string;
}

/** There is no separate "run URL row" record — this IS the `web.crawl_url` row. */
export function crawlUrlEntityRef(
  row: CrawlUrlMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "web_crawl_url",
    id: row.crawlUrlId,
    title: row.rawUrl,
  };
}

export function crawlUrlMenuSection(
  row: CrawlUrlMenuRow | null,
  opts?: {
    label?: string;
    /** THE CONSISTENCY STEP — see `features/context-menu-v3/utils/availability.ts`. */
    unavailable?: AvailabilityMap;
  },
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "crawl-url-open-page",
      label: "Open resolved page",
      icon: FileSearch,
      href:
        row && row.pageId
          ? marketingRoutes.sitePage(row.brandId, row.siteId, row.pageId)
          : "#",
      disabled: !row || !row.pageId,
      description: "This URL did not resolve to a canonical page",
    },
    {
      kind: "link",
      id: "crawl-url-open-raw",
      label: "Open encountered URL",
      icon: ExternalLink,
      href: row?.rawUrl ?? "#",
      target: "_blank",
      disabled: !row,
    },
  ];
  return {
    id: "crawl-url-actions",
    label: opts?.label ?? "This URL",
    icon: FileSearch,
    items: applyAvailability(items, opts?.unavailable),
  };
}
