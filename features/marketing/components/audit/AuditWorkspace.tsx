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
import { useSiteAuditRollup } from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type {
  AuditIssueRollup,
  AuditSection,
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
          className={cn("h-full rounded-full transition-all duration-300", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  pagePath,
}: {
  issue: AuditIssueRollup;
  pagePath: (pageId: string) => string;
}) {
  const meta = SECTION_META[issue.section];
  return (
    <div className="flex min-w-0 items-start gap-2.5 px-3 py-2">
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
    </div>
  );
}

function AuditBody({
  rollup,
  sitePath,
}: {
  rollup: SiteAuditRollup;
  sitePath: string;
}) {
  const pagePath = (pageId: string) => `${sitePath}/pages/${pageId}`;
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
      ["Indexable", rollup.verdicts.indexable],
      ["Needs review", rollup.verdicts.check],
      ["Blocked", rollup.verdicts.blocked],
      ...rollup.topIssues.map(
        (issue): [string, string] => [
          `${SECTION_META[issue.section].label} ×${issue.count}`,
          issue.message,
        ],
      ),
    ],
  });

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <MetricCell
            label="Pages"
            value={rollup.totalPages}
            detail="Canonical registry"
          />
          <MetricCell
            label="Audited"
            value={rollup.auditedPages}
            detail="Latest capture has metrics"
            tone={rollup.auditedPages > 0 ? "good" : "warning"}
          />
          <MetricCell
            label="Indexable"
            value={rollup.verdicts.indexable}
            tone="good"
            detail="Verdict: indexable"
          />
          <MetricCell
            label="Needs review"
            value={rollup.verdicts.check}
            tone={rollup.verdicts.check ? "warning" : "default"}
            detail="Verdict: check"
          />
          <MetricCell
            label="Blocked"
            value={rollup.verdicts.blocked}
            tone={rollup.verdicts.blocked ? "bad" : "default"}
            detail="Errors or noindex"
          />
          <MetricCell
            label="Not yet audited"
            value={rollup.uncomputedPages}
            tone={rollup.uncomputedPages ? "warning" : "default"}
            detail="Never crawled / pre-stamping"
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

        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard title="Top issues">
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
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Pages needing attention">
            {rollup.worstPages.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-xs text-success">
                <CheckCircle className="h-4 w-4" />
                Every audited page is clean.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {rollup.worstPages.map((page) => (
                  <Link
                    key={page.pageId}
                    href={pagePath(page.pageId)}
                    className="flex min-w-0 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        page.indexabilityVerdict === "blocked" ||
                          page.errorCount > 0
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
      </div>
    </main>
  );
}

export function AuditWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const rollup = useSiteAuditRollup(site.id);
  if (rollup.isLoading)
    return <LoadingSurface label="Aggregating site audit…" />;
  if (rollup.isError || !rollup.data) {
    return (
      <QueryError
        error={rollup.error ?? new Error("Audit rollup unavailable")}
        onRetry={() => void rollup.refetch()}
      />
    );
  }
  return <AuditBody rollup={rollup.data} sitePath={sitePath} />;
}
