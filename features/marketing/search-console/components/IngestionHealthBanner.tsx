"use client";

/**
 * The loud "your data is not current" banner.
 *
 * WHY THIS EXISTS (2026-08-04): GSC ingestion was 100% dead for five days.
 * Every layer recorded it — `seo.collection_run` said failed,
 * `scheduler.sch_run` said "7 site syncs failed" every night — and NOTHING
 * surfaced it, so the dashboard served one stale day as though it were the
 * whole truth. A failure recorded where no human reads is a failure not
 * recorded. This is the layer that reaches a human on the page they
 * actually open.
 */

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { getGscIngestionHealth } from "@/features/marketing/search-console/data";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

export function IngestionHealthBanner({
  siteId,
  onSync,
  syncing,
  canSync,
}: {
  siteId: string;
  onSync: () => void;
  syncing: boolean;
  canSync: boolean;
}) {
  const health = useQuery({
    queryKey: ["marketing", "gsc", "health", siteId],
    queryFn: ({ signal }) => getGscIngestionHealth(siteId, signal),
    staleTime: 60 * 1000,
  });

  const row = health.data;
  // A failed health read must never hide the dashboard — but it also must
  // not masquerade as "healthy".
  if (health.isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs text-foreground">
          Could not check ingestion health for this site.
        </p>
      </div>
    );
  }
  if (!row || row.is_healthy || !row.problem) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">
          Search Console data is not up to date
        </p>
        <p className="text-[11px] text-muted-foreground">{row.problem}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <CopyButtons
          size="xs"
          label="Search Console ingestion health"
          human={() =>
            humanLines([
              ["Problem", row.problem],
              ["Data first date", row.data_first_date],
              ["Data last date", row.data_last_date],
              ["Days of data", row.covered_days],
              ["Expected through", row.expected_last_date],
              ["Days behind", row.days_behind],
              ["Last run", row.last_run_at],
              ["Last run status", row.last_run_status],
              ["Last run error", row.last_run_error],
              ["Consecutive failures", row.consecutive_failures],
              ["Last success", row.last_success_at],
            ])
          }
          agent={() => ({
            kind: "web-gsc-ingestion-health",
            location: webLocation("Search Console"),
            description:
              "Why this site's Search Console data is stale — coverage span, days behind, and the most recent collection run outcome.",
            data: row,
            attributes: { site_id: siteId },
          })}
          json={() => row}
        />
        {canSync ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 text-[11px]"
            disabled={syncing}
            onClick={onSync}
          >
            {syncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Sync now
          </Button>
        ) : null}
      </div>
    </div>
  );
}
