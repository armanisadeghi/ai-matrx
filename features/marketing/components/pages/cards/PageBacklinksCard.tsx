"use client";

/**
 * PageBacklinksCard — external backlinks resolved to this canonical page
 * (`seo.backlink` stable rows stamped with page_id, plus the latest
 * page-level `seo.backlink_snapshot` summary when one exists). Bounded read,
 * client-side rollup by referring domain with rank/spam and anchor samples.
 */

import { useState } from "react";
import Link from "next/link";
import { BrainCircuit, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DataRowWindow from "@/components/official/matrx-data-table/DataRowWindow.dynamic";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  CondensedFieldGrid,
  QueryError,
  SectionCard,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  BACKLINK_ROW_CAP,
  rollupReferringDomains,
  usePageBacklinks,
} from "@/features/marketing/data/page-links";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage } from "@/features/marketing/types";
import { BacklinkEnrichmentDetail } from "@/features/marketing/components/backlinks/BacklinkEnrichmentDetail";
import {
  backlinkAnalysisActionState,
  humanizeAssessmentValue,
  parseBacklinkAssessment,
} from "@/features/marketing/components/backlinks/lib/enrichment";
import { useBacklinkAnalysis } from "@/features/marketing/components/backlinks/useBacklinkAnalysis";

function ratioLabel(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}% (${part}/${whole})`;
}

function minDate(values: Array<string | null>): string | null {
  let min: string | null = null;
  for (const value of values) {
    if (value && (min === null || value < min)) min = value;
  }
  return min;
}

function maxDate(values: Array<string | null>): string | null {
  let max: string | null = null;
  for (const value of values) {
    if (value && (max === null || value > max)) max = value;
  }
  return max;
}

export function PageBacklinksCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const backlinks = usePageBacklinks(site.id, page.id);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const {
    analysisDisabled,
    analysisRuns,
    analyzeBacklink,
    dismissAnalysisRun,
    refreshBacklinkReads,
  } = useBacklinkAnalysis({
    siteId: site.id,
    organizationId: site.organization_id,
    onRefresh: () => backlinks.refetch(),
  });

  const snapshot = backlinks.data?.snapshot ?? null;
  const observations = backlinks.data?.observations ?? [];
  const selectedRow = selectedRowId
    ? (observations.find((row) => row.id === selectedRowId) ?? null)
    : null;
  const domains = rollupReferringDomains(observations);
  const liveCount = observations.filter((row) => row.state !== "lost").length;
  const dofollowKnown = observations.filter(
    (row) => row.is_dofollow !== null,
  ).length;
  const dofollowCount = observations.filter(
    (row) => row.is_dofollow === true,
  ).length;
  const firstSeen = minDate(observations.map((row) => row.first_seen_at));
  const lastSeen = maxDate(observations.map((row) => row.last_seen_at));
  const pageBacklinksHref = `${sitePath}/backlinks?tab=links&q=${encodeURIComponent(page.url)}`;
  const visibleObservations = showAllRecords
    ? observations
    : observations.slice(0, 10);

  const copy = webCopy({
    kind: "web-page-backlinks",
    label: "Backlinks",
    description:
      "External backlinks resolved to this canonical page: latest page-level provider summary plus deduped observations rolled up by referring domain (rank, spam score, anchors, dofollow).",
    surface: `Backlinks — ${page.url}`,
    data: {
      snapshot,
      observations,
      referringDomains: domains,
      rowCap: BACKLINK_ROW_CAP,
      truncated: backlinks.data?.truncated ?? false,
    },
    lines: [
      ["URL", page.url],
      ["Backlinks observed", observations.length],
      ["Live", liveCount],
      ["Referring domains", domains.length],
      ["Dofollow", ratioLabel(dofollowCount, dofollowKnown)],
      ["First seen", firstSeen ? formatDate(firstSeen) : null],
      ["Last seen", lastSeen ? formatDate(lastSeen) : null],
      [
        "Source pages analyzed",
        observations.filter((row) => row.enrichment_status === "completed")
          .length,
      ],
      ["Provider total (latest snapshot)", snapshot?.total_backlinks ?? null],
    ],
    attributes: {
      page_id: page.id,
      observation_count: observations.length,
      referring_domain_count: domains.length,
    },
  });

  let body: React.ReactNode;
  if (backlinks.isLoading) {
    body = (
      <div className="m-3 h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  } else if (backlinks.isError) {
    body = (
      <QueryError
        error={backlinks.error}
        onRetry={() => void backlinks.refetch()}
      />
    );
  } else if (observations.length === 0 && !snapshot) {
    body = (
      <p className="p-4 text-xs text-muted-foreground">
        No backlink observations are resolved to this page yet — collection may
        not have run, or providers report no links here. Run or review
        collection in the{" "}
        <Link
          href={pageBacklinksHref}
          className="font-medium text-primary hover:underline"
        >
          site Backlinks workspace
        </Link>
        .
      </p>
    );
  } else {
    body = (
      <div className="grid gap-3 p-3">
        <CondensedFieldGrid
          fields={[
            {
              label: "Backlinks observed",
              value:
                observations.length +
                (backlinks.data?.truncated
                  ? ` (first ${BACKLINK_ROW_CAP})`
                  : ""),
            },
            { label: "Live", value: liveCount, tone: "good" },
            { label: "Referring domains", value: domains.length },
            {
              label: "Dofollow",
              value: ratioLabel(dofollowCount, dofollowKnown),
            },
            { label: "First seen", value: formatDate(firstSeen) },
            { label: "Last seen", value: formatDate(lastSeen) },
            {
              label: "Source pages analyzed",
              value: `${observations.filter((row) => row.enrichment_status === "completed").length}/${observations.length}`,
            },
            ...(snapshot
              ? [
                  {
                    label: "Provider total",
                    value: `${snapshot.total_backlinks ?? "—"} (as of ${formatDate(snapshot.observed_at)})`,
                  },
                  {
                    label: "Provider referring domains",
                    value: snapshot.referring_domains ?? "—",
                  },
                ]
              : []),
          ]}
        />
        {observations.length > 0 ? (
          <div className="rounded-md border border-border/60">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Backlink records
              </p>
              <Link
                href={pageBacklinksHref}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                View all in Backlinks
              </Link>
            </div>
            <ul className="divide-y divide-border/60">
              {visibleObservations.map((row) => {
                const assessment = parseBacklinkAssessment(
                  row.resolved_assessment,
                );
                const running = analysisRuns[row.id]?.status === "running";
                const action = backlinkAnalysisActionState(
                  row.enrichment_status,
                  running,
                  analysisDisabled,
                );
                return (
                  <li key={row.id} className="p-2">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRowId(row.id)}
                        className="min-w-0 flex-1 rounded p-1 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">
                            {row.source_domain ?? "Referring page"}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {humanizeAssessmentValue(row.enrichment_status)}
                          </Badge>
                          {row.domain_rank !== null ? (
                            <Badge variant="outline" className="text-[10px]">
                              rank {row.domain_rank}
                            </Badge>
                          ) : null}
                          {row.spam_score !== null && row.spam_score >= 30 ? (
                            <Badge
                              variant="destructive"
                              className="text-[10px]"
                            >
                              spam {row.spam_score}
                            </Badge>
                          ) : row.spam_score !== null ? (
                            <Badge variant="secondary" className="text-[10px]">
                              spam {row.spam_score}
                            </Badge>
                          ) : null}
                          {row.is_dofollow ? (
                            <Badge variant="success" className="text-[10px]">
                              dofollow
                            </Badge>
                          ) : null}
                          {assessment.overallScore !== null ? (
                            <Badge variant="outline" className="text-[10px]">
                              our score {assessment.overallScore}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-1 block break-all font-mono text-[11px] leading-4 text-primary">
                          {row.source_url}
                        </span>
                        {row.anchor_text ? (
                          <span className="mt-0.5 block break-words text-[11px] text-muted-foreground">
                            Anchor: “{row.anchor_text}”
                          </span>
                        ) : null}
                        {assessment.action ? (
                          <span className="mt-0.5 block text-[11px] text-primary">
                            {humanizeAssessmentValue(assessment.action)}
                            {assessment.relevanceVerdict
                              ? ` · ${humanizeAssessmentValue(assessment.relevanceVerdict)} relevance`
                              : ""}
                          </span>
                        ) : null}
                      </button>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-[11px]"
                          disabled={action.disabled}
                          title={action.title}
                          onClick={() => {
                            setSelectedRowId(row.id);
                            void analyzeBacklink(row);
                          }}
                        >
                          {running ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <BrainCircuit className="h-3 w-3" />
                          )}
                          {action.label}
                        </Button>
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 text-[10px] text-primary hover:underline"
                        >
                          Source <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
              {observations.length > 10 || backlinks.data?.truncated ? (
                <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                  <span>
                    Showing {visibleObservations.length} of{" "}
                    {observations.length}
                    {backlinks.data?.truncated ? "+" : ""} backlink records.
                  </span>
                  {observations.length > 10 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setShowAllRecords((current) => !current)}
                    >
                      {showAllRecords
                        ? "Show first 10"
                        : `Show all ${observations.length} here`}
                    </Button>
                  ) : null}
                  {backlinks.data?.truncated ? (
                    <Link
                      href={pageBacklinksHref}
                      className="font-medium text-primary hover:underline"
                    >
                      Open the complete filtered table
                    </Link>
                  ) : null}
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            A page-level provider summary exists, but no individual link
            observations are resolved to this page yet — collect link details in
            the{" "}
            <Link
              href={pageBacklinksHref}
              className="font-medium text-primary hover:underline"
            >
              site Backlinks workspace
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <SectionCard
      title="Backlinks"
      copy={copy}
      collapsible
      anchor="page_backlinks"
      action={{ label: "View all", href: pageBacklinksHref }}
    >
      {body}
      {selectedRow ? (
        <DataRowWindow
          isOpen
          windowId={`page-backlink-${selectedRow.id}`}
          title={`Backlink from ${selectedRow.source_domain ?? "external page"}`}
          width={820}
          height={720}
          onClose={() => setSelectedRowId(null)}
          viewContent={
            <BacklinkEnrichmentDetail
              row={selectedRow}
              sitePath={sitePath}
              onSaved={() => void refreshBacklinkReads()}
              onAnalyze={() => void analyzeBacklink(selectedRow)}
              running={analysisRuns[selectedRow.id]?.status === "running"}
              analysisDisabled={analysisDisabled}
              analysisRun={analysisRuns[selectedRow.id]}
              onDismissAnalysisRun={() => dismissAnalysisRun(selectedRow.id)}
            />
          }
        />
      ) : null}
    </SectionCard>
  );
}
