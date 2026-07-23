"use client";

import Link from "next/link";
import { BarChart3, ExternalLink, Search } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";

import type { SiteKeywordPerformanceRow } from "../types";
import { useSiteKeywordPerformance } from "../useSiteKeywordPerformance";

function integer(value: number | null): string {
  return value === null ? "—" : Intl.NumberFormat().format(Math.round(value));
}

function decimal(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

function money(value: number | null): string {
  return value === null
    ? "—"
    : Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);
}

export function SiteKeywordPerformanceWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "clicks", direction: "desc" },
    defaultPageSize: 50,
  });
  const performance = useSiteKeywordPerformance(site.id, table.queryState);

  const columns: MatrxColumnDef<SiteKeywordPerformanceRow>[] = [
    {
      id: "query",
      accessorKey: "query",
      header: "Search query",
      filter: "text",
      cell: (row) => (
        <div className="min-w-48">
          <p className="font-medium text-foreground">{row.query ?? "—"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {row.first_date && row.last_date
              ? `${row.first_date} → ${row.last_date}`
              : "No GSC window"}
          </p>
        </div>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{integer(row.clicks)}</span>
      ),
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{integer(row.impressions)}</span>
      ),
    },
    {
      id: "ctr",
      accessorKey: "ctr",
      header: "CTR",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{decimal((row.ctr ?? 0) * 100)}%</span>
      ),
    },
    {
      id: "average_position",
      accessorKey: "average_position",
      header: "Position",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{decimal(row.average_position)}</span>
      ),
    },
    {
      id: "search_volume",
      accessorKey: "search_volume",
      header: "Volume",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{integer(row.search_volume)}</span>
      ),
    },
    {
      id: "cpc",
      accessorKey: "cpc",
      header: "CPC",
      filter: "number",
      align: "right",
      cell: (row) => <span className="tabular-nums">{money(row.cpc)}</span>,
    },
    {
      id: "competition",
      accessorKey: "competition",
      header: "Competition",
      filter: "select",
      filterOptions: [
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" },
      ],
      cell: (row) =>
        row.competition ? (
          <Badge variant="secondary">{row.competition.toLowerCase()}</Badge>
        ) : (
          "—"
        ),
    },
    {
      id: "top_page_path",
      accessorKey: "top_page_path",
      header: "Strongest page",
      filter: "text",
      cell: (row) =>
        row.top_page_id ? (
          <Link
            href={`${sitePath}/pages/${row.top_page_id}`}
            className="inline-flex max-w-64 items-center gap-1 text-primary hover:underline"
          >
            <span className="truncate">
              {row.top_page_path ?? row.top_page_url ?? "Open page"}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </Link>
        ) : (
          <span className="text-muted-foreground">
            {row.top_page_path ?? "Unmatched"}
          </span>
        ),
    },
    {
      id: "workflow_status",
      accessorKey: "workflow_status",
      header: "Workflow",
      filter: "select",
      filterOptions: [
        { value: "discovered", label: "Discovered" },
        { value: "candidate", label: "Candidate" },
        { value: "approved", label: "Approved" },
        { value: "targeted", label: "Targeted" },
        { value: "paused", label: "Paused" },
      ],
      cell: (row) =>
        row.workflow_status ? (
          <Badge variant="outline">
            {row.workflow_status.replaceAll("_", " ")}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Not classified</span>
        ),
    },
  ];

  if (performance.isError) {
    return (
      <QueryError
        error={performance.error}
        onRetry={() => void performance.refetch()}
      />
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-textured p-3 sm:p-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Organic keyword performance
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Persisted 28-day GSC query evidence for {site.domain}, enriched with
            stored DataForSEO market data when available.
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Matching queries
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {Intl.NumberFormat().format(performance.data?.total ?? 0)}
          </p>
        </div>
      </section>

      <section className="min-h-[36rem] rounded-lg border border-border bg-card p-2">
        <MatrxDataTable<SiteKeywordPerformanceRow>
          data={performance.data?.rows ?? []}
          columns={columns}
          getRowId={(row) =>
            `${row.provider ?? "gsc"}:${row.keyword_id ?? row.query ?? "unknown"}`
          }
          isLoading={performance.isLoading}
          isFetching={performance.isFetching}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: performance.data?.total ?? 0,
            onStateChange: table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: "Search query or ranking page…" }}
          emptyState={{
            icon: <Search className="h-8 w-8 text-muted-foreground" />,
            title: "No search queries stored yet",
            description:
              "Connect Google Search Console and run a search-performance sync to populate this site.",
          }}
          detail={{
            title: (row) => row.query ?? "Search query",
            description: (row) =>
              `${integer(row.clicks)} clicks · ${integer(row.impressions)} impressions`,
          }}
        />
      </section>
    </main>
  );
}
