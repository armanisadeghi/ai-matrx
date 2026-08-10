/**
 * Runtime scope builder for `matrx-user/keyword-research`
 * (`/marketing/keyword-research`, `KeywordResearchWorkbench`).
 *
 * Takes the workbench's LIVE state at trigger time and derives the declared
 * surface values. The explorer rows are projected down to the fields the
 * manifest promises (phrase + market evidence + intent), never the raw row.
 *
 * The in-flight stream is deliberately NOT emitted. Live agent output lives in
 * `activeRequests` under the adopted `run.requestId` and renders through the
 * canonical pipeline; the durable truth an agent should read is
 * `research_artifact` / `research_result`.
 */

import { createKeywordResearchScope } from "@/features/surfaces/manifests/keyword-research.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { ResearchRunState } from "@/features/marketing/seo/keyword-research/useKeywordResearch";
import type {
  KeywordMarketRow,
  KeywordWithMarket,
} from "@/features/marketing/seo/keyword-research/types";
import { US_LOCATION_CODE } from "@/features/marketing/seo/keyword-research/types";

/** Cap so a huge library can never blow the agent's context window. */
const MAX_VISIBLE_KEYWORDS = 100;

function marketFor(row: KeywordWithMarket): KeywordMarketRow | null {
  return (
    row.keyword_market.find(
      (market) => market.location_code === US_LOCATION_CODE,
    ) ??
    row.keyword_market[0] ??
    null
  );
}

function projectKeyword(row: KeywordWithMarket): Record<string, unknown> {
  const market = marketFor(row);
  return {
    keyword_id: row.id,
    phrase: row.phrase,
    intent_class: row.intent_class,
    search_volume: market?.search_volume ?? null,
    cpc: market?.cpc ?? null,
    competition: market?.competition ?? null,
    competition_index: market?.competition_index ?? null,
    demand_trajectory: market?.demand_trajectory ?? null,
  };
}

export interface KeywordResearchScopeInput {
  /** Explorer filter text exactly as typed. */
  search: string;
  /** Rows currently listed (already filtered + volume-sorted by the workbench). */
  visibleKeywords: KeywordWithMarket[];
  /** Active research-run state from `useKeywordResearch`. */
  run: ResearchRunState;
  /** Phrases of the active cluster scope, or null when showing the full library. */
  clusterPhrases: string[] | null;
  /** Name of the active cluster — what the explorer's cluster chip reads. */
  clusterPrimaryKeyword: string | null;
  /** Stage label of an in-flight volume refresh, when one is running. */
  volumeStage: string | null;
  /**
   * The launcher's input as it stands right now — typed but not run. Read
   * from the workbench's ref at trigger time (never state), so the table does
   * not re-render on every keystroke in a box above it.
   */
  stagedKeyword: string;
}

export function buildKeywordResearchScope({
  search,
  visibleKeywords,
  run,
  clusterPhrases,
  clusterPrimaryKeyword,
  volumeStage,
  stagedKeyword,
}: KeywordResearchScopeInput): SurfaceScopePayload {
  const artifact = run.result?.artifact;
  return createKeywordResearchScope({
    library_search: search,
    keywords_total: visibleKeywords.length,
    run_status: run.status,
    visible_keywords: visibleKeywords.length
      ? visibleKeywords.slice(0, MAX_VISIBLE_KEYWORDS).map(projectKeyword)
      : undefined,
    cluster_primary_keyword: clusterPhrases?.length
      ? (clusterPrimaryKeyword ?? undefined)
      : undefined,
    cluster_phrases: clusterPhrases?.length ? clusterPhrases : undefined,
    run_primary_keyword: run.primaryKeyword ?? undefined,
    research_input_keyword: stagedKeyword.trim() ? stagedKeyword : undefined,
    run_stage: run.stage ?? undefined,
    run_id: run.runId ?? undefined,
    research_artifact: artifact
      ? (artifact as unknown as Record<string, unknown>)
      : undefined,
    research_result: run.result
      ? (run.result as unknown as Record<string, unknown>)
      : undefined,
    run_error: run.error ?? undefined,
    volume_stage: volumeStage ?? undefined,
  });
}
