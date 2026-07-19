"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileSearch,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FindingStatusBadge,
  RESULT_STATUS_OPTIONS,
  ResultStatusBadge,
  SEVERITY_OPTIONS,
  SeverityBadge,
} from "@/features/marketing/components/analysis/AnalysisBadges";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  formatCompactDate,
  formatDate,
  JsonPreview,
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useFindingResults } from "@/features/marketing/data/analysis-hooks";
import type { MarketingAnalysisResult } from "@/features/marketing/data/analysis-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";

function compactId(value: string | null) {
  return value ? value.slice(0, 12) : "—";
}

function confidenceLabel(value: number | null) {
  return value === null ? "—" : `${Math.round(Number(value) * 100)}%`;
}

function LifecycleDatum({
  label,
  value,
  title,
}: {
  label: string;
  value: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2" title={title}>
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-xs text-foreground">{value}</dd>
    </div>
  );
}

function EvidenceInspector({ result }: { result: MarketingAnalysisResult }) {
  return (
    <div className="grid gap-3 p-3 text-xs">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-[10px] uppercase text-muted-foreground">
            Computed
          </dt>
          <dd className="mt-0.5">{formatDate(result.computed_at)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-muted-foreground">
            Provider
          </dt>
          <dd className="mt-0.5 break-all font-mono text-[11px]">
            {result.provider_id}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-muted-foreground">Run</dt>
          <dd className="mt-0.5 break-all font-mono text-[11px]">
            {result.run_id || "Independent analysis"}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-muted-foreground">Batch</dt>
          <dd className="mt-0.5 break-all font-mono text-[11px]">
            {result.batch_id || "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] uppercase text-muted-foreground">
            Rich payload reference
          </dt>
          <dd className="mt-0.5 break-all font-mono text-[11px]">
            {result.payload_instance_id || "No payload instance"}
          </dd>
        </div>
      </dl>
      <div className="overflow-hidden rounded-md border border-border">
        <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Result metadata
        </p>
        <JsonPreview value={result.metadata} />
      </div>
    </div>
  );
}

export function FindingDetail({ findingId }: { findingId: string }) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const { site } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "computed_at", direction: "desc" },
  });
  const { detail, results } = useFindingResults(
    site.id,
    findingId,
    table.queryState,
  );

  if (detail.isLoading) {
    return <LoadingSurface label="Loading finding…" />;
  }
  if (detail.isError || !detail.data) {
    return (
      <QueryError
        error={detail.error ?? new Error("Finding not found")}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const data = detail.data;
  const finding = data.finding;
  const latest = data.lastResult;
  const columns: MatrxColumnDef<MarketingAnalysisResult>[] = [
    {
      id: "computed_at",
      accessorKey: "computed_at",
      header: "Computed",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.computed_at)}
        </span>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Result",
      filter: "select",
      filterOptions: RESULT_STATUS_OPTIONS,
      cell: (row) => <ResultStatusBadge value={row.status} />,
    },
    {
      id: "severity",
      accessorKey: "severity",
      header: "Severity",
      filter: "select",
      filterOptions: SEVERITY_OPTIONS,
      sortable: false,
      cell: (row) => <SeverityBadge value={row.severity} />,
    },
    {
      id: "score",
      accessorKey: "score",
      header: "Score",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold tabular-nums">
          {row.score ?? "—"}
        </span>
      ),
    },
    {
      id: "issue_count",
      accessorKey: "issue_count",
      header: "Issues",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {row.issue_count.toLocaleString()}
        </span>
      ),
    },
    {
      id: "confidence",
      accessorKey: "confidence",
      header: "Confidence (0–1)",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums">
          {confidenceLabel(row.confidence)}
        </span>
      ),
    },
    {
      id: "provider_version",
      accessorKey: "provider_version",
      header: "Provider version",
      filter: "text",
      cell: (row) => (
        <span className="block max-w-48 truncate font-mono text-[11px]">
          {row.provider_version || "—"}
        </span>
      ),
    },
    {
      id: "run_id",
      accessorKey: "run_id",
      header: "Run",
      filter: false,
      sortable: false,
      cellKind: "uuid",
    },
    {
      id: "payload_instance_id",
      accessorKey: "payload_instance_id",
      header: "Payload",
      filter: false,
      sortable: false,
      cellKind: "uuid",
    },
  ];

  const navigate = (href: string) => {
    if (isNavigating) return;
    startNavigation(() => router.push(href));
  };
  const itemLabel = data.item?.label || finding.item_key;

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <section className="shrink-0 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={() => navigate(`/marketing/sites/${site.id}/findings`)}
                disabled={isNavigating}
              >
                {isNavigating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowLeft className="h-3.5 w-3.5" />
                )}
                Findings
              </Button>
              <FindingStatusBadge value={finding.status} />
              <SeverityBadge value={finding.severity} />
              {finding.suppressed ? (
                <Badge variant="warning">Suppressed</Badge>
              ) : null}
            </div>
            <h1 className="mt-2 truncate text-sm font-semibold text-foreground">
              {itemLabel}
            </h1>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {finding.item_key} · {finding.category} / {finding.subcategory}
            </p>
            {data.item?.description ? (
              <p className="mt-1 line-clamp-2 max-w-4xl text-xs text-muted-foreground">
                {data.item.description}
              </p>
            ) : null}
          </div>
          {data.page ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
            >
              <a href={data.page.url} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {data.page.path || "/"}
              </a>
            </Button>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 border-t border-border divide-x divide-y divide-border sm:grid-cols-4 xl:grid-cols-8">
          <LifecycleDatum
            label="Subject"
            value={finding.subject_type}
            title={finding.subject_id}
          />
          <LifecycleDatum
            label="First detected"
            value={formatCompactDate(finding.first_detected_at)}
            title={formatDate(finding.first_detected_at)}
          />
          <LifecycleDatum
            label="Last detected"
            value={formatCompactDate(finding.last_detected_at)}
            title={formatDate(finding.last_detected_at)}
          />
          <LifecycleDatum
            label="Resolved"
            value={formatCompactDate(finding.resolved_at)}
            title={formatDate(finding.resolved_at)}
          />
          <LifecycleDatum
            label="Evidence events"
            value={(results.data?.total ?? 0).toLocaleString()}
          />
          <LifecycleDatum label="Latest result" value={latest?.status ?? "—"} />
          <LifecycleDatum label="Latest score" value={latest?.score ?? "—"} />
          <LifecycleDatum
            label="Confidence"
            value={confidenceLabel(latest?.confidence ?? null)}
          />
        </dl>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
          <span title={finding.first_result_id ?? undefined}>
            First result: {compactId(finding.first_result_id)}
          </span>
          <span title={finding.last_result_id ?? undefined}>
            Latest result: {compactId(finding.last_result_id)}
          </span>
          <span>Item weight: {data.item?.weight ?? "—"}</span>
          {finding.suppressed_reason ? (
            <span className="min-w-0 flex-1 truncate text-warning">
              Suppression: {finding.suppressed_reason}
            </span>
          ) : null}
        </div>
      </section>

      <div className="min-h-0 flex-1">
        {results.isError ? (
          <QueryError
            error={results.error}
            onRetry={() => void results.refetch()}
          />
        ) : (
          <MatrxDataTable<MarketingAnalysisResult>
            data={results.data?.rows ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={results.isLoading}
            isFetching={results.isFetching}
            query={{
              mode: "controlled",
              state: table.state,
              totalItems: results.data?.total ?? 0,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              searchPlaceholder: "Search provider version or result status…",
              leading: (
                <span className="hidden text-xs text-muted-foreground lg:inline">
                  Immutable evidence for this subject and analysis item
                </span>
              ),
              actions: (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => void results.refetch()}
                  disabled={results.isFetching}
                >
                  <RefreshCw
                    className={
                      results.isFetching
                        ? "h-3.5 w-3.5 animate-spin"
                        : "h-3.5 w-3.5"
                    }
                  />
                  Refresh
                </Button>
              ),
            }}
            detail={{
              title: (row) => `${row.item_key} · ${row.status}`,
              description: (row) => formatDate(row.computed_at),
              render: (row) => <EvidenceInspector result={row} />,
            }}
            window={{
              title: (row) => `${row.item_key} · ${row.status}`,
              renderView: (row) => <EvidenceInspector result={row} />,
              renderEdit: false,
            }}
            emptyState={{
              icon: <FileSearch className="h-8 w-8 text-muted-foreground" />,
              title: "No result evidence",
              description:
                "This finding can retain lifecycle state even when its referenced result history is unavailable to the current view.",
            }}
          />
        )}
      </div>
    </main>
  );
}
