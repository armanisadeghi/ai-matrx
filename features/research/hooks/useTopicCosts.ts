"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getTopicCostLedger } from "../service";
import { buildTopicCostLedger, type TopicCostLedger } from "../costs";
import type { TopicCostSummary } from "../types";

/**
 * The authoritative per-topic cost ledger — every AI call, its tokens, its
 * model, and its price — plus the phase rollups and the `TopicCostSummary`
 * totals that the overview surfaces consume.
 *
 * Reads `research.rs_analysis` / `rs_synthesis` / `rs_document` DIRECT from
 * Supabase (RLS-filtered) and derives everything client-side. It replaced the
 * aidream `GET /research/topics/{id}/costs` round-trip: same rows, one less
 * network tier, and per-call detail the aggregate endpoint could not return.
 *
 * ── Module-scoped in-flight dedup + short cache ──────────────────────────────
 * The research overview mounts three cost consumers at once (PipelineOrchestra,
 * LivePipelineActivity, CostMetricsCard). Without sharing, every overview load
 * fired the ledger read 3× in parallel. Concurrent callers for one topicId
 * share a single round-trip and a resolved result is reused for a short window.
 * The shared fetch is deliberately NOT tied to any one caller's lifetime — one
 * consumer unmounting must not cancel the request the others are awaiting.
 */

const LEDGER_CACHE_TTL_MS = 15_000;
const inflight = new Map<string, Promise<TopicCostLedger>>();
const cache = new Map<string, { at: number; data: TopicCostLedger }>();

async function fetchLedgerShared(
  topicId: string,
  force: boolean,
): Promise<TopicCostLedger> {
  if (!force) {
    const cached = cache.get(topicId);
    if (cached && Date.now() - cached.at < LEDGER_CACHE_TTL_MS) {
      return cached.data;
    }
    const existing = inflight.get(topicId);
    if (existing) return existing;
  }

  const promise = (async () => {
    const raw = await getTopicCostLedger(topicId);
    const ledger = buildTopicCostLedger(raw);
    cache.set(topicId, { at: Date.now(), data: ledger });
    return ledger;
  })().finally(() => {
    // Delete only if THIS promise is still the registered in-flight one. A
    // force-refresh can overwrite the entry with a newer promise while we were
    // pending; an unconditional delete would evict that newer entry and break
    // dedup for callers arriving in the gap.
    if (inflight.get(topicId) === promise) inflight.delete(topicId);
  });

  inflight.set(topicId, promise);
  return promise;
}

/** Drop the cached ledger for a topic so the next read hits Supabase. */
export function invalidateTopicCosts(topicId: string): void {
  cache.delete(topicId);
}

export interface UseTopicCostsResult {
  ledger: TopicCostLedger | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTopicCosts(topicId: string): UseTopicCostsResult {
  const [ledger, setLedger] = useState<TopicCostLedger | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force: boolean, isMounted: () => boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchLedgerShared(topicId, force);
        if (!isMounted()) return;
        setLedger(result);
      } catch (err) {
        if (!isMounted()) return;
        setLedger(null);
        setError(
          err instanceof Error ? err.message : "Failed to load costs",
        );
      } finally {
        if (isMounted()) setIsLoading(false);
      }
    },
    [topicId],
  );

  useEffect(() => {
    if (!topicId) {
      setIsLoading(false);
      return undefined;
    }
    let mounted = true;
    void load(false, () => mounted);
    return () => {
      mounted = false;
    };
  }, [load, topicId]);

  const refetch = useCallback(async () => {
    // Force past the cache — called after a pipeline run mints new calls.
    await load(true, () => true);
  }, [load]);

  return { ledger, isLoading, error, refetch };
}

export interface UseCostSummaryResult {
  data: TopicCostSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Totals-only view of the ledger, in the exact `TopicCostSummary` shape the
 * backend used to return. Kept so the overview surfaces (PipelineOrchestra,
 * LastRunSummary, LivePipelineActivity) consume costs through one hook without
 * knowing where the numbers come from.
 */
export function useCostSummary(topicId: string): UseCostSummaryResult {
  const { ledger, isLoading, error, refetch } = useTopicCosts(topicId);
  const data = useMemo(() => ledger?.summary ?? null, [ledger]);
  return { data, isLoading, error, refetch };
}
