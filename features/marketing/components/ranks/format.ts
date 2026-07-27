/**
 * Shared human-readable formatters for the rank tracking workspace —
 * consumed by every Copy button on the page (portfolio rows, history points,
 * SERP landscape rows, whole-view copy). One summary per shape; never
 * duplicate these at a callsite.
 */

import type {
  RankPortfolioItem,
  RankTargetHistoryPoint,
  SerpLandscapeResult,
} from "@/features/marketing/components/ranks/types";

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en").format(value);
}

export function humanRankPortfolioItem(item: RankPortfolioItem): string {
  const position =
    item.latest_position === null
      ? "not ranked / never checked"
      : `#${item.latest_position}`;
  const movement =
    item.movement === null
      ? ""
      : item.movement === 0
        ? " (no change)"
        : item.movement > 0
          ? ` (up ${item.movement})`
          : ` (down ${Math.abs(item.movement)})`;
  const best =
    item.best_position === null ? "" : ` · best #${item.best_position}`;
  const lastChecked = item.last_checked_at
    ? ` · last checked ${item.last_checked_at.slice(0, 10)}`
    : "";
  return [
    `"${item.keyword}" — ${item.provider} (${item.search_type}${item.location_name ? `, ${item.location_name}` : ""})`,
    `- Position: ${position}${movement}${best}${lastChecked}`,
    `- Group: ${item.group ?? "—"} · Active: ${item.is_active ? "yes" : "no"} · Cadence: every ${item.cadence_days}d`,
  ].join("\n");
}

export function humanRankPortfolio(items: RankPortfolioItem[]): string {
  if (!items.length) return "No keywords tracked yet.";
  return [
    `Rank portfolio (${items.length} tracked):`,
    ...items.map((item) => `- ${humanRankPortfolioItem(item)}`),
  ].join("\n");
}

/** Compact projection of a portfolio item for agent payloads at scale. */
export function projectRankPortfolioItem(item: RankPortfolioItem) {
  return {
    keyword: item.keyword,
    provider: item.provider,
    search_type: item.search_type,
    location_name: item.location_name,
    latest_position: item.latest_position,
    movement: item.movement,
    best_position: item.best_position,
    group: item.group,
    is_active: item.is_active,
    last_checked_at: item.last_checked_at,
  };
}

export function humanHistoryPoint(point: RankTargetHistoryPoint): string {
  const rank =
    point.organic_rank === null ? "not ranked" : `#${point.organic_rank}`;
  return `${point.observed_at.slice(0, 10)}: ${rank}${point.matched_url ? ` — ${point.matched_url}` : ""}`;
}

export function humanHistory(points: RankTargetHistoryPoint[]): string {
  if (!points.length) return "No observations yet.";
  return [
    `Position history (${points.length} observations):`,
    ...points.map((point) => `- ${humanHistoryPoint(point)}`),
  ].join("\n");
}

export function humanLandscapeResult(result: SerpLandscapeResult): string {
  return `#${result.absolute_rank} ${result.domain ?? "—"} — ${result.title ?? result.url ?? "—"}`;
}

export function humanLandscape(
  results: SerpLandscapeResult[],
  observedAt: string | null,
): string {
  if (!results.length) return "No SERP landscape captured yet.";
  return [
    `Competitive SERP landscape${observedAt ? ` (${observedAt.slice(0, 10)})` : ""} — ${results.length} results:`,
    ...results.map((result) => `- ${humanLandscapeResult(result)}`),
  ].join("\n");
}
