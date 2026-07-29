"use client";

/**
 * SiteLinkComplianceView — the "Plan" view of the site Links workspace:
 * every page that declared an inbound anchor policy or a link plan
 * (`web.page.desired_values.accepted_anchor_texts` / `.inbound_links` /
 * `.outbound_links`), with every other page's CURRENT links scored against
 * it — compliant, wrong anchor, or missing — aggregated into site-wide
 * internal-linking health with the biggest gaps first.
 *
 * Data: two bounded direct reads (pages + edges) aggregated client-side in
 * `buildSiteLinkComplianceReport`. Caps render loudly.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  buildSiteLinkComplianceReport,
  useSiteLinkPlanEdges,
  useSitePagePlanRows,
  LINK_PLAN_EDGE_CAP,
  LINK_PLAN_PAGE_CAP,
  type SiteLinkComplianceReport,
  type SitePlannedLinkRow,
  type SourcePageOutboundCompliance,
  type TargetPageCompliance,
} from "@/features/marketing/data/site-link-compliance";
import { displayUrl } from "@/features/marketing/components/inspection/link-graph/model";
import { webCopy } from "@/features/marketing/lib/copy-payloads";

function StatChip({
  value,
  label,
  tone = "default",
}: {
  value: number | string;
  label: string;
  tone?: "default" | "good" | "warning" | "bad";
}) {
  return (
    <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
      <span
        className={cn(
          "font-semibold text-foreground",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-destructive",
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>{" "}
      {label}
    </span>
  );
}

function PlanScoreList({
  rows,
  sitePath,
  rootUrl,
  direction,
}: {
  rows: SitePlannedLinkRow[];
  sitePath: string;
  rootUrl: string;
  direction: "inbound" | "outbound";
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="grid gap-1">
      {rows.map(({ score, partnerPageId }) => (
        <li
          key={score.entry.id}
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]"
        >
          {score.status === "linked" ? (
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-400"
            >
              linked
            </Badge>
          ) : score.status === "wrong_anchor" ? (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400"
            >
              wrong anchor
            </Badge>
          ) : (
            <Badge variant="destructive" className="shrink-0 text-[10px]">
              missing
            </Badge>
          )}
          {partnerPageId ? (
            <Link
              href={`${sitePath}/pages/${partnerPageId}`}
              className="min-w-0 truncate font-mono text-foreground hover:text-primary"
              title={score.entry.url}
            >
              {displayUrl(score.entry.url, rootUrl)}
            </Link>
          ) : (
            <span
              className="min-w-0 truncate font-mono text-foreground"
              title={score.entry.url}
            >
              {displayUrl(score.entry.url, rootUrl)}
            </span>
          )}
          {score.entry.anchor_text ? (
            <span className="text-muted-foreground">
              wants “{score.entry.anchor_text}”
            </span>
          ) : null}
          {score.status === "wrong_anchor" && score.observedAnchors.length ? (
            <span className="text-amber-700 dark:text-amber-400">
              currently{" "}
              {score.observedAnchors.map((anchor) => `“${anchor}”`).join(" · ")}
            </span>
          ) : null}
          <span className="text-muted-foreground">
            ({direction === "inbound" ? "from" : "to"} this URL:{" "}
            {score.observedEdgeCount}{" "}
            {score.observedEdgeCount === 1 ? "link" : "links"})
          </span>
        </li>
      ))}
    </ul>
  );
}

function TargetRow({
  target,
  expanded,
  onToggle,
  sitePath,
  rootUrl,
}: {
  target: TargetPageCompliance;
  expanded: boolean;
  onToggle: () => void;
  sitePath: string;
  rootUrl: string;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const gaps =
    target.unacceptableLinks +
    target.planSummary.wrongAnchor +
    target.planSummary.missing;
  return (
    <li className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/40",
          gaps > 0 && "bg-amber-500/5",
        )}
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground"
          title={target.url}
        >
          {displayUrl(target.url, rootUrl)}
        </span>
        {gaps === 0 ? (
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            healthy
          </Badge>
        ) : (
          <>
            {target.unacceptableLinks > 0 ? (
              <Badge variant="destructive" className="shrink-0 text-[10px]">
                {target.unacceptableLinks} wrong-anchor{" "}
                {target.unacceptableLinks === 1 ? "link" : "links"}
              </Badge>
            ) : null}
            {target.planSummary.missing > 0 ? (
              <Badge
                variant="outline"
                className="shrink-0 border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400"
              >
                {target.planSummary.missing} planned missing
              </Badge>
            ) : null}
          </>
        )}
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {target.inboundLinks} inbound
        </span>
      </button>
      {expanded ? (
        <div className="grid gap-2 border-t border-border/50 bg-background/45 px-3 py-2 pl-9">
          <p className="text-[11px] text-muted-foreground">
            <Link
              href={`${sitePath}/pages/${target.pageId}`}
              className="font-medium text-primary hover:underline"
            >
              Open page workspace
            </Link>
            {" · "}
            Accepted anchors:{" "}
            {target.acceptedAnchors.length
              ? target.acceptedAnchors.map((anchor) => `“${anchor}”`).join(" · ")
              : "none declared (plan-only)"}
          </p>
          {target.offenders.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pages linking with a wrong anchor
              </p>
              <ul className="mt-1 grid gap-1">
                {target.offenders.slice(0, 10).map((offender) => (
                  <li
                    key={offender.sourcePageId || offender.sourceUrl}
                    className="flex flex-wrap items-center gap-x-2 text-[11px]"
                  >
                    {offender.sourcePageId ? (
                      <Link
                        href={`${sitePath}/pages/${offender.sourcePageId}`}
                        className="min-w-0 truncate font-mono text-foreground hover:text-primary"
                        title={offender.sourceUrl}
                      >
                        {displayUrl(offender.sourceUrl, rootUrl)}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate font-mono">
                        {displayUrl(offender.sourceUrl, rootUrl)}
                      </span>
                    )}
                    <span className="text-amber-700 dark:text-amber-400">
                      {offender.anchors.map((anchor) => `“${anchor}”`).join(" · ")}
                    </span>
                    {offender.linkCount > 1 ? (
                      <span className="tabular-nums text-muted-foreground">
                        ×{offender.linkCount}
                      </span>
                    ) : null}
                  </li>
                ))}
                {target.offenders.length > 10 ? (
                  <li className="text-[11px] text-muted-foreground">
                    +{target.offenders.length - 10} more sources in the copied
                    data.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          {target.planScores.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Planned inbound links
              </p>
              <div className="mt-1">
                <PlanScoreList
                  rows={target.planScores}
                  sitePath={sitePath}
                  rootUrl={rootUrl}
                  direction="inbound"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function SourceRow({
  source,
  expanded,
  onToggle,
  sitePath,
  rootUrl,
}: {
  source: SourcePageOutboundCompliance;
  expanded: boolean;
  onToggle: () => void;
  sitePath: string;
  rootUrl: string;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const gaps = source.planSummary.wrongAnchor + source.planSummary.missing;
  return (
    <li className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/40",
          gaps > 0 && "bg-amber-500/5",
        )}
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground"
          title={source.url}
        >
          {displayUrl(source.url, rootUrl)}
        </span>
        {gaps === 0 ? (
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            complete
          </Badge>
        ) : (
          <>
            {source.planSummary.wrongAnchor > 0 ? (
              <Badge
                variant="outline"
                className="shrink-0 border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400"
              >
                {source.planSummary.wrongAnchor} wrong anchor
              </Badge>
            ) : null}
            {source.planSummary.missing > 0 ? (
              <Badge variant="destructive" className="shrink-0 text-[10px]">
                {source.planSummary.missing} missing
              </Badge>
            ) : null}
          </>
        )}
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {source.planSummary.linked}/{source.planSummary.planned} in place
        </span>
      </button>
      {expanded ? (
        <div className="grid gap-2 border-t border-border/50 bg-background/45 px-3 py-2 pl-9">
          <p className="text-[11px] text-muted-foreground">
            <Link
              href={`${sitePath}/pages/${source.pageId}`}
              className="font-medium text-primary hover:underline"
            >
              Open page workspace
            </Link>
          </p>
          <PlanScoreList
            rows={source.planScores}
            sitePath={sitePath}
            rootUrl={rootUrl}
            direction="outbound"
          />
        </div>
      ) : null}
    </li>
  );
}

export function SiteLinkComplianceView() {
  const { site, sitePath } = useMarketingSite();
  const pages = useSitePagePlanRows(site.id);
  const edges = useSiteLinkPlanEdges(site.id);
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    () => new Set(),
  );

  if (pages.isLoading || edges.isLoading) {
    return <LoadingSurface label="Scoring internal links against page plans…" />;
  }
  if (pages.isError) {
    return <QueryError error={pages.error} onRetry={() => void pages.refetch()} />;
  }
  if (edges.isError) {
    return <QueryError error={edges.error} onRetry={() => void edges.refetch()} />;
  }
  if (!pages.data || !edges.data) return null;

  const report: SiteLinkComplianceReport = buildSiteLinkComplianceReport(
    pages.data,
    edges.data,
  );
  const { totals } = report;
  const nothingDeclared =
    report.targets.length === 0 && report.sources.length === 0;

  const toggle = (
    set: Set<string>,
    apply: (next: Set<string>) => void,
    id: string,
  ) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const copy = webCopy({
    kind: "web-site-link-compliance",
    label: "Internal link compliance",
    description:
      "Site-wide internal-link compliance: every page with a declared anchor policy or link plan, with all other pages' current links scored against it (compliant / wrong anchor / missing planned link).",
    surface: `Internal link compliance — ${site.domain}`,
    data: report,
    lines: [
      ["Pages scanned", totals.pagesScanned],
      ["Pages with anchor policies", totals.pagesWithPolicies],
      ["Pages with inbound plans", totals.pagesWithInboundPlans],
      ["Pages with outbound plans", totals.pagesWithOutboundPlans],
      ["Tracked inbound links", totals.trackedInboundLinks],
      [
        "Acceptable",
        totals.acceptablePercent === null
          ? "n/a"
          : `${totals.acceptablePercent.toFixed(1)}%`,
      ],
      ["Links needing anchor fixes", totals.unacceptableLinks],
      ["Planned links", totals.plannedLinks],
      ["Planned links in place", totals.plannedLinked],
      ["Planned links with wrong anchor", totals.plannedWrongAnchor],
      ["Planned links missing", totals.plannedMissing],
    ],
    attributes: { site_id: site.id, domain: site.domain },
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <section className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-3 py-2">
        <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
        <StatChip value={totals.pagesWithPolicies} label="anchor policies" />
        <StatChip
          value={totals.pagesWithInboundPlans + totals.pagesWithOutboundPlans}
          label="pages with link plans"
        />
        <StatChip
          value={
            totals.acceptablePercent === null
              ? "—"
              : `${totals.acceptablePercent.toFixed(1)}%`
          }
          label="inbound anchors compliant"
          tone={
            totals.acceptablePercent !== null && totals.unacceptableLinks > 0
              ? "warning"
              : "good"
          }
        />
        <StatChip
          value={totals.unacceptableLinks}
          label="links need anchor fixes"
          tone={totals.unacceptableLinks > 0 ? "bad" : "default"}
        />
        <StatChip
          value={totals.plannedMissing}
          label="planned links missing"
          tone={totals.plannedMissing > 0 ? "warning" : "default"}
        />
        <div className="ml-auto">
          <CopyButtons size="icon" {...copy} />
        </div>
      </section>

      {(report.pagesTruncated || report.edgesTruncated) ? (
        <p className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          Bounded read hit its cap
          {report.pagesTruncated
            ? ` (first ${LINK_PLAN_PAGE_CAP.toLocaleString()} pages)`
            : ""}
          {report.edgesTruncated
            ? ` (newest ${LINK_PLAN_EDGE_CAP.toLocaleString()} edges)`
            : ""}
          — scoring covers that bounded slice, not the whole site.
        </p>
      ) : null}

      {nothingDeclared ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            No page has declared a link plan yet
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            Open a page workspace and use its Link plan card to declare
            accepted inbound anchor texts, planned inbound links, and planned
            outbound links. Every other page's links get scored against those
            declarations here.
          </p>
        </div>
      ) : (
        <>
          {report.targets.length > 0 ? (
            <section className="shrink-0 overflow-hidden rounded-lg border border-border bg-card">
              <p className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ArrowDownLeft className="h-3 w-3" />
                Inbound policies and plans · {report.targets.length}{" "}
                {report.targets.length === 1 ? "page" : "pages"} (biggest gaps
                first)
              </p>
              <ul>
                {report.targets.map((target) => (
                  <TargetRow
                    key={target.pageId}
                    target={target}
                    expanded={expandedTargets.has(target.pageId)}
                    onToggle={() =>
                      toggle(expandedTargets, setExpandedTargets, target.pageId)
                    }
                    sitePath={sitePath}
                    rootUrl={site.root_url}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {report.sources.length > 0 ? (
            <section className="shrink-0 overflow-hidden rounded-lg border border-border bg-card">
              <p className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ArrowUpRight className="h-3 w-3" />
                Outbound plans · {report.sources.length}{" "}
                {report.sources.length === 1 ? "page" : "pages"}
              </p>
              <ul>
                {report.sources.map((source) => (
                  <SourceRow
                    key={source.pageId}
                    source={source}
                    expanded={expandedSources.has(source.pageId)}
                    onToggle={() =>
                      toggle(expandedSources, setExpandedSources, source.pageId)
                    }
                    sitePath={sitePath}
                    rootUrl={site.root_url}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          <p className="shrink-0 pb-2 text-[11px] text-muted-foreground">
            Scoring uses each source page's latest accepted snapshot only (
            {report.currentEdges.toLocaleString()} current edges). Declare
            policies and plans on each page's Link plan card.
          </p>
        </>
      )}
    </div>
  );
}
