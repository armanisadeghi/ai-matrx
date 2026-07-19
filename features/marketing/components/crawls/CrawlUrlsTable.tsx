"use client";

import { Link2Off } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useCrawl, useCrawlUrls } from "@/features/marketing/data/hooks";
import type { CrawlUrl } from "@/features/marketing/types";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";

const OUTCOME_OPTIONS = [
  { value: "discovered", label: "Discovered" },
  { value: "captured", label: "Captured" },
  { value: "redirected", label: "Redirected" },
  { value: "skipped", label: "Skipped" },
  { value: "excluded", label: "Excluded" },
  { value: "failed", label: "Failed" },
  { value: "duplicate", label: "Duplicate" },
  { value: "cancelled", label: "Cancelled" },
];

const CLASSIFICATION_OPTIONS = [
  { value: "internal", label: "Internal" },
  { value: "external", label: "External" },
  { value: "asset", label: "Asset" },
  { value: "invalid", label: "Invalid" },
  { value: "excluded", label: "Excluded" },
];

const DISCOVERY_SOURCE_OPTIONS = [
  { value: "seed", label: "Seed" },
  { value: "link", label: "Link" },
  { value: "sitemap", label: "Sitemap" },
  { value: "gsc", label: "Google Search Console" },
  { value: "manual", label: "Manual" },
  { value: "redirect", label: "Redirect" },
  { value: "canonical", label: "Canonical" },
  { value: "other", label: "Other" },
];

export function CrawlUrlsTable({ crawlId }: { crawlId: string }) {
  const { site } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "sequence", direction: "asc" },
    defaultPageSize: 50,
  });
  const crawl = useCrawl(site.id, crawlId);
  const urls = useCrawlUrls(site.id, crawlId, table.queryState);
  const columns: MatrxColumnDef<CrawlUrl>[] = [
    {
      id: "sequence",
      accessorKey: "sequence",
      header: "Seq",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-[11px] tabular-nums">
          {row.sequence}
        </span>
      ),
    },
    {
      id: "raw_url",
      accessorKey: "raw_url",
      header: "Run URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-80 max-w-3xl">
          <p className="truncate font-mono text-xs text-foreground">
            {row.raw_url}
          </p>
          {row.reason ? (
            <p className="truncate text-[10px] text-muted-foreground">
              {row.reason}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "outcome",
      accessorKey: "outcome",
      header: "Outcome",
      filter: "select",
      filterOptions: OUTCOME_OPTIONS,
      cell: (row) => <StatusBadge value={row.outcome} />,
    },
    {
      id: "classification",
      accessorKey: "classification",
      header: "Class",
      filter: "select",
      filterOptions: CLASSIFICATION_OPTIONS,
      cell: (row) => (
        <span className="text-xs capitalize">
          {row.classification.replaceAll("_", " ")}
        </span>
      ),
    },
    {
      id: "discovery_source",
      accessorKey: "discovery_source",
      header: "Discovered by",
      filter: "select",
      filterOptions: DISCOVERY_SOURCE_OPTIONS,
      cell: (row) => (
        <span className="text-xs capitalize">
          {row.discovery_source.replaceAll("_", " ")}
        </span>
      ),
    },
    {
      id: "depth",
      accessorKey: "depth",
      header: "Depth",
      filter: "number",
      align: "right",
    },
    {
      id: "http_status",
      accessorKey: "http_status",
      header: "HTTP",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs">{row.http_status ?? "—"}</span>
      ),
    },
    {
      id: "completed_at",
      accessorKey: "completed_at",
      header: "Completed",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.completed_at)}
        </span>
      ),
    },
  ];

  if (crawl.isLoading) return <LoadingSurface label="Loading crawl…" />;
  if (crawl.isError || !crawl.data)
    return (
      <QueryError
        error={crawl.error ?? new Error("Crawl not found")}
        onRetry={() => void crawl.refetch()}
      />
    );
  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <CrawlSubnav crawl={crawl.data} />
      <div className="min-h-0 flex-1">
        {urls.isError ? (
          <QueryError error={urls.error} onRetry={() => void urls.refetch()} />
        ) : (
          <MatrxDataTable<CrawlUrl>
            data={urls.data?.rows ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={urls.isLoading}
            isFetching={urls.isFetching}
            query={{
              mode: "controlled",
              state: table.state,
              totalItems: urls.data?.total ?? 0,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              searchPlaceholder:
                "Search encountered, normalized, final URL, or reason…",
            }}
            detail={{
              title: (row) => row.raw_url,
              description: (row) => `${row.classification} · ${row.outcome}`,
            }}
            emptyState={{
              icon: <Link2Off className="h-8 w-8 text-muted-foreground" />,
              title: "No run URLs persisted",
              description:
                "This ledger is the crawl's encountered URL set; it is deliberately separate from canonical pages.",
            }}
          />
        )}
      </div>
    </main>
  );
}
