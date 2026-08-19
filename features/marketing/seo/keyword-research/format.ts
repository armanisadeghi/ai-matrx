/**
 * Shared human-readable formatters for the site keyword performance
 * workspace — consumed by every Copy button on the page (the "matching
 * queries" stat, table rows, whole-view copy). One summary per shape; never
 * duplicate these at a callsite.
 */

import {
  BING_PROVIDER,
  GOOGLE_SEARCH_CONSOLE_PROVIDER,
} from "@/features/marketing/lib/provider-names";
import { humanLines } from "@/features/marketing/lib/copy-payloads";
import { buildKeywordBrief } from "@/features/marketing/seo/keyword/keyword-brief";
import {
  US_LOCATION_CODE,
  type KeywordWithMarket,
  type SiteKeywordPerformanceRow,
} from "./types";
import { keywordWorkflowStage } from "./workflow-status";

const PROVIDER_LABELS: Record<string, string> = {
  gsc: GOOGLE_SEARCH_CONSOLE_PROVIDER.label,
  bing_webmaster: BING_PROVIDER.label,
};

export function providerLabel(provider: string | null): string {
  if (!provider) return "Unknown source";
  return PROVIDER_LABELS[provider] ?? provider;
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en").format(Math.round(value));
}

export function formatDecimal(
  value: number | null | undefined,
  digits = 1,
): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);
}

export function humanKeywordPerformanceRow(
  row: SiteKeywordPerformanceRow,
): string {
  const ctr = row.ctr === null ? "—" : `${formatDecimal(row.ctr * 100)}%`;
  const strongestPage = row.top_page_path ?? row.top_page_url ?? "unmatched";
  return [
    `"${row.query ?? "unknown query"}" — ${providerLabel(row.provider)}`,
    `- Clicks: ${formatCount(row.clicks)} · Impressions: ${formatCount(row.impressions)} · CTR: ${ctr} · Position: ${formatDecimal(row.average_position)}`,
    `- Volume: ${formatCount(row.search_volume)} · CPC: ${formatMoney(row.cpc)} · Competition: ${row.competition ?? "—"}`,
    `- Strongest page: ${strongestPage}`,
    `- SEO stage: ${keywordWorkflowStage(row.workflow_status).label}`,
  ].join("\n");
}

/** Compact projection of a performance row for agent payloads at scale. */
export function projectKeywordPerformanceRow(row: SiteKeywordPerformanceRow) {
  return {
    provider: row.provider,
    query: row.query,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    average_position: row.average_position,
    search_volume: row.search_volume,
    cpc: row.cpc,
    competition: row.competition,
    top_page_path: row.top_page_path ?? row.top_page_url,
    workflow_status: row.workflow_status,
  };
}

export function humanKeywordPerformanceList(
  rows: SiteKeywordPerformanceRow[],
  total: number,
): string {
  if (!rows.length) return "No search queries stored yet.";
  return [
    `Keyword performance: ${rows.length} loaded of ${formatCount(total)} total.`,
    ...rows.map((row) => `- ${humanKeywordPerformanceRow(row)}`),
  ].join("\n");
}

export function humanMatchingQueriesStat(
  total: number,
  siteDomain: string,
): string {
  return `Matching queries: ${formatCount(total)} (${siteDomain})`;
}

/** The rendered keyword-library row, shared by human and AI table copy. */
export function keywordLibraryCopyRow(
  row: KeywordWithMarket,
  discovered: boolean | null,
) {
  const market =
    row.keyword_market.find(
      (candidate) => candidate.location_code === US_LOCATION_CODE,
    ) ??
    row.keyword_market[0] ??
    null;
  const brief = buildKeywordBrief({
    phrase: row.phrase,
    keyword: row,
    market,
  });
  const source =
    discovered === null ? "Unknown" : discovered ? "Research" : "Manual";
  const lines: Array<[string, string]> = [
    ["Keyword", row.phrase],
    ["Source", source],
    ...brief.lines.filter(([label]) => label !== "Keyword"),
  ];
  return {
    human: humanLines(lines),
    data: { ...brief.data, source },
    source,
  };
}
