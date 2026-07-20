"use client";

import { useRouter } from "next/navigation";
import { Play, RefreshCw, ScanSearch } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useCrawls } from "@/features/marketing/data/hooks";
import type { CrawlSession } from "@/features/marketing/types";
import {
  formatCompactDate,
  formatDuration,
  jsonNumber,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";

const STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "complete", label: "Complete" },
  { value: "partial", label: "Partial" },
  { value: "failed", label: "Failed" },
];

const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "scheduled", label: "Scheduled" },
];

export function CrawlsTable() {
  const router = useRouter();
  const { site, sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "started_at", direction: "desc" },
  });
  const crawls = useCrawls(site.id, table.queryState);
  const columns: MatrxColumnDef<CrawlSession>[] = [
    {
      id: "started_at",
      accessorKey: "started_at",
      header: "Started",
      filter: false,
      cell: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-xs font-medium">
            {formatCompactDate(row.started_at ?? row.created_at)}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {row.id.slice(0, 12)}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      id: "trigger",
      accessorKey: "trigger",
      header: "Trigger",
      filter: "select",
      filterOptions: TRIGGER_OPTIONS,
      cell: (row) => <span className="text-xs capitalize">{row.trigger}</span>,
    },
    {
      id: "duration",
      header: "Duration",
      filter: false,
      sortable: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {formatDuration(row.started_at, row.finished_at)}
        </span>
      ),
    },
    {
      id: "pages",
      header: "Captured",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {jsonNumber(row.stats, ["pages_fetched"]).toLocaleString()}
        </span>
      ),
    },
    {
      id: "discovered",
      header: "Discovered",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {jsonNumber(row.stats, ["pages_discovered"]).toLocaleString()}
        </span>
      ),
    },
    {
      id: "finished_at",
      accessorKey: "finished_at",
      header: "Finished",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.finished_at)}
        </span>
      ),
    },
    {
      id: "error",
      accessorKey: "error",
      header: "Error",
      filter: false,
      sortable: false,
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-56 truncate text-xs text-destructive">
          {row.error || "—"}
        </span>
      ),
    },
  ];

  if (crawls.isError)
    return (
      <QueryError error={crawls.error} onRetry={() => void crawls.refetch()} />
    );
  return (
    <main className="h-full overflow-hidden bg-textured p-3 sm:p-4">
      <MatrxDataTable<CrawlSession>
        data={crawls.data?.rows ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={crawls.isLoading}
        isFetching={crawls.isFetching}
        query={{
          mode: "controlled",
          state: table.state,
          totalItems: crawls.data?.total ?? 0,
          onStateChange: table.onStateChange,
        }}
        toolbar={{
          searchPlaceholder: "Search status, trigger, or error…",
          actions: (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void crawls.refetch()}
                disabled={crawls.isFetching}
              >
                <RefreshCw
                  className={
                    crawls.isFetching
                      ? "h-3.5 w-3.5 animate-spin"
                      : "h-3.5 w-3.5"
                  }
                />
                Refresh
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() =>
                  router.push(`${sitePath}/crawls/new`)
                }
              >
                <Play className="h-3.5 w-3.5" /> Start crawl
              </Button>
            </div>
          ),
        }}
        detail={{ enabled: false }}
        onRowOpen={(row) =>
          router.push(`${sitePath}/crawls/${row.id}`)
        }
        emptyState={{
          icon: <ScanSearch className="h-8 w-8 text-muted-foreground" />,
          title: "No crawl sessions",
          description:
            "Crawl commands are sent directly to the scraper; durable sessions will appear here from Supabase.",
        }}
      />
    </main>
  );
}
