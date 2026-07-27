/**
 * Shared human-readable formatters for backlink data — consumed by every
 * Copy button on the backlinks workspace (metric cards, dimension lists,
 * table rows, page snapshot). One summary per shape; never duplicate these
 * at a callsite.
 */

import type {
  BacklinkDimensionRow,
  BacklinkObservationRow,
  BacklinkSnapshotRow,
  BacklinkTrendPoint,
} from "@/features/marketing/data/backlinks-types";

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en").format(value);
}

export function humanBacklinkRow(row: BacklinkObservationRow): string {
  const follow = row.is_dofollow ? "dofollow" : "nofollow";
  const anchor = row.anchor_text ? ` anchor "${row.anchor_text}"` : "";
  const rank =
    row.domain_rank === null || row.domain_rank === undefined
      ? ""
      : ` (domain rank ${row.domain_rank})`;
  const lastSeen = row.last_seen_at
    ? ` — last seen ${row.last_seen_at.slice(0, 10)}`
    : "";
  return `${row.source_domain ?? row.source_url}${rank}: ${row.state} ${follow} link${anchor}\n  ${row.source_url}\n  → ${row.target_url}${lastSeen}`;
}

export function humanDimensionRow(row: BacklinkDimensionRow): string {
  const label = row.label ?? row.dimension_key;
  const backlinks =
    row.backlinks === null || row.backlinks === undefined
      ? ""
      : `${formatCount(row.backlinks)} backlinks`;
  const domains =
    row.referring_domains === null || row.referring_domains === undefined
      ? ""
      : `${formatCount(row.referring_domains)} referring domains`;
  const counts = [backlinks, domains].filter(Boolean).join(", ");
  return counts ? `${label} — ${counts}` : label;
}

export function humanDimensionList(
  title: string,
  rows: BacklinkDimensionRow[],
): string {
  if (!rows.length) return `${title}: no stored rows yet.`;
  return [
    `${title} (${rows.length} stored):`,
    ...rows.map((row) => `- ${humanDimensionRow(row)}`),
  ].join("\n");
}

export function humanMetric(
  label: string,
  value: number | null | undefined,
  siteDomain: string,
  detail?: string,
): string {
  const rendered =
    value === null || value === undefined ? (detail ?? "—") : formatCount(value);
  return `${label}: ${rendered} (${siteDomain})`;
}

export function humanSummarySnapshot(
  summary: BacklinkSnapshotRow | undefined,
  siteDomain: string,
): string {
  if (!summary) return `No backlink summary snapshot stored for ${siteDomain}.`;
  return [
    `Backlink summary for ${siteDomain} (collected ${summary.created_at?.slice(0, 10) ?? "unknown"}):`,
    `- Backlinks: ${formatCount(summary.total_backlinks)}`,
    `- Referring domains: ${formatCount(summary.referring_domains)}`,
    `- Dofollow: ${formatCount(summary.dofollow_backlinks)}`,
    `- Nofollow: ${formatCount(summary.nofollow_backlinks)}`,
    `- Rank score: ${formatCount(summary.rank_score)}`,
  ].join("\n");
}

export function humanTrend(points: BacklinkTrendPoint[]): string {
  if (!points.length) return "No backlink trend points stored yet.";
  const first = points[0];
  const last = points[points.length - 1];
  const totalNew = points.reduce((n, p) => n + (p.new_backlinks ?? 0), 0);
  const totalLost = points.reduce((n, p) => n + (p.lost_backlinks ?? 0), 0);
  return [
    `Backlink trend: ${points.length} periods, ${first.observed_at.slice(0, 10)} → ${last.observed_at.slice(0, 10)}.`,
    `- New: ${formatCount(totalNew)} · Lost: ${formatCount(totalLost)} · Net: ${formatCount(totalNew - totalLost)}`,
    last.total_backlinks !== null
      ? `- Latest totals: ${formatCount(last.total_backlinks)} backlinks, ${formatCount(last.referring_domains)} referring domains`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Compact projection of an observation row for agent payloads at scale. */
export function projectBacklinkRow(row: BacklinkObservationRow) {
  return {
    source_domain: row.source_domain,
    source_url: row.source_url,
    target_url: row.target_url,
    anchor_text: row.anchor_text,
    state: row.state,
    is_dofollow: row.is_dofollow,
    domain_rank: row.domain_rank,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
  };
}

/** Compact projection of a dimension row for agent payloads. */
export function projectDimensionRow(row: BacklinkDimensionRow) {
  return {
    label: row.label ?? row.dimension_key,
    backlinks: row.backlinks,
    referring_domains: row.referring_domains,
  };
}
