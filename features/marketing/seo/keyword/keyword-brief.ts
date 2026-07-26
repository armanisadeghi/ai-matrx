/**
 * buildKeywordBrief — the CONDENSED keyword+data payload every downstream
 * consumer (Copy-for-AI envelopes, agent surface values, prompt assembly)
 * attaches whenever a keyword travels somewhere. Dense enough to be useful,
 * small enough never to overwhelm a human reader or an agent's context.
 */

import {
  formatCpc,
  formatSearchVolume,
  monthlySearchTrend,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import { normalizeMonthlySearches } from "@/features/marketing/seo/keyword-research/types";
import type {
  KeywordMarketRow,
  KeywordWithMarket,
  SiteKeywordPerformanceRow,
} from "@/features/marketing/seo/keyword-research/types";

export interface KeywordBrief {
  /** Machine payload — attach under a `keyword` / `target_keyword_data` key. */
  data: Record<string, unknown>;
  /** Human-readable lines for `webCopy({ lines })`-style envelopes. */
  lines: [string, string][];
}

/** Classification columns worth surfacing when set (subset of the 13). */
const CLASSIFICATION_FIELDS: [keyof KeywordWithMarket, string][] = [
  ["intent_class", "Intent"],
  ["funnel_stage", "Funnel stage"],
  ["specificity", "Specificity"],
  ["local_intent", "Local intent"],
  ["query_form", "Query form"],
  ["urgency", "Urgency"],
];

export function buildKeywordBrief(input: {
  phrase: string;
  keyword: KeywordWithMarket | null;
  market: KeywordMarketRow | null;
  sitePerformance?: SiteKeywordPerformanceRow[] | null;
}): KeywordBrief {
  const { phrase, keyword, market } = input;
  const sitePerf = input.sitePerformance ?? [];

  if (!keyword) {
    return {
      data: { phrase, known: false },
      lines: [
        ["Keyword", phrase],
        ["Keyword data", "not in the keyword library yet — no market data"],
      ],
    };
  }

  const monthly = normalizeMonthlySearches(market?.monthly_searches ?? null);
  const trend = monthlySearchTrend(monthly);

  const data: Record<string, unknown> = {
    phrase: keyword.phrase,
    known: true,
    keyword_id: keyword.id,
    language: keyword.language,
    search_volume: market?.search_volume ?? null,
    cpc: market?.cpc ?? null,
    competition: market?.competition ?? null,
    competition_index: market?.competition_index ?? null,
    trend_pct_recent_3mo: trend,
    demand_trajectory: market?.demand_trajectory ?? null,
    metrics_fetched_at: market?.metrics_fetched_at ?? null,
  };
  for (const [field] of CLASSIFICATION_FIELDS) {
    const value = keyword[field];
    if (typeof value === "string" && value) data[field] = value;
  }

  const lines: [string, string][] = [["Keyword", keyword.phrase]];
  if (market) {
    lines.push([
      "Keyword market (US)",
      `${formatSearchVolume(market.search_volume)} searches/mo · CPC ${formatCpc(market.cpc)} · competition ${market.competition ?? "—"}${
        trend === null ? "" : ` · trend ${trend > 0 ? "+" : ""}${trend.toFixed(0)}%`
      }`,
    ]);
  } else {
    lines.push(["Keyword market", "no market data fetched yet"]);
  }
  const classification = CLASSIFICATION_FIELDS.flatMap(([field, label]) => {
    const value = keyword[field];
    return typeof value === "string" && value ? [`${label}: ${value}`] : [];
  });
  if (classification.length > 0) {
    lines.push(["Keyword classification", classification.join(" · ")]);
  }

  if (sitePerf.length > 0) {
    const best = [...sitePerf].sort(
      (a, b) => (b.clicks ?? 0) - (a.clicks ?? 0),
    )[0];
    data.site_performance = sitePerf.map((row) => ({
      provider: row.provider,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      average_position: row.average_position,
      top_page_url: row.top_page_url,
      workflow_status: row.workflow_status,
      priority_score: row.priority_score,
    }));
    lines.push([
      "Site search performance",
      `${best.clicks ?? 0} clicks · ${best.impressions ?? 0} impressions · avg position ${
        best.average_position === null || best.average_position === undefined
          ? "—"
          : Number(best.average_position).toFixed(1)
      }${best.top_page_url ? ` · strongest page ${best.top_page_url}` : ""}`,
    ]);
  }

  return { data, lines };
}
