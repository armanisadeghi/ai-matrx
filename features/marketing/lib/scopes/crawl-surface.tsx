"use client";

/**
 * Shared nested runtime provider for the `matrx-user/marketing-crawl` surface.
 *
 * Every workspace under `/crawls/[crawlId]/**` (summary, URL ledger, event
 * log, snapshots inspection, technical reports) is the SAME surface — one
 * frozen `web.crawl_session`. This one primitive registers the surface with
 * the route-carried `crawl_id` plus whatever session evidence the consumer
 * has ALREADY loaded (never fetches). Spread on top of
 * `useMarketingSiteSurfaceBase().getBaseValues()` so the inherited brand/site
 * context always rides along. Consumers: CrawlSummary, CrawlReportWorkspace,
 * CrawlUrlsTable, CrawlLogsTable, CrawlSnapshotsInspectionTable.
 */

import type { ReactNode } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingCrawlScope } from "@/features/surfaces/manifests/marketing-crawl.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { isJsonRecord, type CrawlSession } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

export const MARKETING_CRAWL_SURFACE_NAME =
  "matrx-user/marketing-crawl" as const;

function jsonRecord(value: Json | null): Record<string, unknown> | undefined {
  return value !== null && isJsonRecord(value) ? value : undefined;
}

export function CrawlSurfaceProvider({
  crawlId,
  crawl,
  reportKey,
  getReportSummary,
  children,
}: {
  crawlId: string;
  /** The already-loaded session row, when the consumer has it (else omit). */
  crawl?: CrawlSession | null;
  /** Stable technical-report key when a /reports/* child is open. */
  reportKey?: string;
  /**
   * Cheap aggregate of the loaded report rows — called only at Run time,
   * never on mount. Return undefined while nothing is loaded.
   */
  getReportSummary?: () => Record<string, unknown> | undefined;
  children: ReactNode;
}) {
  const { getBaseValues } = useMarketingSiteSurfaceBase();

  return (
    <SurfaceRuntimeProvider
      surfaceName={MARKETING_CRAWL_SURFACE_NAME}
      surfaceLabel="Crawl Session"
      getScope={() =>
        createMarketingCrawlScope({
          ...getBaseValues(),
          crawl_id: crawlId,
          crawl_status: crawl?.status ?? undefined,
          crawl_stats: crawl ? jsonRecord(crawl.stats) : undefined,
          crawl_scope: crawl ? jsonRecord(crawl.scope) : undefined,
          crawl_error: crawl?.error ?? undefined,
          report_key: reportKey,
          report_summary: getReportSummary?.(),
        })
      }
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
