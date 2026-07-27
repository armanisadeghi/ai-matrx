"use client";

import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  FindingStatusBadge,
  SeverityBadge,
} from "@/features/marketing/components/analysis/AnalysisBadges";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  formatCompactDate,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { usePageOpenFindings } from "@/features/marketing/data/analysis-hooks";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage } from "@/features/marketing/types";

const LIST_LIMIT = 10;

/**
 * Inline "Open findings" card for one canonical page — the rows behind the
 * workspace's Open-findings count (open + reopened, unsuppressed), each
 * linking into the findings register's detail page.
 */
export function PageFindingsCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const findings = usePageOpenFindings(site.id, page.id, LIST_LIMIT);
  const rows = findings.data?.rows ?? [];
  const total = findings.data?.total ?? 0;

  // The register's table state reads `f_<column>` params (query-state.ts) and
  // its service applies page_id / suppressed server-side — these are the exact
  // filter params the findings register supports for a page.
  const registerParams = new URLSearchParams({
    f_page_id: `text:${page.id}`,
    f_suppressed: "boolean:false",
  });
  const registerHref = `${sitePath}/findings?${registerParams.toString()}`;

  const copy = webCopy({
    kind: "web-page-findings",
    label: "Open findings",
    description:
      "The open and reopened, unsuppressed findings currently recorded against this canonical page (workspace count scope).",
    surface: `Open findings — ${page.url}`,
    data: {
      page_id: page.id,
      site_id: site.id,
      total_open: total,
      loaded: rows.length,
      findings: rows,
    },
    lines: [
      ["Page", page.path || "/"],
      ["URL", page.url],
      ["Open findings", total],
      ...rows.map(
        (row): [string, string] => [
          row.item_key,
          `${row.severity} / ${row.status} / last ${formatCompactDate(row.last_detected_at)}`,
        ],
      ),
    ],
    attributes: { page_id: page.id, site_id: site.id, total_open: total },
  });

  return (
    <SectionCard
      title={total > 0 ? `Open findings (${total})` : "Open findings"}
      collapsible
      anchor="open_findings_list"
      copy={copy}
      action={{ label: "View all in findings register", href: registerHref }}
    >
      {findings.isLoading ? (
        <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading open findings…
        </div>
      ) : findings.isError ? (
        <QueryError
          error={findings.error}
          onRetry={() => void findings.refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          No open findings for this page
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`${sitePath}/findings/${row.id}`}
                className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <SeverityBadge value={row.severity} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] font-medium text-foreground">
                    {row.item_key}
                  </span>
                  <span className="block truncate text-[10px] capitalize text-muted-foreground">
                    {row.category} / {row.subcategory}
                  </span>
                </span>
                <FindingStatusBadge value={row.status} />
                <span className="hidden shrink-0 text-right text-[10px] text-muted-foreground sm:block">
                  <span className="block whitespace-nowrap">
                    First {formatCompactDate(row.first_detected_at)}
                  </span>
                  <span className="block whitespace-nowrap">
                    Last {formatCompactDate(row.last_detected_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
