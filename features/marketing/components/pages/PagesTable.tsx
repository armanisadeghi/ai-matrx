"use client";

import { useRouter } from "next/navigation";
import { FileQuestion, RefreshCw } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { usePages } from "@/features/marketing/data/hooks";
import type { PageListRow } from "@/features/marketing/types";
import {
  displayScore,
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "missing", label: "Missing" },
  { value: "gone", label: "Gone" },
];

const PROVENANCE_OPTIONS = [
  { value: "crawl", label: "Crawl" },
  { value: "gsc", label: "Google Search Console" },
  { value: "sitemap", label: "Sitemap" },
  { value: "manual", label: "Manual" },
];

export function PagesTable() {
  const router = useRouter();
  const { site, sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "last_seen", direction: "desc" },
  });
  const pages = usePages(site.id, table.queryState);
  const columns: MatrxColumnDef<PageListRow>[] = [
    {
      id: "path",
      accessorKey: "path",
      header: "Canonical page",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-64 max-w-xl">
          <p className="truncate font-mono text-xs font-medium text-foreground">
            {row.path || "/"}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {row.url}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "State",
      filter: "select",
      filterOptions: STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      id: "provenance",
      accessorKey: "provenance",
      header: "Source",
      filter: "select",
      filterOptions: PROVENANCE_OPTIONS,
      cell: (row) => (
        <span className="text-xs uppercase text-muted-foreground">
          {row.provenance}
        </span>
      ),
    },
    {
      id: "http_status_last",
      accessorKey: "http_status_last",
      header: "HTTP",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.http_status_last ?? "—"}
        </span>
      ),
    },
    {
      id: "target_keyword",
      accessorKey: "target_keyword",
      header: "Target keyword",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-52 truncate text-xs">
          {row.target_keyword || "—"}
        </span>
      ),
    },
    {
      id: "latest_score",
      accessorKey: "latest_score",
      header: "Score",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <span className="font-semibold tabular-nums">
          {displayScore(row.latest_score)}
          {row.fail_count ? (
            <span className="ml-1 text-[10px] font-normal text-destructive">
              ({row.fail_count})
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "last_seen",
      accessorKey: "last_seen",
      header: "Last seen",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.last_seen)}
        </span>
      ),
    },
  ];

  if (pages.isError) {
    return (
      <QueryError error={pages.error} onRetry={() => void pages.refetch()} />
    );
  }

  return (
    <main className="h-full overflow-hidden bg-textured p-3 sm:p-4">
      <MatrxDataTable<PageListRow>
        data={pages.data?.rows ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={pages.isLoading}
        isFetching={pages.isFetching}
        query={{
          mode: "controlled",
          state: table.state,
          totalItems: pages.data?.total ?? 0,
          onStateChange: table.onStateChange,
        }}
        toolbar={{
          searchPlaceholder: "Search URL, path, or target keyword…",
          actions: (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => void pages.refetch()}
              disabled={pages.isFetching}
            >
              <RefreshCw
                className={
                  pages.isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
                }
              />
              Refresh
            </Button>
          ),
        }}
        detail={{ enabled: false }}
        onRowOpen={(row) =>
          router.push(`${sitePath}/pages/${row.id}`)
        }
        emptyState={{
          icon: <FileQuestion className="h-8 w-8 text-muted-foreground" />,
          title: "No canonical pages",
          description:
            "A crawl, sitemap, GSC sync, or manual entry can add URLs to this independent registry.",
        }}
      />
    </main>
  );
}
