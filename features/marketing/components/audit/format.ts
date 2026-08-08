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

/**
 * The snapshot stays a readable summary: it enumerates the top slice of the
 * (now complete, uncapped) issue list and states how many more exist. The
 * full list is always reachable via the JSON/agent copies and exports.
 */
const SNAPSHOT_ISSUE_LIMIT = 14;

export function humanAuditSnapshot(rollup: SiteAuditRollup): string {
  const hiddenIssues = rollup.topIssues.length - SNAPSHOT_ISSUE_LIMIT;
  return [
    `Site audit rollup:`,
    `- Pages: ${rollup.totalPages} (${rollup.auditedPages} audited, ${rollup.uncomputedPages} not yet audited)`,
    `- Non-HTML resources excluded from page findings: ${rollup.nonHtmlResources}`,
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
