/**
 * Shared human-readable formatters for the site keyword performance
 * workspace — consumed by every Copy button on the page (the "matching
 * queries" stat, table rows, whole-view copy). One summary per shape; never
 * duplicate these at a callsite.
 */

import type { SiteKeywordPerformanceRow } from "./types";

const PROVIDER_LABELS: Record<string, string> = {
  gsc: "Google Search Console",
  bing_webmaster: "Bing Webmaster",
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
    `- Workflow: ${row.workflow_status ?? "not classified"}`,
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
