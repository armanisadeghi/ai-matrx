/**
 * Shared human-readable formatters for the site audit rollup — consumed by
 * every Copy button on `AuditWorkspace` (metric cells, issue rows, worst-page
 * rows, page snapshot). One summary per shape; never duplicate these at a
 * callsite.
 */

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import type {
  AuditIssueRollup,
  AuditPageRollup,
  GonePageRollup,
  SiteAuditRollup,
} from "@/features/marketing/lib/audit-rollup";

const SECTION_LABEL: Record<AuditIssueRollup["section"], string> = {
  serp: "SERP",
  social: "Social",
  headings: "Headings",
  indexability: "Indexability",
  url: "URL",
};

export function humanIssueRow(issue: AuditIssueRollup): string {
  return humanLines([
    ["Section", SECTION_LABEL[issue.section]],
    ["Severity", issue.severity],
    ["Issue", issue.message],
    ["Pages affected", issue.count],
    ["Sample pages", issue.samples.map((s) => s.path).join(", ")],
  ]);
}

export function humanWorstPageRow(page: AuditPageRollup): string {
  return humanLines([
    ["Page", page.path],
    ["URL", page.url],
    ["Indexability", page.indexabilityVerdict],
    ["Errors", page.errorCount],
    ["Warnings", page.warningCount],
  ]);
}

/** How much traffic a gone page was still earning — the whole point of ranking. */
export function goneTrafficLabel(page: GonePageRollup): string {
  if (page.gscClicks28d === null && page.gscImpressions28d === null)
    return "Not in Google Search";
  const clicks = page.gscClicks28d ?? 0;
  const impressions = page.gscImpressions28d ?? 0;
  if (clicks === 0 && impressions === 0) return "No traffic in the last 28 days";
  return `${clicks.toLocaleString()} click${clicks === 1 ? "" : "s"} · ${impressions.toLocaleString()} impression${impressions === 1 ? "" : "s"} (28d)`;
}

export function humanGonePageRow(page: GonePageRollup): string {
  return humanLines([
    ["Page", page.path],
    ["URL", page.url],
    ["State", "Gone — the crawler no longer finds this URL"],
    ["Search traffic", goneTrafficLabel(page)],
    ["Last seen", page.lastSeen],
  ]);
}

/**
 * THE COVERAGE STATEMENT — what this audit actually looked at.
 *
 * A site audit that silently sampled, capped, or dropped rows is worse than no
 * audit: the user reads a clean number and believes it covers their site. The
 * rollup is aggregated in Postgres over every page the caller can see, so the
 * honest answer is always sayable — say it, on screen, in every copy/export.
 */
export function auditCoverageStatement(rollup: SiteAuditRollup): string {
  const n = (value: number) => value.toLocaleString();
  const parts = [
    `Audited all ${n(rollup.totalPages)} page${rollup.totalPages === 1 ? "" : "s"} on this site`,
    `${n(rollup.auditedPages)} with stored metrics from their latest capture`,
  ];
  if (rollup.uncomputedPages > 0) {
    parts.push(
      `${n(rollup.uncomputedPages)} awaiting a first crawl (URL quality still evaluated)`,
    );
  }
  if (rollup.nonHtmlResources > 0) {
    parts.push(
      `${n(rollup.nonHtmlResources)} machine resource${rollup.nonHtmlResources === 1 ? "" : "s"} excluded from HTML-only findings`,
    );
  }
  // Set aside, never silently dropped — the statement has to say where they
  // went, because they are reported as a finding of their own further down.
  if (rollup.gonePages > 0) {
    parts.push(
      `${n(rollup.gonePages)} page${rollup.gonePages === 1 ? "" : "s"} the crawler no longer finds, held out of these findings and reported separately as gone`,
    );
  }
  return `${parts.join(" — ")}. Nothing is capped or sampled.`;
}

/**
 * The snapshot stays a readable summary: it enumerates the top slice of the
 * (now complete, uncapped) issue list and states how many more exist. The
 * full list is always reachable via the JSON/agent copies and exports.
 */
const SNAPSHOT_ISSUE_LIMIT = 14;
/** Gone pages are ranked by traffic, so the first few are the costly ones. */
const SNAPSHOT_GONE_LIMIT = 10;

export function humanAuditSnapshot(rollup: SiteAuditRollup): string {
  const hiddenIssues = rollup.topIssues.length - SNAPSHOT_ISSUE_LIMIT;
  return [
    `Site audit rollup:`,
    `- Coverage: ${auditCoverageStatement(rollup)}`,
    `- Pages: ${rollup.totalPages} (${rollup.auditedPages} audited, ${rollup.uncomputedPages} not yet audited)`,
    `- Non-HTML resources excluded from page findings: ${rollup.nonHtmlResources}`,
    rollup.gonePages > 0
      ? `- Gone (crawler no longer finds them, excluded from page findings): ${rollup.gonePages}\n${rollup.gonePageDetails
          .slice(0, SNAPSHOT_GONE_LIMIT)
          .map((page) => `  - ${page.path} — ${goneTrafficLabel(page)}`)
          .join("\n")}${
          rollup.gonePageDetails.length > SNAPSHOT_GONE_LIMIT
            ? `\n  …and ${rollup.gonePageDetails.length - SNAPSHOT_GONE_LIMIT} more gone pages`
            : ""
        }`
      : `- Gone pages: 0`,
    `- Indexable: ${rollup.verdicts.indexable} · Needs review: ${rollup.verdicts.check} · Blocked: ${rollup.verdicts.blocked}`,
    `- Pass rates: SERP ${rollup.passes.serp}/${rollup.auditedPages}, Social ${rollup.passes.social}/${rollup.auditedPages}, Headings ${rollup.passes.headings}/${rollup.auditedPages}, URL ${rollup.passes.url}/${rollup.totalPages}`,
    rollup.topIssues.length
      ? `Top issues (${rollup.topIssues.length} distinct):\n${rollup.topIssues
          .slice(0, SNAPSHOT_ISSUE_LIMIT)
          .map((i) => `  - ${humanIssueRow(i).replaceAll("\n", " · ")}`)
          .join(
            "\n",
          )}${hiddenIssues > 0 ? `\n  …and ${hiddenIssues} more distinct issues` : ""}`
      : "No issues found.",
  ].join("\n");
}
