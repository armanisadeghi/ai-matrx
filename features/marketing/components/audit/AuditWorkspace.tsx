"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle,
  Layers,
  Link2,
  OctagonAlert,
  Search,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingAuditScope } from "@/features/surfaces/manifests/marketing-audit.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  useSiteAuditRollup,
  useSiteAuditTrend,
} from "@/features/marketing/data/hooks";
import { AuditScoreTrendChart } from "@/features/marketing/components/audit/AuditScoreTrendChart";
import {
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { webCopy, webLocation } from "@/features/marketing/lib/copy-payloads";
import {
  humanAuditSnapshot,
  humanIssueRow,
  humanWorstPageRow,
} from "@/features/marketing/components/audit/format";
import type {
  AuditIssueRollup,
  AuditPageRollup,
  AuditSection,
  AuditTrendPoint,
  SiteAuditRollup,
} from "@/features/marketing/lib/audit-rollup";
import { cn } from "@/lib/utils";

/**
 * Site Audit — the rollup dashboard over every canonical page's stored
 * deterministic metrics (`web.snapshot.seo_metrics` + `audit_metrics`,
 * stamped per capture; URL quality computed live). Same numbers as the
 * per-page workspace and the scraper, by construction — this view only
 * aggregates, never re-derives.
 */

const SECTION_META: Record<
  AuditSection,
  { label: string; icon: typeof Search }
> = {
  serp: { label: "SERP", icon: Search },
  social: { label: "Social", icon: Share2 },
  headings: { label: "Headings", icon: Layers },
  indexability: { label: "Indexability", icon: ShieldCheck },
  url: { label: "URL", icon: Link2 },
};

function PassRateBar({
  label,
  icon: Icon,
  passed,
  total,
}: {
  label: string;
  icon: typeof Search;
  passed: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const tone =
    total === 0
      ? "bg-muted-foreground/30"
      : pct >= 90
        ? "bg-success"
        : pct >= 60
          ? "bg-warning"
          : "bg-destructive";
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="h-3 w-3 text-muted-foreground" />
          {label}
        </span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {total === 0 ? "—" : `${passed}/${total} · ${pct}%`}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            tone,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  pagePath,
  location,
}: {
  issue: AuditIssueRollup;
  pagePath: (pageId: string) => string;
  location: string;
}) {
  const meta = SECTION_META[issue.section];
  return (
    <div className="group/row flex min-w-0 items-start gap-2.5 px-3 py-2">
      {issue.severity === "error" ? (
        <OctagonAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground">{issue.message}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
          <span className="uppercase tracking-wide">{meta.label}</span>
          {issue.samples.map((sample) => (
            <Link
              key={sample.pageId}
              href={pagePath(sample.pageId)}
              className="truncate font-mono text-primary hover:underline"
            >
              {sample.path}
            </Link>
          ))}
          {issue.count > issue.samples.length ? (
            <span>+{issue.count - issue.samples.length} more</span>
          ) : null}
        </p>
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        ×{issue.count}
      </span>
      <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
        <CopyButtons
          size="xs"
          label={`${meta.label} issue`}
          human={() => humanIssueRow(issue)}
          json={() => issue}
          agent={() => ({
            kind: "web-audit-issue",
            location,
            description: `One rolled-up audit issue (${meta.label}) shared across ${issue.count} page(s).`,
            data: issue,
            summary: humanIssueRow(issue),
            attributes: {
              section: issue.section,
              severity: issue.severity,
              count: issue.count,
            },
          })}
        />
      </span>
    </div>
  );
}

function WorstPageRow({
  page,
  href,
  location,
}: {
  page: AuditPageRollup;
  href: string;
  location: string;
}) {
  return (
    <div className="group/row flex min-w-0 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            page.indexabilityVerdict === "blocked" || page.errorCount > 0
              ? "bg-destructive"
              : "bg-warning",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {page.path}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {page.errorCount > 0 ? `${page.errorCount}E · ` : ""}
          {page.warningCount}W
        </span>
      </Link>
      <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
        <CopyButtons
          size="xs"
          label={page.path}
          human={() => humanWorstPageRow(page)}
          json={() => page}
          agent={() => ({
            kind: "web-audit-worst-page",
            location,
            description: "One page ranked worst by audit error/warning count.",
            data: page,
            summary: humanWorstPageRow(page),
            attributes: {
              page_id: page.pageId,
              errors: page.errorCount,
              warnings: page.warningCount,
            },
          })}
        />
      </span>
    </div>
  );
}

function AuditBody({
  rollup,
  sitePath,
  trendPoints,
  siteDomain,
  siteId,
}: {
  rollup: SiteAuditRollup;
  sitePath: string;
  trendPoints: AuditTrendPoint[];
  siteDomain: string;
  siteId: string;
}) {
  const pagePath = (pageId: string) => `${sitePath}/pages/${pageId}`;
  const pageLocation = webLocation(`Site audit — ${siteDomain}`);
  const copy = webCopy({
    kind: "web-site-audit-rollup",
    label: "Site audit",
    description:
      "Deterministic site-wide audit rollup: indexability verdicts, per-section pass rates, and the most common issues across every canonical page's latest capture.",
    surface: "Site audit",
    data: rollup,
    lines: [
      ["Pages", rollup.totalPages],
      ["Audited", rollup.auditedPages],
      ["Non-HTML resources", rollup.nonHtmlResources],
      ["Indexable", rollup.verdicts.indexable],
      ["Needs review", rollup.verdicts.check],
      ["Blocked", rollup.verdicts.blocked],
      ...rollup.topIssues.map((issue): [string, string] => [
        `${SECTION_META[issue.section].label} ×${issue.count}`,
        issue.message,
      ]),
    ],
  });

  const metricCopy = (label: string, value: number, detail?: string) => ({
    label: `${label} (audit)`,
    human: () =>
      `${label}: ${value.toLocaleString()} (${siteDomain})${detail ? ` — ${detail}` : ""}`,
    agent: () => ({
      kind: "web-audit-metric",
      location: pageLocation,
      description: `The "${label}" site-audit KPI for ${siteDomain}.`,
      data: { metric: label, value, detail: detail ?? null },
      attributes: { metric: label },
    }),
  });

  const topIssuesCopy = {
    label: "Top issues",
    human: () =>
      rollup.topIssues.length
        ? rollup.topIssues.map((i) => `- ${humanIssueRow(i)}`).join("\n\n")
        : "No issues found across the audited pages.",
    agent: () => ({
      kind: "web-audit-issues",
      location: pageLocation,
      description: `The top ${rollup.topIssues.length} rolled-up audit issues for ${siteDomain}, ranked by severity then page count.`,
      data: rollup.topIssues,
      attributes: { count: rollup.topIssues.length },
    }),
  };

  const worstPagesCopy = {
    label: "Pages needing attention",
    human: () =>
      rollup.worstPages.length
        ? rollup.worstPages.map((p) => `- ${humanWorstPageRow(p)}`).join("\n\n")
        : "Every audited page is clean.",
    agent: () => ({
      kind: "web-audit-worst-pages",
      location: pageLocation,
      description: `The ${rollup.worstPages.length} worst-ranked pages by audit error/warning count for ${siteDomain}.`,
      data: rollup.worstPages,
      attributes: { count: rollup.worstPages.length },
    }),
  };

  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "summary",
      title: "Audit summary",
      description: "Page counts, verdicts, and pass rates.",
      build: (level) =>
        level === "brief"
          ? {
              total_pages: rollup.totalPages,
              audited_pages: rollup.auditedPages,
              non_html_resources: rollup.nonHtmlResources,
              verdicts: rollup.verdicts,
            }
          : { ...rollup, topIssues: undefined, worstPages: undefined },
      levelLabels: { full: "Raw", compact: "Raw", brief: "Counts only" },
    },
    {
      id: "trend",
      title: "Score trend",
      description: `${trendPoints.length} stored capture days.`,
      cuttable: true,
      levelLabels: {
        full: `All ${trendPoints.length}`,
        compact: "Last 30",
        brief: "Latest only",
      },
      build: (level) =>
        level === "full"
          ? trendPoints
          : level === "compact"
            ? trendPoints.slice(-30)
            : trendPoints.slice(-1),
    },
    {
      id: "top_issues",
      title: "Top issues",
      description: `${rollup.topIssues.length} rolled-up issues (already capped at the top 14 by severity/count).`,
      cuttable: true,
      levelLabels: { full: "All (raw)", compact: "Top 8", brief: "Top 3" },
      build: (level) =>
        level === "full"
          ? rollup.topIssues
          : rollup.topIssues.slice(0, level === "compact" ? 8 : 3),
    },
    {
      id: "worst_pages",
      title: "Pages needing attention",
      description: `${rollup.worstPages.length} worst-ranked pages (already capped at the top 10).`,
      cuttable: true,
      levelLabels: { full: "All (raw)", compact: "Top 5", brief: "Top 3" },
      build: (level) =>
        level === "full"
          ? rollup.worstPages
          : rollup.worstPages.slice(0, level === "compact" ? 5 : 3),
    },
  ];

  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  const pageAgentPayload = (): AgentPayloadInput => ({
    kind: "marketing-audit-page",
    location: pageLocation,
    description: `The full site-audit rollup dashboard for ${siteDomain}.`,
    data: pageFullData(),
    summary: humanAuditSnapshot(rollup),
    attributes: { site_id: siteId, domain: siteDomain },
  });

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Site audit — ${siteDomain}`,
    kind: "marketing-audit-page",
    location: pageLocation,
    description: `The full site-audit rollup dashboard for ${siteDomain}.`,
    attributes: { domain: siteDomain },
    summary: humanAuditSnapshot(rollup),
    sections: groomerSections(),
  });

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <section className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold text-foreground">
              Site audit
            </h1>
            <span className="text-xs tabular-nums text-muted-foreground">
              {rollup.auditedPages.toLocaleString()} /{" "}
              {rollup.totalPages.toLocaleString()} audited
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CopyButtons
              size="icon"
              label={`Site audit (${siteDomain})`}
              human={() => humanAuditSnapshot(rollup)}
              json={pageFullData}
              agent={pageAgentPayload}
            />
            <AgentCopyGroomerLauncher config={groomerConfig} />
          </div>
        </section>

        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <MetricCell
            label="Pages"
            value={rollup.totalPages}
            detail="Canonical registry"
            copy={metricCopy("Pages", rollup.totalPages, "Canonical registry")}
          />
          <MetricCell
            label="Audited"
            value={rollup.auditedPages}
            detail="Latest capture has metrics"
            tone={rollup.auditedPages > 0 ? "good" : "warning"}
            copy={metricCopy(
              "Audited",
              rollup.auditedPages,
              "Latest capture has metrics",
            )}
          />
          <MetricCell
            label="Indexable"
            value={rollup.verdicts.indexable}
            tone="good"
            detail="Verdict: indexable"
            copy={metricCopy(
              "Indexable",
              rollup.verdicts.indexable,
              "Verdict: indexable",
            )}
          />
          <MetricCell
            label="Needs review"
            value={rollup.verdicts.check}
            tone={rollup.verdicts.check ? "warning" : "default"}
            detail="Verdict: check"
            copy={metricCopy(
              "Needs review",
              rollup.verdicts.check,
              "Verdict: check",
            )}
          />
          <MetricCell
            label="Blocked"
            value={rollup.verdicts.blocked}
            tone={rollup.verdicts.blocked ? "bad" : "default"}
            detail="Errors or noindex"
            copy={metricCopy(
              "Blocked",
              rollup.verdicts.blocked,
              "Errors or noindex",
            )}
          />
          <MetricCell
            label="Not yet audited"
            value={rollup.uncomputedPages}
            tone={rollup.uncomputedPages ? "warning" : "default"}
            detail="Never crawled / pre-stamping"
            copy={metricCopy(
              "Not yet audited",
              rollup.uncomputedPages,
              "Never crawled / pre-stamping",
            )}
          />
        </section>

        <SectionCard title="Pass rates" copy={copy}>
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <PassRateBar
              label="SERP metadata"
              icon={Search}
              passed={rollup.passes.serp}
              total={rollup.auditedPages}
            />
            <PassRateBar
              label="Social cards"
              icon={Share2}
              passed={rollup.passes.social}
              total={rollup.auditedPages}
            />
            <PassRateBar
              label="Heading structure"
              icon={Layers}
              passed={rollup.passes.headings}
              total={rollup.auditedPages}
            />
            <PassRateBar
              label="URL quality"
              icon={Link2}
              passed={rollup.passes.url}
              total={rollup.totalPages}
            />
          </div>
        </SectionCard>

        <SectionCard title="Score trend">
          <div className="p-4">
            <AuditScoreTrendChart points={trendPoints} />
          </div>
        </SectionCard>

        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard title="Top issues" copy={topIssuesCopy}>
            {rollup.topIssues.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-xs text-success">
                <CheckCircle className="h-4 w-4" />
                No issues found across the audited pages.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {rollup.topIssues.map((issue) => (
                  <IssueRow
                    key={`${issue.section}:${issue.message}`}
                    issue={issue}
                    pagePath={pagePath}
                    location={pageLocation}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Pages needing attention" copy={worstPagesCopy}>
            {rollup.worstPages.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-xs text-success">
                <CheckCircle className="h-4 w-4" />
                Every audited page is clean.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {rollup.worstPages.map((page) => (
                  <WorstPageRow
                    key={page.pageId}
                    page={page}
                    href={pagePath(page.pageId)}
                    location={pageLocation}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {rollup.uncomputedPages > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {rollup.uncomputedPages} page
            {rollup.uncomputedPages === 1 ? " has" : "s have"} no stored metrics
            yet — they gain full audit coverage on their next crawl or fetch
            (URL quality is already included for every page).
          </p>
        ) : null}
        {rollup.nonHtmlResources > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {rollup.nonHtmlResources} known non-HTML resource
            {rollup.nonHtmlResources === 1 ? " is" : "s are"} retained in crawl
            evidence but excluded from HTML-only page findings.
          </p>
        ) : null}
      </div>
    </main>
  );
}

export function AuditWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const rollup = useSiteAuditRollup(site.id);
  const trend = useSiteAuditTrend(site.id);
  if (rollup.isLoading)
    return <LoadingSurface label="Aggregating site audit…" />;
  const data = rollup.data;
  if (rollup.isError || !data) {
    return (
      <QueryError
        error={rollup.error ?? new Error("Audit rollup unavailable")}
        onRetry={() => void rollup.refetch()}
      />
    );
  }
  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-audit"
      getScope={() =>
        createMarketingAuditScope({
          ...getBaseValues(),
          audit_rollup: { ...data },
          pages_total: data.totalPages,
          pages_audited: data.auditedPages,
          pages_uncomputed: data.uncomputedPages,
          non_html_resources: data.nonHtmlResources,
          indexability_verdicts: { ...data.verdicts },
          section_passes: { ...data.passes },
          top_issues: data.topIssues.map((issue) => ({ ...issue })),
          worst_pages: data.worstPages.map((page) => ({ ...page })),
          audit_score_trend: (trend.data ?? []).map((point) => ({ ...point })),
        })
      }
    >
      <AuditBody
        rollup={data}
        sitePath={sitePath}
        trendPoints={trend.data ?? []}
        siteDomain={site.domain}
        siteId={site.id}
      />
    </SurfaceRuntimeProvider>
  );
}
