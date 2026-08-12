"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCheck,
  ExternalLink,
  FileSearch,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  FindingStatusBadge,
  RESULT_STATUS_OPTIONS,
  ResultStatusBadge,
  SEVERITY_OPTIONS,
  SeverityBadge,
} from "@/features/marketing/components/analysis/AnalysisBadges";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingFindingsScope } from "@/features/surfaces/manifests/marketing-findings.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { tableViewState } from "@/features/marketing/lib/scopes/table-view-values";
import {
  formatCompactDate,
  formatDate,
  JsonPreview,
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  analysisKeys,
  useFindingResults,
} from "@/features/marketing/data/analysis-hooks";
import { resultReasoning } from "@/features/marketing/data/analysis-service";
import {
  acknowledgeFinding,
  suppressFinding,
  unsuppressFinding,
} from "@/features/marketing/data/finding-mutations";
import type { MarketingAnalysisResult } from "@/features/marketing/data/analysis-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { FindingRemedyCard } from "@/features/marketing/components/analysis/FindingRemedyCard";
import { FindingWriteTargets } from "@/features/marketing/components/analysis/FindingWriteTargets";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  humanLines,
  webCopy,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { humanizeItemKey } from "@/features/marketing/lib/finding-remedies";

/** Immutable result evidence → the shape the surface declares. */
function projectResult(
  result: MarketingAnalysisResult,
): Record<string, unknown> {
  return {
    id: result.id,
    computed_at: result.computed_at,
    status: result.status,
    severity: result.severity,
    score: result.score,
    issue_count: result.issue_count,
    confidence: result.confidence,
    provider_id: result.provider_id,
    provider_version: result.provider_version,
    run_id: result.run_id,
  };
}

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
  const reasoning = resultReasoning(result.metadata);
  return (
    <div className="grid gap-3 p-3 text-xs">
      {/* The verdict in words, before the machine fields. Present on every
          result the analyzer writes — including checks this UI predates. */}
      {reasoning ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground">
          {reasoning}
        </p>
      ) : null}
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
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
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
    // "Finding not found" was a guess: a zero-row read here is equally a
    // denial, a deletion, or a stale link. The gate asks the platform.
    return (
      <AccessGate
        token="web_finding"
        id={findingId}
        error={detail.error}
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
  const itemLabel = data.item?.label || humanizeItemKey(finding.item_key);
  // The analyzer writes a plain-language sentence on EVERY result — that is
  // the floor this screen always has, including for a check whose catalogue
  // row (label/description) does not exist yet.
  const reasoning = latest ? resultReasoning(latest.metadata) : null;
  const remedyContext = {
    itemKey: finding.item_key,
    itemLabel: data.item?.label ?? null,
    itemDescription: data.item?.description ?? null,
    category: finding.category,
    subcategory: finding.subcategory,
    severity: finding.severity,
    reasoning,
    pageUrl: data.page?.url ?? null,
    pagePath: data.page?.path ?? null,
    siteDomain: site.domain,
  };

  const afterFindingWrite = async () => {
    await queryClient.invalidateQueries({
      queryKey: analysisKeys.site(site.id),
    });
  };
  const findingCopy = webCopy({
    kind: "web-finding",
    label: itemLabel,
    description:
      "One durable finding: lifecycle state, catalog item context, affected page, and the latest result evidence.",
    surface: `Finding detail — ${finding.item_key}`,
    data,
    lines: [
      ["Finding", finding.id],
      ["Item", finding.item_key],
      ["Label", itemLabel],
      ["What the analyzer found", reasoning],
      ["Category", `${finding.category} / ${finding.subcategory}`],
      ["Lifecycle", finding.status],
      ["Severity", finding.severity],
      ["Subject", `${finding.subject_type} ${finding.subject_id}`],
      ["Page", data.page?.url],
      ["First detected", formatDate(finding.first_detected_at)],
      ["Last detected", formatDate(finding.last_detected_at)],
      ["Resolved", formatDate(finding.resolved_at)],
      ["Suppressed", finding.suppressed ? "yes" : "no"],
      ["Suppression reason", finding.suppressed_reason],
      ["Latest result", latest?.status ?? null],
      ["Latest score", latest?.score ?? null],
      ["Confidence", confidenceLabel(latest?.confidence ?? null)],
    ],
    attributes: {
      finding_id: finding.id,
      site_id: site.id,
      item_key: finding.item_key,
      status: finding.status,
      severity: finding.severity,
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-findings"
      getScope={() => {
        const liveResults = results.data?.rows ?? [];
        return createMarketingFindingsScope({
          ...getBaseValues(),
          finding_id: finding.id,
          finding_summary: {
            status: finding.status,
            severity: finding.severity,
            category: finding.category,
            subcategory: finding.subcategory,
            item_key: finding.item_key,
            reasoning,
            subject_type: finding.subject_type,
            subject_id: finding.subject_id,
            page_url: data.page?.url ?? null,
            page_path: data.page?.path ?? null,
            suppressed: finding.suppressed,
            suppressed_reason: finding.suppressed_reason,
            resolved_at: finding.resolved_at,
            first_detected_at: finding.first_detected_at,
            last_detected_at: finding.last_detected_at,
            first_result_id: finding.first_result_id,
            last_result_id: finding.last_result_id,
          },
          finding_item: data.item
            ? {
                key: data.item.key,
                label: data.item.label,
                description: data.item.description,
                category: data.item.category,
                subcategory: data.item.subcategory,
                weight: data.item.weight,
              }
            : undefined,
          finding_page: data.page
            ? { id: data.page.id, path: data.page.path, url: data.page.url }
            : undefined,
          latest_result: data.lastResult
            ? projectResult(data.lastResult)
            : undefined,
          first_result: data.firstResult
            ? projectResult(data.firstResult)
            : undefined,
          result_history:
            liveResults.length > 0
              ? liveResults.map(projectResult)
              : undefined,
          result_total: results.data?.total,
          result_view_state: tableViewState(table.state),
        });
      }}
    >
    {/* The write half of this surface — handlers only, no markup. Mounted on
        the DETAIL route only, so the list view offers agents no write tool. */}
    <FindingWriteTargets
      siteId={site.id}
      finding={finding}
      onWritten={afterFindingWrite}
    />
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <section className="shrink-0 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={() => navigate(`${sitePath}/findings`)}
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
          <div className="flex shrink-0 items-center gap-1.5">
            <CopyButtons size="icon" {...findingCopy} json={() => data} />
            {finding.status === "open" || finding.status === "reopened" ? (
              // "I've seen it and I'm on it" — the finding stays open (only a
              // passing re-analysis resolves one), but the register stops
              // reading as untouched.
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5"
                onClick={() => {
                  void acknowledgeFinding(site.id, finding.id)
                    .then(afterFindingWrite)
                    .then(() => toast.success("Marked as acknowledged"))
                    .catch((error: unknown) =>
                      toast.error("Could not acknowledge this finding", {
                        description: extractErrorMessage(error),
                      }),
                    );
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                I&rsquo;m on it
              </Button>
            ) : null}
            {data.page ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() =>
                    navigate(`${sitePath}/pages/${data.page?.id}`)
                  }
                >
                  Page workspace
                </Button>
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
              </>
            ) : null}
          </div>
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

      {/* The fix, above the evidence. A person who is not an SEO reads this
          card and knows what to do; the result history below is the proof. */}
      <FindingRemedyCard
        context={remedyContext}
        surfaceName="matrx-user/marketing-findings"
        pageWorkspaceHref={
          data.page ? `${sitePath}/pages/${data.page.id}` : null
        }
        suppressed={finding.suppressed}
        onSuppress={async (reason) => {
          await suppressFinding(site.id, finding.id, reason);
          await afterFindingWrite();
        }}
        onUnsuppress={async () => {
          await unsuppressFinding(site.id, finding.id);
          await afterFindingWrite();
        }}
        className="shrink-0 overflow-hidden rounded-lg border border-border bg-card"
      />

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
            copy={{
              label: "Analysis result",
              listLabel: "All result evidence",
              location: webLocation(
                `Finding detail — ${finding.item_key} — result history`,
              ),
              rowKind: "web-analysis-result",
              listKind: "web-analysis-results-list",
              rowDescription:
                "One immutable normalized analysis result for this finding's subject and item.",
              listDescription:
                "The currently loaded immutable result evidence rows for this finding (respecting search, filters, sort, and pagination).",
              humanRow: (row) =>
                humanLines([
                  ["Result", row.id],
                  ["Computed", formatCompactDate(row.computed_at)],
                  ["Status", row.status],
                  ["Severity", row.severity],
                  ["Score", row.score],
                  ["Issues", row.issue_count],
                  ["Confidence", confidenceLabel(row.confidence)],
                  ["Provider version", row.provider_version],
                  ["Run", row.run_id],
                ]),
              rowAttributes: (row) => ({
                result_id: row.id,
                finding_id: finding.id,
                site_id: site.id,
                status: row.status,
              }),
              listAttributes: () => ({
                finding_id: finding.id,
                site_id: site.id,
                total_matching: results.data?.total ?? 0,
              }),
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
    </SurfaceRuntimeProvider>
  );
}
