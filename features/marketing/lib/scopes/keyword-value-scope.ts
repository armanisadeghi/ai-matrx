/**
 * Runtime scope builder for `matrx-user/keyword-value-workbench`
 * (`/marketing/brands/[brandId]/sites/[siteId]/value`, `ValueWorkbench`).
 *
 * Composes the inherited brand+site base (`useMarketingSiteSurfaceBase`) with
 * the worth screen's own vocabulary: the rows on screen, the LEVELS this site
 * uses, the window under review and the filters in play. Everything is
 * projected to exactly what the manifest declares — an agent launched from a
 * keyword row here sees the same words the person is looking at.
 *
 * Loading is emitted as ABSENCE, never as a zero: a `total` of 0 while the
 * first page is still in flight would tell an agent the site has no keywords.
 */

import { createKeywordValueWorkbenchScope } from "@/features/surfaces/manifests/keyword-value-workbench.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type { MarketingSiteBaseValues } from "@/features/marketing/lib/scopes/site-surface-base";
import type { ValueReviewRow } from "@/features/marketing/seo/value-system/types";
import type { MeaningHealthRow } from "@/features/marketing/seo/value-system/data";
import type {
  BandMeta,
  ValueKpis,
  ValueWindow,
  Verdict,
} from "@/features/marketing/seo/value-system/lib";

/** The row as the table shows it — the receipt lines stay out (they are long). */
function projectRow(row: ValueReviewRow): Record<string, unknown> {
  return {
    keyword_id: row.keyword_id,
    keyword: row.keyword,
    value_band: row.value_band,
    value_score: row.value_score,
    value_source: row.value_source,
    traffic_class: row.traffic_class,
    clicks: row.clicks,
    impressions: row.impressions,
  };
}

function projectLevel(meta: BandMeta): Record<string, unknown> {
  return {
    slug: meta.value,
    label: meta.label,
    description: meta.description,
    reserved: meta.reserved,
    min_score: meta.minScore,
  };
}

export interface KeywordValueScopeInput {
  /** Inherited brand + site context, built by `useMarketingSiteSurfaceBase`. */
  base: MarketingSiteBaseValues;
  /** The table's live query state (search, sort, filters, page). */
  tableState: MatrxDataTableQueryState;
  /** Rows on the current table page. */
  rows: ValueReviewRow[];
  /** Exact count of keywords matching the current filters. */
  total: number;
  /** True while the review read has not returned yet — total/rows are not real. */
  loading: boolean;
  /** Keyword ids ticked for a batch ruling (empty array is the normal state). */
  selectedIds: string[];
  /** The site's level vocabulary; empty while it loads. */
  levels: BandMeta[];
  /** True when the site is still reading the platform's template levels. */
  levelsAreTemplate: boolean;
  /** The window every click/impression here covers, plus the comparison range. */
  window: ValueWindow;
  kpis: ValueKpis | null;
  verdict: Verdict | null;
  meaningHealth: MeaningHealthRow[] | undefined;
  /** All-time count of levels a person pinned on this site. */
  rulingCount: number | undefined;
  activeLevelFilter: string | null;
  activeSourceFilter: string | null;
}

export function buildKeywordValueScope({
  base,
  tableState,
  rows,
  total,
  loading,
  selectedIds,
  levels,
  levelsAreTemplate,
  window,
  kpis,
  verdict,
  meaningHealth,
  rulingCount,
  activeLevelFilter,
  activeSourceFilter,
}: KeywordValueScopeInput): SurfaceScopePayload {
  return createKeywordValueWorkbenchScope({
    ...base,
    selected_keyword_ids: selectedIds,
    table_query: tableState as unknown as Record<string, unknown>,
    review_window: { ...window },
    visible_value_rows: rows.length ? rows.map(projectRow) : undefined,
    matching_keywords_total: loading ? undefined : total,
    level_vocabulary: levels.length ? levels.map(projectLevel) : undefined,
    levels_are_template: levels.length ? levelsAreTemplate : undefined,
    value_kpis: kpis ? (kpis as unknown as Record<string, unknown>) : undefined,
    site_verdict: verdict
      ? (verdict as unknown as Record<string, unknown>)
      : undefined,
    meaning_health: meaningHealth?.length
      ? (meaningHealth as unknown as Array<Record<string, unknown>>)
      : undefined,
    expert_ruling_count: rulingCount,
    active_level_filter: activeLevelFilter ?? undefined,
    active_source_filter: activeSourceFilter ?? undefined,
  });
}
