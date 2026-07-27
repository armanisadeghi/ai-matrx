/**
 * Runtime scope builder for `matrx-user/marketing-site-keywords`
 * (`/marketing/brands/[brandId]/sites/[siteId]/keywords`,
 * `SiteKeywordPerformanceWorkspace`).
 *
 * Composes the inherited brand+site base (`useMarketingSiteSurfaceBase`) with
 * this workspace's own values. The visible rows are projected to the fields the
 * manifest declares — the canonical row projection shared with the agent-copy
 * payload (`projectKeywordPerformanceRow`) plus the row's page link and stored
 * date window.
 */

import { createMarketingSiteKeywordsScope } from "@/features/surfaces/manifests/marketing-site-keywords.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type { MarketingSiteBaseValues } from "@/features/marketing/lib/scopes/site-surface-base";
import { projectKeywordPerformanceRow } from "@/features/marketing/seo/keyword-research/format";
import type { SiteKeywordPerformanceRow } from "@/features/marketing/seo/keyword-research/types";

function projectRow(row: SiteKeywordPerformanceRow): Record<string, unknown> {
  return {
    ...projectKeywordPerformanceRow(row),
    top_page_id: row.top_page_id,
    first_date: row.first_date,
    last_date: row.last_date,
  };
}

export interface SiteKeywordsScopeInput {
  /** Inherited brand + site context, built by `useMarketingSiteSurfaceBase`. */
  base: MarketingSiteBaseValues;
  siteDomain: string;
  bingConnected: boolean;
  /** The table's live query state (search, sort, filters, page). */
  tableState: MatrxDataTableQueryState;
  /** Rows on the current table page. */
  rows: SiteKeywordPerformanceRow[];
  /** Exact count of rows matching the current filters. */
  total: number;
  /** True while the first page is still loading — total/rows are not yet real. */
  loading: boolean;
}

export function buildSiteKeywordsScope({
  base,
  siteDomain,
  bingConnected,
  tableState,
  rows,
  total,
  loading,
}: SiteKeywordsScopeInput): SurfaceScopePayload {
  return createMarketingSiteKeywordsScope({
    ...base,
    site_domain: siteDomain,
    bing_connected: bingConnected,
    table_query: tableState as unknown as Record<string, unknown>,
    visible_keyword_rows: rows.length ? rows.map(projectRow) : undefined,
    matching_queries_total: loading ? undefined : total,
  });
}
