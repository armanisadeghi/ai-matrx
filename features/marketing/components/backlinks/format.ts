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
import {
  parseDimensionExtras,
  parseObservationExtras,
} from "@/features/marketing/components/backlinks/lib/extras";
import {
  parseBacklinkAssessment,
  providerExtras,
} from "@/features/marketing/components/backlinks/lib/enrichment";

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
  const extras = parseObservationExtras(providerExtras(row.provider_evidence));
  const assessment = parseBacklinkAssessment(row.resolved_assessment);
  const facts = [
    extras.semanticLocation ? `placement ${extras.semanticLocation}` : "",
    row.spam_score !== null && row.spam_score !== undefined
      ? `spam ${row.spam_score}`
      : "",
    extras.isBroken ? "BROKEN target" : "",
  ].filter(Boolean);
  const factLine = facts.length ? `\n  ${facts.join(" · ")}` : "";
  const verdictLine = assessment.action
    ? `\n  Our score ${assessment.overallScore ?? "—"} · relevance ${assessment.relevanceVerdict ?? "unknown"} · action ${assessment.action}`
    : "\n  The page this link sits on has not been reviewed yet";
  return `${row.source_domain ?? row.source_url}${rank}: ${row.state} ${follow} link${anchor}\n  ${row.source_url}\n  → ${row.target_url}${lastSeen}${factLine}${verdictLine}`;
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
  if (!rows.length) return `${title}: nothing collected yet.`;
  return [
    `${title} (${rows.length}):`,
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
    value === null || value === undefined
      ? (detail ?? "—")
      : formatCount(value);
  return `${label}: ${rendered} (${siteDomain})`;
}

export function humanSummarySnapshot(
  summary: BacklinkSnapshotRow | undefined,
  siteDomain: string,
): string {
  if (!summary) return `We have not checked ${siteDomain}'s links yet.`;
  return [
    // `observed_at` is WHEN the check happened; `created_at` is when we wrote
    // the row. The KPI strip's "Last checked" reads observed_at, so this must
    // too — the same phrase must never name two different days.
    `Backlinks for ${siteDomain} (last checked ${summary.observed_at.slice(0, 10)}):`,
    `- Backlinks: ${formatCount(summary.total_backlinks)}`,
    `- Referring domains: ${formatCount(summary.referring_domains)}`,
    `- Pass SEO credit (dofollow): ${formatCount(summary.dofollow_backlinks)}`,
    `- Do not pass credit (nofollow): ${formatCount(summary.nofollow_backlinks)}`,
    `- Site authority (0–1000): ${formatCount(summary.rank_score)}`,
  ].join("\n");
}

export function humanTrend(points: BacklinkTrendPoint[]): string {
  if (!points.length) return "No history of links gained and lost yet.";
  const first = points[0];
  const last = points[points.length - 1];
  const totalNew = points.reduce((n, p) => n + (p.new_backlinks ?? 0), 0);
  const totalLost = points.reduce((n, p) => n + (p.lost_backlinks ?? 0), 0);
  return [
    `Links gained and lost over ${points.length} periods, ${first.observed_at.slice(0, 10)} → ${last.observed_at.slice(0, 10)}.`,
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
  const extras = parseObservationExtras(providerExtras(row.provider_evidence));
  const assessment = parseBacklinkAssessment(row.resolved_assessment);
  return {
    source_domain: row.source_domain,
    source_url: row.source_url,
    target_url: row.target_url,
    anchor_text: row.anchor_text,
    state: row.state,
    link_type: row.link_type,
    is_dofollow: row.is_dofollow,
    attributes: extras.attributes,
    placement: extras.semanticLocation,
    source_rank: row.source_rank,
    domain_rank: row.domain_rank,
    spam_score: row.spam_score,
    is_broken: extras.isBroken,
    target_status_code: extras.urlToStatusCode,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    lost_at: row.lost_at,
    enrichment_status: row.enrichment_status,
    our_score: assessment.overallScore,
    page_type: assessment.pageType,
    relevance: assessment.relevanceVerdict,
    relevance_score: assessment.relevanceScore,
    controllability: assessment.controlLevel,
    recommended_action: assessment.action,
    priority: assessment.priority,
    risk: assessment.riskVerdict,
  };
}

/** Compact projection of a dimension row for agent payloads. */
export function projectDimensionRow(row: BacklinkDimensionRow) {
  const extras = parseDimensionExtras(row.extras);
  return {
    label: row.label ?? row.dimension_key,
    url: row.url,
    backlinks: row.backlinks,
    referring_domains: row.referring_domains,
    referring_pages: extras.referringPages,
    broken_backlinks: extras.brokenBacklinks,
    intersections: extras.intersections,
    status_code: extras.statusCode,
    rank_score: row.rank_score,
    spam_score: row.spam_score,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
  };
}
