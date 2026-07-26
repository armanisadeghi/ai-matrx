"use client";

/**
 * KeywordDataChips — the condensed inline data row that rides WITH a keyword
 * wherever it renders (under the canonical KeywordInput, in the intelligence
 * window header, on future keyword chips). Composes the shared KeywordMetrics
 * atoms — never a private sparkline or volume format.
 */

import { BarChart3, MousePointerClick } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatCpc,
  formatSearchVolume,
  KeywordCompetitionBadge,
  KeywordTrendBadge,
  KeywordTrendSparkline,
  monthlySearchTrend,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import { normalizeMonthlySearches } from "@/features/marketing/seo/keyword-research/types";
import type {
  KeywordMarketRow,
  SiteKeywordPerformanceRow,
} from "@/features/marketing/seo/keyword-research/types";

export function KeywordDataChips({
  market,
  sitePerformance,
  showSparkline = true,
  className,
}: {
  market: KeywordMarketRow | null;
  /** Optional site-scoped evidence — adds the "your site" position chip. */
  sitePerformance?: SiteKeywordPerformanceRow[] | null;
  showSparkline?: boolean;
  className?: string;
}) {
  const monthly = normalizeMonthlySearches(market?.monthly_searches ?? null);
  const trend = monthlySearchTrend(monthly);
  const bestPerf = (sitePerformance ?? [])
    .filter((row) => row.average_position !== null)
    .sort((a, b) => (a.average_position ?? 99) - (b.average_position ?? 99))[0];

  if (!market && !bestPerf) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]",
        className,
      )}
    >
      {market ? (
        <>
          <span
            className="inline-flex items-center gap-1 text-foreground"
            title="Monthly search volume"
          >
            <BarChart3 className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium tabular-nums">
              {formatSearchVolume(market.search_volume)}
            </span>
            <span className="text-muted-foreground">/mo</span>
          </span>
          <KeywordTrendBadge percent={trend} />
          <KeywordCompetitionBadge
            competition={market.competition}
            competitionIndex={market.competition_index}
            className="text-[11px]"
          />
          <span className="text-muted-foreground" title="Cost per click">
            {formatCpc(market.cpc)} CPC
          </span>
          {showSparkline && monthly.length >= 2 ? (
            <KeywordTrendSparkline points={monthly} className="h-4" />
          ) : null}
        </>
      ) : null}
      {bestPerf ? (
        <span
          className="inline-flex items-center gap-1 text-foreground"
          title="Your site's average Google position for this query (stored Search Console window)"
        >
          <MousePointerClick className="h-3 w-3 text-muted-foreground" />
          <span className="tabular-nums">
            pos {Number(bestPerf.average_position).toFixed(1)}
          </span>
          <span className="text-muted-foreground tabular-nums">
            · {bestPerf.clicks ?? 0} clicks
          </span>
        </span>
      ) : null}
    </div>
  );
}
