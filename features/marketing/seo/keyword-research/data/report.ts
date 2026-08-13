/**
 * The keyword-research REPORT data contract — pure, SSR-safe, shared by every
 * surface that renders a saved research artifact: the owner workbench feed, the
 * signed-in/grantee permalink, and the anonymous share-link lens.
 *
 * Metrics arrive as rows of the world-readable keyword plane (`seo.keyword` +
 * `seo.keyword_market`). Signed-in surfaces read them directly; the anonymous
 * lens gets exactly the shared artifact's phrases through
 * `public.share_token_keyword_metrics`. Both speak `KeywordReportRow`, which is
 * the SUBSET of the plane a report renders — `KeywordWithMarket` satisfies it,
 * so no caller has to widen or cast.
 */

import {
  KEYWORD_CLASSIFICATION_FACT_KEYS,
  type KeywordClassificationBatchData,
  type KeywordClassificationFactKey,
  type KeywordRelationshipResearchData,
} from "@/features/content-ir/kinds/keyword-research";
import { normalizeMonthlySearches } from "@/features/marketing/seo/keyword-research/types";
import type { MonthlySearchPoint } from "@/features/marketing/seo/keyword-research/types";
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";

export interface KeywordReportMarket {
  search_volume: number | null;
  competition: string | null;
  competition_index: number | null;
  cpc: number | null;
  monthly_searches: unknown;
  demand_trajectory: string | null;
}

export type KeywordReportRow = {
  id: string;
  phrase: string;
  normalized_phrase: string;
  classification_confidence: number | null;
  classifier_version: string | null;
  keyword_market: KeywordReportMarket[];
} & Partial<Record<KeywordClassificationFactKey, string | null>>;

/** The artifact as the canonical `keyword_relationship_research` kind data. */
export function buildResearchBlockData(
  artifact: KeywordResearchArtifact,
): KeywordRelationshipResearchData {
  return {
    primaryKeyword: artifact.primary_keyword,
    lists: (artifact.keyword_lists ?? []).map((list) => ({
      label: list.label,
      keywords: list.keywords ?? [],
      complete: true,
    })),
    isComplete: true,
  };
}

/**
 * Persisted classification rebuilt as the canonical
 * `keyword_classification_batch_v1` kind data. The 13 facts come from the real
 * `seo.keyword` columns — never parsed out of JSONB.
 */
export function buildClassificationBlockData(
  rows: readonly KeywordReportRow[],
): KeywordClassificationBatchData {
  return {
    classifierVersion:
      rows.find((row) => row.classifier_version)?.classifier_version ?? null,
    results: rows.map((row) => {
      const facts: Partial<Record<KeywordClassificationFactKey, string>> = {};
      for (const key of KEYWORD_CLASSIFICATION_FACT_KEYS) {
        const value = row[key];
        if (typeof value === "string" && value && value !== "none") {
          facts[key] = value;
        }
      }
      return {
        phrase: row.phrase,
        facts,
        overallConfidence: row.classification_confidence,
        secondaryInterpretation: null,
        error: null,
        complete: true,
      };
    }),
    isComplete: true,
  };
}

export interface KeywordReportMetricRow {
  id: string;
  phrase: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: string | null;
  competitionIndex: number | null;
  demandTrajectory: string | null;
  monthlySearches: MonthlySearchPoint[];
  intentClass: string | null;
}

/** Market rows flattened for the report table, strongest demand first. */
export function buildMetricRows(
  rows: readonly KeywordReportRow[],
): KeywordReportMetricRow[] {
  return rows
    .map((row) => {
      const market = row.keyword_market?.[0] ?? null;
      return {
        id: row.id,
        phrase: row.phrase,
        searchVolume: market?.search_volume ?? null,
        cpc: market?.cpc ?? null,
        competition: market?.competition ?? null,
        competitionIndex: market?.competition_index ?? null,
        demandTrajectory: market?.demand_trajectory ?? null,
        monthlySearches: normalizeMonthlySearches(market?.monthly_searches),
        intentClass: row.intent_class ?? null,
      } satisfies KeywordReportMetricRow;
    })
    .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
}

export interface KeywordReportSummary {
  keywordCount: number;
  clusterCount: number;
  measuredCount: number;
  totalMonthlySearches: number | null;
  topCpc: number | null;
}

export function summarizeKeywordReport(
  artifact: KeywordResearchArtifact,
  metricRows: readonly KeywordReportMetricRow[],
): KeywordReportSummary {
  const lists = artifact.keyword_lists ?? [];
  const keywordCount = new Set(
    lists.flatMap((list) => list.keywords ?? []).map((k) => k.toLowerCase()),
  ).size;
  const measured = metricRows.filter((row) => row.searchVolume !== null);
  const cpcs = metricRows
    .map((row) => row.cpc)
    .filter((cpc): cpc is number => typeof cpc === "number");
  return {
    keywordCount,
    clusterCount: lists.length,
    measuredCount: measured.length,
    totalMonthlySearches: measured.length
      ? measured.reduce((total, row) => total + (row.searchVolume ?? 0), 0)
      : null,
    topCpc: cpcs.length ? Math.max(...cpcs) : null,
  };
}
