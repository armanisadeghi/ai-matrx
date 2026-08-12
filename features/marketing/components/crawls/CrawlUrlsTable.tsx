"use client";

import { Link2Off } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import { CrawlSurfaceProvider } from "@/features/marketing/lib/scopes/crawl-surface";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useCrawl, useCrawlUrls } from "@/features/marketing/data/hooks";
import type { CrawlUrl } from "@/features/marketing/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

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
  const { site, sitePath } = useMarketingSite();
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
      // A run URL is the crawl's own ledger entry, not a canonical page — but
      // when the crawler DID resolve it to one (`page_id`), that relationship
      // is knowable and must be reachable. Rows that resolved to nothing
      // (excluded, external, invalid) stay plain text rather than link nowhere.
      href: (row) =>
        row.page_id ? `${sitePath}/pages/${row.page_id}` : undefined,
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
      <AccessGate
        token="web_crawl_session"
        id={crawlId}
        error={crawl.error}
        onRetry={() => void crawl.refetch()}
        fallbackHref={`${sitePath}/crawls`}
        fallbackLabel="All crawls"
      />
    );
  return (
    <CrawlSurfaceProvider
      crawlId={crawlId}
      crawl={crawl.data ?? null}
      view="urls"
      getViewSummary={() =>
        urls.data
          ? { loaded_rows: urls.data.rows.length, total_rows: urls.data.total }
          : undefined
      }
    >
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
            copy={{
              label: "Run URL",
              listLabel: "All run URLs",
              location: webLocation(`Crawl URL ledger — session ${crawlId}`),
              rowKind: "web-crawl-url",
              listKind: "web-crawl-urls-list",
              rowDescription:
                "One URL this crawl session encountered, with its classification and outcome.",
              listDescription:
                "The currently loaded run-URL rows for this crawl session (respecting search, filters, sort, and pagination).",
              humanRow: (row) =>
                humanLines([
                  ["Seq", row.sequence],
                  ["URL", row.raw_url],
                  ["Outcome", row.outcome],
                  ["Class", row.classification],
                  ["Discovered by", row.discovery_source],
                  ["Depth", row.depth],
                  ["HTTP", row.http_status],
                  ["Reason", row.reason],
                  ["Completed", formatCompactDate(row.completed_at)],
                ]),
              rowAttributes: (row) => ({
                crawl_url_id: row.id,
                session_id: crawlId,
                site_id: site.id,
                outcome: row.outcome,
              }),
              listAttributes: () => ({
                session_id: crawlId,
                site_id: site.id,
                total_matching: urls.data?.total ?? 0,
              }),
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
    </CrawlSurfaceProvider>
  );
}
