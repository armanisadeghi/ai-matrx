"use client";

import { useCallback, useEffect, useState } from "react";
import { useResearchApi } from "./useResearchApi";
import type { TopicCostSummary } from "../types";

// ─── Module-scoped in-flight dedup + short cache ─────────────────────────────
//
// The research overview mounts several cost consumers at once
// (`PipelineOrchestra`, `LivePipelineActivity`, `CostMetricsCard`), each
// calling `useCostSummary(topicId)`. Without sharing, every overview load fired
// `GET /research/topics/{id}/costs` 2–3× in parallel — and that endpoint is a
// real server-side aggregation over rs_analysis/rs_synthesis/rs_document, not a
// cheap row read. Same shape as `useFileAsset`'s dedup: concurrent callers for
// one topicId share a single round-trip, and a resolved result is reused for a
// short window. The shared fetch is NOT tied to any one caller's AbortSignal —
// one consumer unmounting must not cancel the request the others are awaiting.
type ResearchApi = ReturnType<typeof useResearchApi>;

const COST_CACHE_TTL_MS = 15_000;
const costInflight = new Map<string, Promise<TopicCostSummary>>();
const costCache = new Map<string, { at: number; data: TopicCostSummary }>();

function mapCostJson(json: Record<string, unknown>): TopicCostSummary {
  return {
    total_llm_calls: Number(json.total_llm_calls ?? 0),
    total_input_tokens: Number(json.total_input_tokens ?? 0),
    total_output_tokens: Number(json.total_output_tokens ?? 0),
    total_estimated_cost_usd: Number(json.total_estimated_cost_usd ?? 0),
    page_analyses: json.page_analyses as TopicCostSummary["page_analyses"],
    keyword_syntheses:
      json.keyword_syntheses as TopicCostSummary["keyword_syntheses"],
    project_syntheses:
      json.project_syntheses as TopicCostSummary["project_syntheses"],
    tag_consolidations:
      json.tag_consolidations as TopicCostSummary["tag_consolidations"],
    document_assembly:
      json.document_assembly as TopicCostSummary["document_assembly"],
  };
}

async function fetchCostSummaryShared(
  api: ResearchApi,
  topicId: string,
  force: boolean,
): Promise<TopicCostSummary> {
  if (!force) {
    const cached = costCache.get(topicId);
    if (cached && Date.now() - cached.at < COST_CACHE_TTL_MS) return cached.data;
    const existing = costInflight.get(topicId);
    if (existing) return existing;
  }
  const promise = (async () => {
    const res = await api.getCosts(topicId);
    const json = (await res.json()) as Record<string, unknown>;
    const data = mapCostJson(json);
    costCache.set(topicId, { at: Date.now(), data });
    return data;
  })().finally(() => {
    // Delete only if THIS promise is still the registered in-flight one. A
    // force-refresh can overwrite the entry with a newer promise while we were
    // pending; an unconditional delete here would evict that newer entry and
    // break dedup for callers arriving in the gap.
    if (costInflight.get(topicId) === promise) costInflight.delete(topicId);
  });
  costInflight.set(topicId, promise);
  return promise;
}

/**
 * Authoritative per-topic cost summary, fetched from the Python API
 * (`GET /research/topics/{topicId}/costs`). The endpoint aggregates
 * `token_usage` JSONB blobs from `rs_analysis`, `rs_synthesis`, and
 * `rs_document` — Supabase's `rs_topic` row does NOT include this data,
 * which is why anything reading `topic.cost_summary` was always
 * undefined.
 *
 * The wire returns a slightly larger envelope than `TopicCostSummary`
 * (it also includes `topic_id` and a legacy nested `breakdown` object).
 * We pick only the fields declared on the typed model — extra keys are
 * ignored.
 *
 * Auto-fetches on mount and on `topicId` change. Call `refetch()` after
 * a pipeline run completes (or any other event that mints new analyses,
 * syntheses, or documents) to pick up fresh totals.
 */
export interface UseCostSummaryResult {
  data: TopicCostSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCostSummary(topicId: string): UseCostSummaryResult {
  const api = useResearchApi();
  const [data, setData] = useState<TopicCostSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCosts = useCallback(
    async (force: boolean, isMounted: () => boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchCostSummaryShared(api, topicId, force);
        if (!isMounted()) return;
        setData(result);
      } catch (err) {
        if (!isMounted()) return;
        setData(null);
        setError((err as Error).message ?? "Failed to load costs");
      } finally {
        if (isMounted()) setIsLoading(false);
      }
    },
    [api, topicId],
  );

  useEffect(() => {
    let mounted = true;
    void fetchCosts(false, () => mounted);
    return () => {
      mounted = false;
    };
  }, [fetchCosts]);

  const refetch = useCallback(async () => {
    // Force-refresh past the cache (e.g. after a pipeline run mints new totals).
    await fetchCosts(true, () => true);
  }, [fetchCosts]);

  return { data, isLoading, error, refetch };
}
