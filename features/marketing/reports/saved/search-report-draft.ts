// features/marketing/reports/saved/search-report-draft.ts — the Search Console
// report a screen can save as a versioned SEO report. Pure.
//
// Built only from synced provider rows (the same summary and findings the live
// report at /marketing/reports renders); a missing figure is written as "not
// reported", never invented. The headings are the platform template's required
// sections ("Summary", "Findings"), so the save door's section check passes.
// "How this report was made" is appended by the server, never written here.

import type { GscResolvedPeriods } from "@/features/marketing/search-console/types";
import type { ReportFinding, ReportSummaryRow } from "../report-narrative";
import type { SeoReportDraft } from "./types";

export const SEARCH_REPORT_KIND = "search-console";

function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "not reported" : Math.round(value).toLocaleString("en-US");
}

function signed(current: number, previous: number): string {
  const delta = Math.round(current - previous);
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-US")}`;
}

function rate(value: number | null): string {
  return value === null ? "not reported" : `${(value * 100).toFixed(1)}%`;
}

function position(value: number | null): string {
  return value === null ? "not reported" : value.toFixed(1);
}

/** `2026-09-05..2026-10-02` — the job's period, fits the tool's 40-character field. */
export function periodKey(periods: GscResolvedPeriods): string {
  return `${periods.current.start}..${periods.current.end}`;
}

export function buildSearchReportDraft(input: {
  siteId: string;
  siteLabel: string;
  periods: GscResolvedPeriods;
  windowLabel: string;
  summary: ReportSummaryRow;
  findings: readonly ReportFinding[];
}): SeoReportDraft {
  const { summary } = input;
  const lines = [
    "## Summary",
    "",
    `Search Console for ${input.siteLabel}, ${input.windowLabel}, compared with the previous period.`,
    "",
    "| Measure | This period | Change |",
    "| --- | --- | --- |",
    `| Visits from Google | ${count(summary.clicks)} | ${signed(summary.clicks, summary.cmp_clicks)} |`,
    `| Times shown | ${count(summary.impressions)} | ${signed(summary.impressions, summary.cmp_impressions)} |`,
    `| Visits per appearance | ${rate(summary.ctr)} | — |`,
    `| Average position | ${position(summary.avg_position)} | — |`,
    "",
    "## Findings",
    "",
    ...(input.findings.length > 0
      ? input.findings.map((f) => `- **${f.finding}** ${f.evidence}.`)
      : ["- No findings: Search Console reported no activity in this period."]),
    "",
  ];
  return {
    title: `${input.siteLabel} search report — ${input.windowLabel}`.slice(0, 200),
    markdown: lines.join("\n"),
    report_kind: SEARCH_REPORT_KIND,
    period: periodKey(input.periods),
    site_id: input.siteId,
  };
}
