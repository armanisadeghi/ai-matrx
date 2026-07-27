"use client";

/**
 * PageLinksCard — the current internal-link picture for one canonical page.
 *
 * Two interchangeable views share the same edge evidence:
 *   - URL view: one rollup row per source/target page;
 *   - Anchor-text view: a folding tree of anchor → pages → link counts.
 *
 * This page's accepted inbound anchors are authored in
 * `web.page.desired_values.accepted_anchor_texts`. Outbound edges resolve the
 * target page's same slice, so the source page immediately reports mismatches.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
} from "lucide-react";
import TextArrayInput from "@/components/official/TextArrayInput";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import {
  jsonExportItem,
  rowsToCsv,
} from "@/components/agent-copy/export";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { DesiredSection } from "@/features/marketing/components/pages/desired/DesiredSection";
import { useDesiredValueSlice } from "@/features/marketing/components/pages/desired/useDesiredValueSlice";
import {
  LINK_ROW_CAP,
  acceptedAnchorTextsFromDesiredValues,
  anchorComplianceByPartner,
  buildInboundAnchorTextReport,
  buildOutboundAnchorTextReport,
  rollupInboundLinks,
  rollupOutboundLinks,
  sanitizeAcceptedAnchorTexts,
  usePageInboundLinks,
  usePageOutboundLinks,
  type AnchorPartnerRollup,
  type AnchorTextReport,
  type LinkPartnerRollup,
} from "@/features/marketing/data/page-links";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage } from "@/features/marketing/types";

function ComplianceBadge({
  acceptable,
  unacceptable,
}: {
  acceptable: number;
  unacceptable: number;
}) {
  if (unacceptable > 0) {
    return (
      <Badge variant="destructive" className="shrink-0 text-[10px]">
        {unacceptable} {unacceptable === 1 ? "needs fix" : "need fixes"}
      </Badge>
    );
  }
  if (acceptable > 0) {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-400"
      >
        acceptable
      </Badge>
    );
  }
  return null;
}

function LinkPartnerList({
  groups,
  compliance,
  sitePath,
  emptyMessage,
}: {
  groups: LinkPartnerRollup[];
  compliance: Map<string, AnchorPartnerRollup>;
  sitePath: string;
  emptyMessage: string;
}) {
  if (groups.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">{emptyMessage}</p>
    );
  }
  return (
    <ul className="divide-y divide-border/60">
      {groups.slice(0, 25).map((group) => {
        const anchorStatus = compliance.get(group.url);
        const needsFix = (anchorStatus?.unacceptableLinks ?? 0) > 0;
        return (
          <li
            key={group.url}
            className={cn(
              "px-3 py-2",
              needsFix &&
                "bg-amber-500/10 ring-1 ring-inset ring-amber-500/25",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {group.isInternal && group.pageId ? (
                <Link
                  href={`${sitePath}/pages/${group.pageId}`}
                  className="min-w-0 flex-1 basis-52 truncate font-mono text-xs text-foreground hover:text-primary"
                >
                  {group.url}
                </Link>
              ) : (
                <span
                  className="min-w-0 flex-1 basis-52 truncate font-mono text-xs text-foreground"
                  title={group.url}
                >
                  {group.url}
                </span>
              )}
              {group.edgeCount > 1 ? (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  ×{group.edgeCount}
                </span>
              ) : null}
              <ComplianceBadge
                acceptable={anchorStatus?.acceptableLinks ?? 0}
                unacceptable={anchorStatus?.unacceptableLinks ?? 0}
              />
              {!group.isInternal ? (
                <Badge variant="outline" className="text-[10px]">
                  external
                </Badge>
              ) : null}
              {group.hasNofollow ? (
                <Badge variant="secondary" className="text-[10px]">
                  nofollow
                </Badge>
              ) : null}
              {group.isBroken ? (
                <Badge variant="destructive" className="text-[10px]">
                  broken
                  {group.worstHttpStatus ? ` ${group.worstHttpStatus}` : ""}
                </Badge>
              ) : null}
            </div>
            {group.anchors.length > 0 ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {group.anchors.map((anchor) => `“${anchor}”`).join(" · ")}
              </p>
            ) : null}
            {needsFix && anchorStatus?.acceptedAnchors.length ? (
              <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                Use:{" "}
                {anchorStatus.acceptedAnchors
                  .map((anchor) => `“${anchor}”`)
                  .join(" · ")}
              </p>
            ) : null}
          </li>
        );
      })}
      {groups.length > 25 ? (
        <li className="px-3 py-2 text-[11px] text-muted-foreground">
          +{groups.length - 25} more URLs in the copied and exported data.
        </li>
      ) : null}
    </ul>
  );
}

function AnchorTextTree({
  report,
  sitePath,
  emptyMessage,
}: {
  report: AnchorTextReport;
  sitePath: string;
  emptyMessage: string;
}) {
  if (report.groups.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">{emptyMessage}</p>
    );
  }
  return (
    <div className="divide-y divide-border/60">
      {report.groups.slice(0, 50).map((group) => (
        <details
          key={group.key}
          className={cn(
            "group",
            group.unacceptableLinks > 0 && "bg-amber-500/10",
          )}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs font-semibold",
                group.anchorText === null
                  ? "italic text-muted-foreground"
                  : "text-foreground",
              )}
              title={group.label}
            >
              {group.anchorText === null ? group.label : `“${group.label}”`}
            </span>
            <ComplianceBadge
              acceptable={group.acceptableLinks}
              unacceptable={group.unacceptableLinks}
            />
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {group.linkCount} {group.linkCount === 1 ? "link" : "links"}
            </span>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {group.pageCount} {group.pageCount === 1 ? "page" : "pages"}
            </span>
          </summary>
          <ul className="border-t border-border/50 bg-background/45">
            {group.pages.map((partner) => {
              const needsFix = partner.unacceptableLinks > 0;
              return (
                <li
                  key={partner.url}
                  className={cn(
                    "border-b border-border/40 px-3 py-2 pl-9 last:border-b-0",
                    needsFix && "border-l-2 border-l-amber-500",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {partner.pageId ? (
                      <Link
                        href={`${sitePath}/pages/${partner.pageId}`}
                        className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground hover:text-primary"
                      >
                        {partner.url}
                      </Link>
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground"
                        title={partner.url}
                      >
                        {partner.url}
                      </span>
                    )}
                    <ComplianceBadge
                      acceptable={partner.acceptableLinks}
                      unacceptable={partner.unacceptableLinks}
                    />
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      ×{partner.linkCount}
                    </span>
                  </div>
                  {needsFix && partner.acceptedAnchors.length ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      Acceptable:{" "}
                      {partner.acceptedAnchors
                        .map((anchor) => `“${anchor}”`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      {report.groups.length > 50 ? (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          +{report.groups.length - 50} more anchor groups in the copied and
          exported data.
        </p>
      ) : null}
    </div>
  );
}

export function PageLinksCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const [view, setView] = useState<"url" | "anchor">("url");
  const desired = useDesiredValueSlice(page, "accepted_anchor_texts");
  const savedAcceptedAnchors = acceptedAnchorTextsFromDesiredValues(
    page.desired_values,
  );
  const inbound = usePageInboundLinks(site.id, page.id, page.url);
  const outbound = usePageOutboundLinks(
    site.id,
    page.id,
    page.latest_snapshot_id,
  );

  const inboundRows = inbound.data ?? [];
  const outboundRows = outbound.data ?? [];
  const inboundGroups = rollupInboundLinks(inboundRows);
  const outboundGroups = rollupOutboundLinks(outboundRows);
  const inboundReport = buildInboundAnchorTextReport(
    inboundRows,
    savedAcceptedAnchors,
  );
  const outboundReport = buildOutboundAnchorTextReport(outboundRows);
  const inboundCompliance = anchorComplianceByPartner(inboundReport);
  const outboundCompliance = anchorComplianceByPartner(outboundReport);
  const brokenOutbound = outboundGroups.filter((group) => group.isBroken);

  const exportRows = [
    ...inboundReport.groups.flatMap((group) =>
      group.pages.map((partner) => ({
        direction: "inbound",
        anchor_text: group.anchorText ?? "",
        page_url: partner.url,
        link_count: partner.linkCount,
        acceptable_count: partner.acceptableLinks,
        unacceptable_count: partner.unacceptableLinks,
        tracking_status:
          partner.untrackedLinks === partner.linkCount
            ? "not configured"
            : partner.unacceptableLinks > 0
              ? "needs fix"
              : "acceptable",
        acceptable_options: partner.acceptedAnchors.join(" | "),
      })),
    ),
    ...outboundReport.groups.flatMap((group) =>
      group.pages.map((partner) => ({
        direction: "outbound",
        anchor_text: group.anchorText ?? "",
        page_url: partner.url,
        link_count: partner.linkCount,
        acceptable_count: partner.acceptableLinks,
        unacceptable_count: partner.unacceptableLinks,
        tracking_status:
          partner.untrackedLinks === partner.linkCount
            ? "not configured"
            : partner.unacceptableLinks > 0
              ? "needs fix"
              : "acceptable",
        acceptable_options: partner.acceptedAnchors.join(" | "),
      })),
    ),
  ];
  const issueRows = exportRows.filter((row) => row.unacceptable_count > 0);
  const condensedText = [
    `Internal link anchor report: ${page.url}`,
    `Accepted inbound anchors: ${
      savedAcceptedAnchors.length
        ? savedAcceptedAnchors.join(" | ")
        : "Not configured"
    }`,
    `Inbound: ${inboundReport.summary.acceptableLinks} acceptable, ${inboundReport.summary.unacceptableLinks} need fixes, ${inboundReport.summary.untrackedLinks} untracked`,
    `Outbound: ${outboundReport.summary.acceptableLinks} acceptable, ${outboundReport.summary.unacceptableLinks} need fixes, ${outboundReport.summary.untrackedLinks} untracked`,
    "",
    ...issueRows.map(
      (row) =>
        `[${row.direction}] “${row.anchor_text || "(no anchor text)"}” → ${row.page_url} (${row.unacceptable_count} link${row.unacceptable_count === 1 ? "" : "s"}; use: ${row.acceptable_options})`,
    ),
  ].join("\n");

  const copy = webCopy({
    kind: "web-page-links",
    label: "Internal links",
    description:
      "Current internal link edges for this canonical page, including URL and anchor-text rollups, accepted inbound anchors, compliance percentages, and source/target pages that need fixes.",
    surface: `Internal links — ${page.url}`,
    data: {
      acceptedInboundAnchors: savedAcceptedAnchors,
      inbound: {
        rows: inboundRows,
        groups: inboundGroups,
        anchorReport: inboundReport,
      },
      outbound: {
        rows: outboundRows,
        groups: outboundGroups,
        anchorReport: outboundReport,
      },
      rowCap: LINK_ROW_CAP,
    },
    lines: [
      ["URL", page.url],
      ["Accepted inbound anchors", savedAcceptedAnchors.join(" · ")],
      ["Inbound linking pages", inboundGroups.length],
      ["Inbound edges", inboundRows.length],
      [
        "Inbound acceptable",
        inboundReport.summary.acceptablePercent === null
          ? savedAcceptedAnchors.length > 0
            ? "No inbound links to evaluate"
            : "Not configured"
          : `${inboundReport.summary.acceptablePercent.toFixed(1)}%`,
      ],
      ["Inbound links needing fixes", inboundReport.summary.unacceptableLinks],
      ["Outbound target URLs", outboundGroups.length],
      ["Outbound edges", outboundRows.length],
      ["Outbound links needing fixes", outboundReport.summary.unacceptableLinks],
      ["Broken outbound targets", brokenOutbound.length],
    ],
    attributes: {
      page_id: page.id,
      inbound_edges: inboundRows.length,
      outbound_edges: outboundRows.length,
      inbound_unacceptable: inboundReport.summary.unacceptableLinks,
      outbound_unacceptable: outboundReport.summary.unacceptableLinks,
    },
  });

  const exportMenu = (
    <ExportMenu
      label={`internal-links-${page.path || page.id}`}
      items={[
        {
          id: "csv-condensed",
          label: "CSV (condensed by anchor + page)",
          build: () => ({
            content: rowsToCsv(exportRows),
            extension: "csv",
            mime: "text/csv",
          }),
        },
        {
          id: "csv-issues",
          label: "CSV (anchor issues only)",
          build: () => ({
            content: rowsToCsv(issueRows),
            extension: "csv",
            mime: "text/csv",
          }),
        },
        {
          id: "text-issues",
          label: "Text (simple issue list)",
          build: () => ({
            content: condensedText,
            extension: "txt",
            mime: "text/plain",
          }),
        },
        jsonExportItem(
          () => ({
            page: {
              id: page.id,
              url: page.url,
              accepted_anchor_texts: savedAcceptedAnchors,
            },
            inbound: inboundReport,
            outbound: outboundReport,
          }),
          "JSON (full anchor analysis)",
        ),
      ]}
    />
  );

  let body: React.ReactNode;
  if (inbound.isLoading || outbound.isLoading) {
    body = (
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
      </div>
    );
  } else if (inbound.isError) {
    body = (
      <QueryError error={inbound.error} onRetry={() => void inbound.refetch()} />
    );
  } else if (outbound.isError) {
    body = (
      <QueryError
        error={outbound.error}
        onRetry={() => void outbound.refetch()}
      />
    );
  } else {
    const capped =
      inboundRows.length >= LINK_ROW_CAP || outboundRows.length >= LINK_ROW_CAP;
    body = (
      <>
        <div className="grid gap-2 border-b border-border/60 bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          {savedAcceptedAnchors.length > 0 &&
          inboundReport.summary.trackedLinks > 0 ? (
            <div className="flex min-w-0 items-center gap-2">
              {inboundReport.summary.unacceptableLinks > 0 ? (
                <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {inboundReport.summary.acceptablePercent?.toFixed(1)}%
                  acceptable ·{" "}
                  {inboundReport.summary.unacceptablePercent?.toFixed(1)}%
                  need fixes
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {inboundReport.summary.acceptableLinks} of{" "}
                  {inboundReport.summary.trackedLinks} inbound links match the
                  accepted list.
                </p>
              </div>
            </div>
          ) : savedAcceptedAnchors.length > 0 ? (
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  Anchor policy configured
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  There are no current inbound links to evaluate.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add accepted anchors below to turn on compliance reporting for
              links pointing to this page.
            </p>
          )}
          <SegmentedControl
            value={view}
            onValueChange={(value) =>
              setView(value === "anchor" ? "anchor" : "url")
            }
            data={[
              { value: "url", label: "By URL" },
              { value: "anchor", label: "By anchor text" },
            ]}
            size="sm"
          />
        </div>

        <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-border/60">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ArrowDownLeft className="h-3 w-3" />
              Inbound · {inboundGroups.length} pages ({inboundRows.length} links)
            </p>
            {view === "url" ? (
              <LinkPartnerList
                groups={inboundGroups}
                compliance={inboundCompliance}
                sitePath={sitePath}
                emptyMessage="No current inbound links — other pages may not link here, or link resolution has not run for this site yet."
              />
            ) : (
              <AnchorTextTree
                report={inboundReport}
                sitePath={sitePath}
                emptyMessage="No current inbound anchor text is available."
              />
            )}
          </div>
          <div className="min-w-0 border-t border-border/60 sm:border-t-0">
            <p className="flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ArrowUpRight className="h-3 w-3" />
              Outbound · {outboundGroups.length} URLs ({outboundRows.length}{" "}
              links)
            </p>
            {view === "url" ? (
              <LinkPartnerList
                groups={outboundGroups}
                compliance={outboundCompliance}
                sitePath={sitePath}
                emptyMessage="No current outbound links are recorded for this page."
              />
            ) : (
              <AnchorTextTree
                report={outboundReport}
                sitePath={sitePath}
                emptyMessage="No current outbound anchor text is available."
              />
            )}
          </div>
          {capped ? (
            <p className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground sm:col-span-2">
              Reporting uses the newest {LINK_ROW_CAP} edges per direction;
              older edges are outside this bounded view.
            </p>
          ) : null}
        </div>

        <DesiredSection
          title="Accepted inbound anchor text"
          hint="Exact phrases other internal pages may use when linking here."
          dirty={desired.dirty}
          saving={desired.saving}
          onSave={() => void desired.save()}
          onReset={desired.reset}
        >
          <TextArrayInput
            value={desired.draft ?? []}
            onChange={(values) =>
              desired.setDraft(sanitizeAcceptedAnchorTexts(values))
            }
            placeholder="Type an acceptable anchor and press Enter (commas add several)"
            showCopyIcon={false}
            chipClassName="border border-primary/25 bg-primary/10 text-foreground"
            className="[&_input]:h-8 [&_input]:text-xs [&_span]:text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Matching ignores capitalization and repeated whitespace. Empty
            anchor text is never acceptable when a list is configured.
          </p>
        </DesiredSection>
      </>
    );
  }

  return (
    <SectionCard
      title="Internal links"
      copy={copy}
      headerExtra={exportMenu}
      collapsible
      anchor="page_links"
    >
      {body}
    </SectionCard>
  );
}
