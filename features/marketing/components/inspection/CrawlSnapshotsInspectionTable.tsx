"use client";

import Link from "next/link";
import { FileSearch } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import { CrawlSurfaceProvider } from "@/features/marketing/lib/scopes/crawl-surface";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useCrawlSnapshots } from "@/features/marketing/data/inspection-hooks";
import type { InspectionSnapshotRow } from "@/features/marketing/data/inspection-types";
import { useCrawl } from "@/features/marketing/data/hooks";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

function pageUrl(row: InspectionSnapshotRow): string {
  return row.page?.url ?? row.final_url ?? row.page_id;
}

export function CrawlSnapshotsInspectionTable({
  crawlId,
}: {
  crawlId: string;
}) {
  const { site, sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "captured_at", direction: "desc" },
    defaultPageSize: 50,
  });
  const crawl = useCrawl(site.id, crawlId);
  const openFilePreview = useOpenFilePreviewWindow();
  const snapshots = useCrawlSnapshots(site.id, crawlId, table.queryState);
  const columns: MatrxColumnDef<InspectionSnapshotRow>[] = [
    {
      id: "page",
      header: "Canonical page",
      filter: false,
      sortable: false,
      cellKind: "text",
      cell: (row) => (
        <Link
          href={`${sitePath}/pages/${row.page_id}`}
          className="block min-w-72 max-w-2xl truncate font-mono text-xs text-primary"
          title={pageUrl(row)}
        >
          {pageUrl(row)}
        </Link>
      ),
    },
    {
      id: "captured_at",
      accessorKey: "captured_at",
      header: "Captured",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.captured_at)}
        </span>
      ),
    },
    {
      id: "final_url",
      accessorKey: "final_url",
      header: "Final URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block min-w-64 max-w-xl truncate font-mono text-xs">
          {row.final_url || "—"}
        </span>
      ),
    },
    {
      id: "http_status",
      accessorKey: "http_status",
      header: "HTTP",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.http_status ?? "—"}
        </span>
      ),
    },
    {
      id: "word_count",
      accessorKey: "word_count",
      header: "Words",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {row.word_count?.toLocaleString() ?? "—"}
        </span>
      ),
    },
    {
      id: "content_hash",
      accessorKey: "content_hash",
      header: "Content hash",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-44 truncate font-mono text-[11px] text-muted-foreground">
          {row.content_hash || "—"}
        </span>
      ),
    },
    {
      id: "body_file_id",
      accessorKey: "body_file_id",
      header: "Body file",
      filter: false,
      sortable: false,
      cellKind: "text",
      cell: (row) =>
        row.body_file_id ? (
          <button
            type="button"
            onClick={() =>
              openFilePreview({ fileId: row.body_file_id })
            }
            className="block max-w-48 truncate text-left font-mono text-[11px] text-primary hover:underline"
            title="Open captured HTML in the file viewer"
          >
            {row.body_file_id}
          </button>
        ) : (
          "—"
        ),
    },
    {
      id: "id",
      accessorKey: "id",
      header: "Snapshot",
      filter: false,
      sortable: false,
      cellKind: "uuid",
      fk: {
        href: (id, row) =>
          `${sitePath}/pages/${row.page_id}/snapshots/${id}`,
      },
    },
  ];

  if (crawl.isLoading) return <LoadingSurface label="Loading crawl…" />;
  if (crawl.isError || !crawl.data) {
    return (
      <QueryError
        error={crawl.error ?? new Error("Crawl not found")}
        onRetry={() => void crawl.refetch()}
      />
    );
  }

  return (
    <CrawlSurfaceProvider crawlId={crawlId} crawl={crawl.data ?? null}>
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <CrawlSubnav crawl={crawl.data} />
      <section className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">
            Crawl snapshots
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Immutable page content captures produced during this crawl session.
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {(snapshots.data?.total ?? 0).toLocaleString()} captures
        </span>
      </section>
      <div className="min-h-0 flex-1">
        {snapshots.isError ? (
          <QueryError
            error={snapshots.error}
            onRetry={() => void snapshots.refetch()}
          />
        ) : (
          <MatrxDataTable<InspectionSnapshotRow>
            data={snapshots.data?.rows ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={snapshots.isLoading}
            isFetching={snapshots.isFetching}
            query={{
              mode: "controlled",
              state: table.state,
              totalItems: snapshots.data?.total ?? 0,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              searchPlaceholder: "Search final URL, hash, or body reference…",
            }}
            copy={{
              label: "Snapshot",
              listLabel: "All crawl snapshots",
              location: webLocation(`Crawl snapshots — session ${crawlId}`),
              rowKind: "web-snapshot",
              listKind: "web-crawl-snapshots-list",
              rowDescription:
                "One immutable page content capture from this crawl session.",
              listDescription:
                "The currently loaded snapshot rows for this crawl session (respecting search, filters, sort, and pagination).",
              humanRow: (row) =>
                humanLines([
                  ["Page", pageUrl(row)],
                  ["Snapshot", row.id],
                  ["Captured", formatCompactDate(row.captured_at)],
                  ["Final URL", row.final_url],
                  ["HTTP", row.http_status],
                  ["Words", row.word_count],
                  ["Content hash", row.content_hash],
                ]),
              rowAttributes: (row) => ({
                snapshot_id: row.id,
                page_id: row.page_id,
                session_id: crawlId,
                site_id: site.id,
              }),
              listAttributes: () => ({
                session_id: crawlId,
                site_id: site.id,
                total_matching: snapshots.data?.total ?? 0,
              }),
            }}
            detail={{
              title: pageUrl,
              description: (row) =>
                `${row.http_status ?? "No HTTP status"} · ${formatCompactDate(row.captured_at)}`,
            }}
            emptyState={{
              icon: <FileSearch className="h-8 w-8 text-muted-foreground" />,
              title: "No snapshots persisted",
              description:
                "Snapshots appear here as the crawler persists page captures for this session.",
            }}
          />
        )}
      </div>
    </main>
    </CrawlSurfaceProvider>
  );
}
