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
import { formatDuration } from "@/features/marketing/components/shared/MarketingUi";
import { isJsonRecord, type CrawlSession } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

export const MARKETING_CRAWL_SURFACE_NAME =
  "matrx-user/marketing-crawl" as const;

/** Which child workspace of the session is mounted — emitted as `crawl_view`. */
export type CrawlSurfaceView =
  | "summary"
  | "urls"
  | "logs"
  | "snapshots"
  | "links"
  | "reports"
  | "report";

function jsonRecord(value: Json | null): Record<string, unknown> | undefined {
  return value !== null && isJsonRecord(value) ? value : undefined;
}

export function CrawlSurfaceProvider({
  crawlId,
  crawl,
  view,
  getViewSummary,
  reportKey,
  getReportSummary,
  children,
}: {
  crawlId: string;
  /** The already-loaded session row, when the consumer has it (else omit). */
  crawl?: CrawlSession | null;
  /** Which child workspace this is — every consumer declares itself. */
  view: CrawlSurfaceView;
  /**
   * Cheap aggregate of the rows the open view has loaded ({ loaded_rows,
   * total_rows }) — called only at Run time, never on mount. Return undefined
   * while nothing is loaded, and omit entirely for views with no table.
   */
  getViewSummary?: () => Record<string, unknown> | undefined;
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
      getScope={() =>
        createMarketingCrawlScope({
          ...getBaseValues(),
          crawl_id: crawlId,
          crawl_view: view,
          crawl_trigger: crawl?.trigger ?? undefined,
          crawl_created_at: crawl?.created_at ?? undefined,
          crawl_started_at: crawl?.started_at ?? undefined,
          crawl_finished_at: crawl?.finished_at ?? undefined,
          crawl_duration: crawl
            ? formatDuration(crawl.started_at, crawl.finished_at)
            : undefined,
          crawl_status: crawl?.status ?? undefined,
          crawl_stats: crawl ? jsonRecord(crawl.stats) : undefined,
          crawl_scope: crawl ? jsonRecord(crawl.scope) : undefined,
          crawl_error: crawl?.error ?? undefined,
          crawl_metadata: crawl ? jsonRecord(crawl.metadata) : undefined,
          crawl_session: crawl
            ? (crawl as unknown as Record<string, unknown>)
            : undefined,
          view_summary: getViewSummary?.(),
          report_key: reportKey,
          report_summary: getReportSummary?.(),
        })
      }
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
