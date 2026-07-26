"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, FileSearch } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import { CrawlSurfaceProvider } from "@/features/marketing/lib/scopes/crawl-surface";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useCrawlSnapshots } from "@/features/marketing/data/inspection-hooks";
import { useCrawl, useCrawlUrls } from "@/features/marketing/data/hooks";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import type { CrawlUrl } from "@/features/marketing/types";
import { formatFileSize } from "@/features/files/utils/format";
import {
  CRAWL_REPORTS,
  getCrawlReport,
  type CrawlReportKey,
} from "@/features/marketing/lib/crawl-reports";
import {
  toCrawlSnapshotReportRow,
  type CrawlSnapshotReportRow,
} from "@/features/marketing/lib/crawl-report-row";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";

const OUTCOME_OPTIONS = [
  "discovered",
  "captured",
  "redirected",
  "skipped",
  "excluded",
  "failed",
  "duplicate",
  "cancelled",
].map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

function urlCell(url: string, pageHref?: string) {
  return (
    <div className="flex min-w-72 max-w-3xl items-center gap-1.5">
      {pageHref ? (
        <Link
          href={pageHref}
          className="min-w-0 flex-1 truncate font-mono text-xs text-primary"
          title={url}
        >
          {url}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={url}>
          {url}
        </span>
      )}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-muted-foreground hover:text-primary"
        aria-label={`Open ${url}`}
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function baseSnapshotColumns(
  sitePath: string,
): MatrxColumnDef<CrawlSnapshotReportRow>[] {
  return [
    {
      id: "url",
      accessorKey: "url",
      header: "URL",
      sortable: false,
      filter: false,
      cellKind: "text",
      cell: (row) => urlCell(row.url, `${sitePath}/pages/${row.pageId}`),
    },
    {
      id: "http_status",
      accessorKey: "httpStatus",
      header: "HTTP",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.httpStatus ?? "—"}
        </span>
      ),
    },
  ];
}

function snapshotReportColumns(
  reportKey: CrawlReportKey,
  sitePath: string,
): MatrxColumnDef<CrawlSnapshotReportRow>[] {
  const base = baseSnapshotColumns(sitePath);
  const derived = (
    columns: MatrxColumnDef<CrawlSnapshotReportRow>[],
  ): MatrxColumnDef<CrawlSnapshotReportRow>[] => [
    ...base,
    ...columns,
    {
      id: "captured_at",
      accessorKey: "capturedAt",
      header: "Captured",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.capturedAt)}
        </span>
      ),
    },
  ];

  switch (reportKey) {
    case "page-titles":
      return derived([
        {
          id: "title",
          accessorKey: "title",
          header: "Title",
          sortable: false,
          filter: false,
          cellKind: "text",
          cell: (row) => (
            <span className="block min-w-64 max-w-2xl truncate text-xs">
              {row.title || <span className="text-destructive">Missing</span>}
            </span>
          ),
        },
        {
          id: "titleChars",
          accessorKey: "titleChars",
          header: "Chars",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "titlePixels",
          accessorKey: "titlePixels",
          header: "Pixels",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "titleOk",
          accessorKey: "titleOk",
          header: "Validation",
          sortable: false,
          filter: false,
          cell: (row) => (
            <StatusBadge
              value={
                row.titleOk === null
                  ? "unknown"
                  : row.titleOk
                    ? "pass"
                    : "review"
              }
            />
          ),
        },
      ]);
    case "meta-descriptions":
      return derived([
        {
          id: "metaDescription",
          accessorKey: "metaDescription",
          header: "Meta description",
          sortable: false,
          filter: false,
          cellKind: "text",
          cell: (row) => (
            <span className="block min-w-80 max-w-3xl truncate text-xs">
              {row.metaDescription || (
                <span className="text-destructive">Missing</span>
              )}
            </span>
          ),
        },
        {
          id: "descriptionChars",
          accessorKey: "descriptionChars",
          header: "Chars",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "descriptionPixels",
          accessorKey: "descriptionPixels",
          header: "Pixels",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "descriptionOk",
          accessorKey: "descriptionOk",
          header: "Validation",
          sortable: false,
          filter: false,
          cell: (row) => (
            <StatusBadge
              value={
                row.descriptionOk === null
                  ? "unknown"
                  : row.descriptionOk
                    ? "pass"
                    : "review"
              }
            />
          ),
        },
      ]);
    case "headings":
      return derived([
        {
          id: "h1",
          accessorKey: "h1",
          header: "Primary H1",
          sortable: false,
          filter: false,
          cellKind: "text",
          cell: (row) => (
            <span className="block min-w-64 max-w-2xl truncate text-xs">
              {row.h1 || <span className="text-destructive">Missing</span>}
            </span>
          ),
        },
        {
          id: "h1Count",
          accessorKey: "h1Count",
          header: "H1s",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "h2Count",
          accessorKey: "h2Count",
          header: "H2s",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "outline",
          accessorKey: "outline",
          header: "Outline",
          sortable: false,
          filter: false,
          cellKind: "text",
          cell: (row) => (
            <span className="block max-w-2xl truncate text-[11px] text-muted-foreground">
              {row.outline || "—"}
            </span>
          ),
        },
      ]);
    case "canonicals":
      return derived([
        {
          id: "canonicalState",
          accessorKey: "canonicalState",
          header: "State",
          sortable: false,
          filter: false,
          cell: (row) => <StatusBadge value={row.canonicalState} />,
        },
        {
          id: "canonicalUrl",
          accessorKey: "canonicalUrl",
          header: "Canonical target",
          sortable: false,
          filter: false,
          cellKind: "text",
          cell: (row) => (
            <span className="block min-w-72 max-w-3xl truncate font-mono text-xs">
              {row.canonicalUrl || (
                <span className="text-destructive">Missing</span>
              )}
            </span>
          ),
        },
      ]);
    case "directives":
      return derived([
        {
          id: "indexability",
          accessorKey: "indexability",
          header: "Indexability",
          sortable: false,
          filter: false,
          cell: (row) => <StatusBadge value={row.indexability} />,
        },
        {
          id: "metaRobots",
          accessorKey: "metaRobots",
          header: "Meta robots",
          sortable: false,
          filter: false,
          cellKind: "text",
          cell: (row) => (
            <span className="block max-w-xl truncate font-mono text-xs">
              {row.metaRobots || "—"}
            </span>
          ),
        },
        {
          id: "lang",
          accessorKey: "lang",
          header: "Language",
          sortable: false,
          filter: false,
        },
        {
          id: "hreflangCount",
          accessorKey: "hreflangCount",
          header: "Hreflang",
          sortable: false,
          filter: false,
          align: "right",
        },
      ]);
    case "images":
      return derived([
        {
          id: "imageCount",
          accessorKey: "imageCount",
          header: "Images",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "missingAlt",
          accessorKey: "missingAlt",
          header: "Missing alt",
          sortable: false,
          filter: false,
          align: "right",
          cell: (row) => (
            <span
              className={
                row.missingAlt ? "text-destructive" : "text-emerald-600"
              }
            >
              {row.missingAlt ?? "—"}
            </span>
          ),
        },
        {
          id: "altCoverage",
          header: "Alt coverage",
          sortable: false,
          filter: false,
          align: "right",
          cell: (row) => {
            if (row.imageCount === null || row.missingAlt === null) return "—";
            if (row.imageCount === 0) return "No images";
            return `${Math.round(((row.imageCount - row.missingAlt) / row.imageCount) * 100)}%`;
          },
        },
      ]);
    case "content":
      return derived([
        {
          id: "word_count",
          accessorKey: "wordCount",
          header: "Words",
          filter: "number",
          align: "right",
        },
        {
          id: "sentenceCount",
          accessorKey: "sentenceCount",
          header: "Sentences",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "fleschReadingEase",
          accessorKey: "fleschReadingEase",
          header: "Reading ease",
          sortable: false,
          filter: false,
          align: "right",
          cell: (row) => row.fleschReadingEase?.toFixed(1) ?? "—",
        },
        {
          id: "content_hash",
          accessorKey: "contentHash",
          header: "Content hash",
          filter: "text",
          cellKind: "text",
          cell: (row) => (
            <span className="block max-w-40 truncate font-mono text-[11px] text-muted-foreground">
              {row.contentHash || "—"}
            </span>
          ),
        },
        {
          id: "internalLinks",
          accessorKey: "internalLinks",
          header: "Internal links",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "externalLinks",
          accessorKey: "externalLinks",
          header: "External links",
          sortable: false,
          filter: false,
          align: "right",
        },
        {
          id: "mixedContentCount",
          accessorKey: "mixedContentCount",
          header: "Mixed content",
          sortable: false,
          filter: false,
          align: "right",
        },
      ]);
    case "structured-data":
      return derived([
        {
          id: "schemaTypes",
          header: "Schema types",
          sortable: false,
          filter: false,
          cellKind: "text",
          cell: (row) => (
            <span className="block min-w-64 max-w-3xl truncate font-mono text-xs">
              {row.schemaTypes.join(", ") || (
                <span className="text-muted-foreground">None detected</span>
              )}
            </span>
          ),
        },
        {
          id: "schemaCount",
          header: "Types",
          sortable: false,
          filter: false,
          align: "right",
          cell: (row) => row.schemaTypes.length,
        },
        {
          id: "hasSchemaPayload",
          accessorKey: "hasSchemaPayload",
          header: "Payload",
          sortable: false,
          filter: false,
          cell: (row) => (
            <StatusBadge value={row.hasSchemaPayload ? "captured" : "none"} />
          ),
        },
      ]);
    case "performance":
      return derived([
        {
          id: "responseTimeMs",
          accessorKey: "responseTimeMs",
          header: "Response time",
          sortable: false,
          filter: false,
          align: "right",
          cell: (row) =>
            row.responseTimeMs === null
              ? "—"
              : `${row.responseTimeMs.toLocaleString()} ms`,
        },
        {
          id: "bytes",
          accessorKey: "bytes",
          header: "Transferred",
          sortable: false,
          filter: false,
          align: "right",
          cell: (row) => formatFileSize(row.bytes),
        },
        {
          id: "word_count",
          accessorKey: "wordCount",
          header: "Words",
          filter: "number",
          align: "right",
        },
      ]);
    case "response-codes":
      return base;
  }
}

function responseColumns(): MatrxColumnDef<CrawlUrl>[] {
  return [
    {
      id: "sequence",
      accessorKey: "sequence",
      header: "Seq",
      filter: "number",
      align: "right",
    },
    {
      id: "raw_url",
      accessorKey: "raw_url",
      header: "Encountered URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => urlCell(row.raw_url),
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
      id: "outcome",
      accessorKey: "outcome",
      header: "Outcome",
      filter: "select",
      filterOptions: OUTCOME_OPTIONS,
      cell: (row) => <StatusBadge value={row.outcome} />,
    },
    {
      id: "final_url",
      accessorKey: "final_url",
      header: "Final URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block min-w-64 max-w-2xl truncate font-mono text-xs">
          {row.final_url || "—"}
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
      id: "classification",
      accessorKey: "classification",
      header: "Class",
      filter: false,
      cell: (row) => <StatusBadge value={row.classification} />,
    },
    {
      id: "is_in_scope",
      accessorKey: "is_in_scope",
      header: "In scope",
      filter: "boolean",
      cell: (row) => (
        <StatusBadge value={row.is_in_scope ? "in-scope" : "out-of-scope"} />
      ),
    },
    {
      id: "reason_code",
      accessorKey: "reason_code",
      header: "Reason code",
      filter: "text",
      cellKind: "text",
    },
    {
      id: "reason",
      accessorKey: "reason",
      header: "Reason",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-2xl truncate text-xs">
          {row.reason || "—"}
        </span>
      ),
    },
  ];
}

function snapshotHumanLines(
  reportKey: CrawlReportKey,
  row: CrawlSnapshotReportRow,
): Array<[string, string | number | null]> {
  const common: Array<[string, string | number | null]> = [
    ["URL", row.url],
    ["HTTP", row.httpStatus],
  ];
  switch (reportKey) {
    case "page-titles":
      return [
        ...common,
        ["Title", row.title],
        ["Characters", row.titleChars],
        ["Pixels", row.titlePixels],
      ];
    case "meta-descriptions":
      return [
        ...common,
        ["Description", row.metaDescription],
        ["Characters", row.descriptionChars],
        ["Pixels", row.descriptionPixels],
      ];
    case "headings":
      return [
        ...common,
        ["Primary H1", row.h1],
        ["H1 count", row.h1Count],
        ["H2 count", row.h2Count],
        ["Outline", row.outline],
      ];
    case "canonicals":
      return [
        ...common,
        ["State", row.canonicalState],
        ["Canonical", row.canonicalUrl],
      ];
    case "directives":
      return [
        ...common,
        ["Indexability", row.indexability],
        ["Robots", row.metaRobots],
        ["Language", row.lang],
        ["Hreflang", row.hreflangCount],
      ];
    case "images":
      return [
        ...common,
        ["Images", row.imageCount],
        ["Missing alt", row.missingAlt],
      ];
    case "content":
      return [
        ...common,
        ["Words", row.wordCount],
        ["Sentences", row.sentenceCount],
        ["Reading ease", row.fleschReadingEase],
        ["Content hash", row.contentHash],
      ];
    case "structured-data":
      return [
        ...common,
        ["Schema types", row.schemaTypes.join(", ")],
        ["Payload", row.hasSchemaPayload ? "captured" : "none"],
      ];
    case "performance":
      return [
        ...common,
        ["Response time ms", row.responseTimeMs],
        ["Bytes", row.bytes],
      ];
    case "response-codes":
      return common;
  }
}

export function CrawlReportWorkspace({
  crawlId,
  reportKey,
}: {
  crawlId: string;
  reportKey: CrawlReportKey;
}) {
  const { site, sitePath } = useMarketingSite();
  const router = useRouter();
  const report = getCrawlReport(reportKey);
  const table = useMarketingTableState({
    defaultSort:
      report.source === "crawl-url"
        ? { id: "sequence", direction: "asc" }
        : reportKey === "content"
          ? { id: "content_hash", direction: "asc" }
          : { id: "captured_at", direction: "desc" },
    defaultPageSize: 50,
  });
  const crawl = useCrawl(site.id, crawlId);
  const urls = useCrawlUrls(
    site.id,
    crawlId,
    table.queryState,
    report.source === "crawl-url",
  );
  const snapshots = useCrawlSnapshots(
    site.id,
    crawlId,
    table.queryState,
    report.source === "snapshot",
  );
  const reportRoot = marketingRoutes.crawlReports(
    site.brand_id,
    site.id,
    crawlId,
  );

  if (crawl.isLoading)
    return <LoadingSurface label={`Loading ${report.label.toLowerCase()}…`} />;
  if (crawl.isError || !crawl.data) {
    return (
      <QueryError
        error={crawl.error ?? new Error("Crawl not found")}
        onRetry={() => void crawl.refetch()}
      />
    );
  }

  const isResponseReport = report.source === "crawl-url";
  const query = isResponseReport ? urls : snapshots;
  const snapshotRows = (snapshots.data?.rows ?? []).map(
    toCrawlSnapshotReportRow,
  );

  return (
    <CrawlSurfaceProvider
      crawlId={crawlId}
      crawl={crawl.data}
      reportKey={reportKey}
      getReportSummary={() => {
        if (!query.data) return undefined;
        return {
          report_key: report.key,
          report_label: report.label,
          report_source: report.source,
          loaded_rows: query.data.rows.length,
          total_rows: query.data.total,
        };
      }}
    >
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <CrawlSubnav crawl={crawl.data} />
      <section className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={reportRoot}
              aria-label="Back to all crawl reports"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-sm font-semibold text-foreground">
              {report.label}
            </h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {(query.data?.total ?? 0).toLocaleString()} rows
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {report.description}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          Report
          <select
            value={reportKey}
            onChange={(event) =>
              router.push(
                marketingRoutes.crawlReport(
                  site.brand_id,
                  site.id,
                  crawlId,
                  event.target.value,
                ),
              )
            }
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            {CRAWL_REPORTS.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <div className="min-h-0 flex-1">
        {query.isError ? (
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : isResponseReport ? (
          <MatrxDataTable<CrawlUrl>
            data={urls.data?.rows ?? []}
            columns={responseColumns()}
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
                "Search encountered, final URL, or failure reason…",
            }}
            copy={{
              label: "Response record",
              listLabel: "Response code report",
              location: webLocation(`Response codes — session ${crawlId}`),
              rowKind: "web-crawl-response",
              listKind: "web-crawl-response-report",
              rowDescription:
                "One URL outcome from the crawl response-code report.",
              listDescription:
                "The currently loaded response-code rows, respecting query state.",
              humanRow: (row) =>
                humanLines([
                  ["URL", row.raw_url],
                  ["HTTP", row.http_status],
                  ["Outcome", row.outcome],
                  ["Final URL", row.final_url],
                  ["Depth", row.depth],
                  ["Reason", row.reason],
                ]),
              rowAttributes: (row) => ({
                crawl_url_id: row.id,
                session_id: crawlId,
                site_id: site.id,
              }),
              listAttributes: () => ({
                session_id: crawlId,
                site_id: site.id,
                report: reportKey,
                total_matching: urls.data?.total ?? 0,
              }),
            }}
            detail={{
              title: (row) => row.raw_url,
              description: (row) =>
                `${row.http_status ?? "No response"} · ${row.outcome}`,
            }}
            emptyState={{
              icon: <FileSearch className="h-8 w-8 text-muted-foreground" />,
              title: "No response records",
              description:
                "The crawl did not persist encountered URL outcomes.",
            }}
          />
        ) : (
          <MatrxDataTable<CrawlSnapshotReportRow>
            data={snapshotRows}
            columns={snapshotReportColumns(reportKey, sitePath)}
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
              searchPlaceholder: `Search URLs in ${report.label.toLowerCase()}…`,
            }}
            copy={{
              label: report.shortLabel,
              listLabel: `${report.label} report`,
              location: webLocation(`${report.label} — session ${crawlId}`),
              rowKind: `web-crawl-report-${report.key}`,
              listKind: `web-crawl-report-${report.key}-list`,
              rowDescription: `One page in the crawl's ${report.label.toLowerCase()} report.`,
              listDescription: `The currently loaded ${report.label.toLowerCase()} rows, respecting query state.`,
              humanRow: (row) => humanLines(snapshotHumanLines(reportKey, row)),
              rowAttributes: (row) => ({
                snapshot_id: row.id,
                page_id: row.pageId,
                session_id: crawlId,
                site_id: site.id,
                report: reportKey,
              }),
              listAttributes: () => ({
                session_id: crawlId,
                site_id: site.id,
                report: reportKey,
                total_matching: snapshots.data?.total ?? 0,
              }),
            }}
            detail={{
              title: (row) => row.url,
              description: (row) =>
                `${row.httpStatus ?? "No HTTP status"} · ${report.label}`,
            }}
            emptyState={{
              icon: <FileSearch className="h-8 w-8 text-muted-foreground" />,
              title: `No ${report.label.toLowerCase()} data`,
              description:
                "This report is populated from immutable page snapshots produced by the crawl.",
            }}
          />
        )}
      </div>
    </main>
    </CrawlSurfaceProvider>
  );
}
