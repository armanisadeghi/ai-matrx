/**
 * Plain activity categories for the person-facing cost report. A vendor's name is "our business,
 * not the user's" (Arman, 2026-10-09): people see SEO data / Web search / AI / Social data, and
 * only platform admins see the vendor breakdown. Pure; the one place a provider id becomes words.
 */

import type { SeoProviderSpendRow } from "./spend";

const CATEGORY_BY_PROVIDER: Record<string, string> = {
  dataforseo: "SEO data",
  brave: "Web search",
  serpapi: "Web search",
  aidream: "AI",
  gsc: "Search performance",
  scrapecreators: "Social data",
};

export const SOCIAL_CATEGORY = "Social data";
const FALLBACK_CATEGORY = "Other data";

export function spendCategory(provider: string): string {
  return CATEGORY_BY_PROVIDER[provider.trim().toLowerCase()] ?? FALLBACK_CATEGORY;
}

export interface SpendCategoryRow {
  category: string;
  /** Measured USD (converted to points at display time by the cost formatter). */
  usd: number;
  /** Paid calls / runs that make up the figure. */
  runs: number;
  /** The largest share of any member's monthly limit, 0-100. */
  pctUsed: number;
  /** Runs nobody priced; real spend that cannot be measured (never shown as zero). */
  unpricedRuns: number;
}

/** Group provider rows (and the social line) into categories, largest first. Pure. */
export function groupSpendByCategory(
  rows: readonly SeoProviderSpendRow[],
  social?: { usd: number | null; calls: number | null } | null,
): SpendCategoryRow[] {
  const byCategory = new Map<string, SpendCategoryRow>();
  const bucket = (category: string): SpendCategoryRow => {
    let held = byCategory.get(category);
    if (!held) {
      held = { category, usd: 0, runs: 0, pctUsed: 0, unpricedRuns: 0 };
      byCategory.set(category, held);
    }
    return held;
  };
  for (const row of rows) {
    const held = bucket(spendCategory(row.provider));
    held.usd += row.effective_cost;
    held.runs += row.run_count;
    held.unpricedRuns += row.unpriced_runs;
    held.pctUsed = Math.max(held.pctUsed, row.pct_used);
  }
  if (social && social.usd != null && (social.usd > 0 || (social.calls ?? 0) > 0)) {
    const held = bucket(SOCIAL_CATEGORY);
    held.usd += social.usd;
    held.runs += social.calls ?? 0;
  }
  return [...byCategory.values()]
    .filter((row) => row.usd > 0 || row.runs > 0)
    .sort((a, b) => b.usd - a.usd);
}
