"use client";

/**
 * AnalysisResultInspector — THE full record view of one `web.analysis_result`.
 *
 * It replaces a partial inspector that showed six of the row's twenty-eight
 * columns (D150 P0): the verdict itself — status, severity, score, issue
 * count, confidence — was missing, as were the row's own identity, its
 * subject, its lifecycle stamps, and every door. A user opened "the evidence"
 * and could not see what the evidence SAID.
 *
 * Every stored column now renders, and every id that resolves to a record is a
 * door (THE DOOR LAW): the subject through `AnalysisSubjectRef`, the page and
 * site through `EntityRef`, the run through `AnalysisRunRef` (which asks
 * whether that unconstrained id is a crawl session before offering a door),
 * and the actors through `RecordStamps`.
 *
 * ONE component, rendered by the results table's row detail AND its window —
 * a shape has exactly one renderer.
 */

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { RecordStamps } from "@/components/official/record-stamps/RecordStamps";
import { useRecordActors } from "@/components/official/record-stamps/useRecordActors";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  ResultStatusBadge,
  SeverityBadge,
} from "@/features/marketing/components/analysis/AnalysisBadges";
import {
  AnalysisProviderRef,
  AnalysisRunRef,
  AnalysisSubjectRef,
  UnresolvedRef,
} from "@/features/marketing/components/shared/MarketingRefs";
import {
  CondensedFieldGrid,
  formatCompactDate,
  formatDate,
  JsonPreview,
  MetricCell,
} from "@/features/marketing/components/shared/MarketingUi";
import { resultReasoning } from "@/features/marketing/data/analysis-service";
import type { MarketingAnalysisResult } from "@/features/marketing/data/analysis-types";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { humanizeItemKey } from "@/features/marketing/lib/finding-remedies";

export function confidenceLabel(value: number | null): string {
  return value === null ? "—" : `${Math.round(Number(value) * 100)}%`;
}

export function AnalysisResultInspector({
  result,
  sitePath,
  /** The subject's page reference when the caller already resolved it. */
  pageUrl,
  /** The site's display name — without it the site door reads as a bare id. */
  siteName,
}: {
  result: MarketingAnalysisResult;
  sitePath: string;
  pageUrl?: string | null;
  siteName?: string | null;
}) {
  const reasoning = resultReasoning(result.metadata);
  const resolveActor = useRecordActors(result.organization_id, [
    result.created_by,
    result.updated_by,
  ]);
  const copy = webCopy({
    kind: "web-analysis-result",
    label: `${humanizeItemKey(result.item_key)} · ${result.status}`,
    description:
      "One immutable normalized analysis result — the complete stored row.",
    surface: `Analysis result inspector — ${result.item_key}`,
    data: result,
    lines: [
      ["Result", result.id],
      ["Item", result.item_key],
      ["Category", `${result.category} / ${result.subcategory}`],
      ["What the analyzer found", reasoning],
      ["Status", result.status],
      ["Severity", result.severity],
      ["Score", result.score],
      ["Issues", result.issue_count],
      ["Confidence", confidenceLabel(result.confidence)],
      ["Subject", `${result.subject_type} ${result.subject_id}`],
      ["Page", pageUrl ?? result.page_id],
      ["Computed", formatDate(result.computed_at)],
      ["Provider", `${result.provider_id} ${result.provider_version ?? ""}`],
      ["Run", result.run_id],
    ],
    attributes: {
      result_id: result.id,
      site_id: result.site_id,
      item_key: result.item_key,
      status: result.status,
    },
  });

  return (
    <div className="grid gap-3 p-3 text-xs">
      {/* The verdict FIRST — in words, then as numbers. */}
      {reasoning ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground">
          {reasoning}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <ResultStatusBadge value={result.status} />
        <SeverityBadge value={result.severity} />
        <span className="text-[11px] text-muted-foreground">
          {result.category} / {result.subcategory}
        </span>
        <span className="ml-auto">
          <CopyButtons size="xs" {...copy} json={() => result} />
        </span>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border sm:grid-cols-4">
        <MetricCell label="Score" value={result.score ?? "—"} />
        <MetricCell
          label="Issues"
          value={result.issue_count.toLocaleString()}
          tone={result.issue_count > 0 ? "warning" : "good"}
        />
        <MetricCell
          label="Confidence"
          value={confidenceLabel(result.confidence)}
        />
        {/* Compact: `MetricCell` truncates, and the long form ellipsized. */}
        <MetricCell
          label="Computed"
          value={formatCompactDate(result.computed_at)}
          detail={formatDate(result.computed_at)}
        />
      </div>

      <div className="rounded-md border border-border p-3">
        <CondensedFieldGrid
          fields={[
            {
              label: "Result id",
              value: (
                <span className="break-all font-mono text-[11px]">
                  {result.id}
                </span>
              ),
              span: 2,
            },
            {
              label: "Analysis item",
              value: (
                <span className="break-all font-mono text-[11px]">
                  {result.item_key}
                </span>
              ),
            },
            {
              label: "Subject",
              value: (
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="shrink-0 capitalize text-muted-foreground">
                    {result.subject_type}
                  </span>
                  <AnalysisSubjectRef
                    subjectType={result.subject_type}
                    subjectId={result.subject_id}
                    name={
                      result.subject_type === "page" ? (pageUrl ?? null) : null
                    }
                  />
                </span>
              ),
            },
            {
              label: "Page",
              value: result.page_id ? (
                <EntityRef
                  token="web_page"
                  id={result.page_id}
                  name={pageUrl ?? undefined}
                  href={`${sitePath}/pages/${result.page_id}`}
                  wrap
                />
              ) : (
                <span className="text-muted-foreground">
                  Not scoped to one page
                </span>
              ),
              span: 2,
            },
            {
              label: "Site",
              value: (
                <EntityRef
                  token="web_site"
                  id={result.site_id}
                  name={siteName ?? undefined}
                  wrap
                />
              ),
            },
            {
              label: "Analyzer",
              value: (
                <AnalysisProviderRef
                  providerId={result.provider_id}
                  version={result.provider_version}
                />
              ),
            },
            {
              label: "Analysis run",
              value: result.run_id ? (
                <AnalysisRunRef
                  siteId={result.site_id}
                  sitePath={sitePath}
                  runId={result.run_id}
                />
              ) : (
                <span className="text-muted-foreground">
                  Independent analysis (no run)
                </span>
              ),
              span: 2,
            },
            {
              label: "Batch",
              value: result.batch_id ? (
                <UnresolvedRef
                  id={result.batch_id}
                  reason="external batch subsystem"
                />
              ) : (
                <span className="text-muted-foreground">Not batched</span>
              ),
              span: 2,
            },
            {
              label: "Rich payload instance",
              value: result.payload_instance_id ? (
                <UnresolvedRef
                  id={result.payload_instance_id}
                  reason="structured payload store"
                />
              ) : (
                <span className="text-muted-foreground">No payload instance</span>
              ),
              span: 2,
            },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Result metadata
        </p>
        <JsonPreview value={result.metadata} />
      </div>

      <RecordStamps
        organizationId={result.organization_id}
        createdAt={result.created_at}
        createdBy={result.created_by}
        updatedAt={result.updated_at}
        updatedBy={result.updated_by}
        deletedAt={result.deleted_at}
        version={result.version}
        formatTimestamp={formatDate}
        resolveActor={resolveActor}
        className="rounded-md border border-border p-3"
      />
    </div>
  );
}
