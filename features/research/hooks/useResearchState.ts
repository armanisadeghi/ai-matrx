"use client";

import { useState, useEffect, useCallback } from "react";
import * as service from "../service";
import type {
  ResearchTopic,
  ResearchKeyword,
  ResearchSource,
  ResearchContent,
  ResearchAnalysis,
  ResearchSynthesis,
  ResearchTag,
  SourceTag,
  ResearchDocument,
  ResearchMedia,
  ResearchTemplate,
  SourceFilters,
} from "../types";
import type { SourceImportance } from "../ranking";
import type { CurationData } from "../service";

// ============================================================================
// Generic fetch hook
// ============================================================================

interface UseQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

function useServiceQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  enabled = true,
): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Loading is DERIVED (`settledKey !== fetchKey`), never set synchronously
  // inside the effect — the react-hooks lint forbids the setState cascade the
  // old `setIsLoading(true)`-on-run pattern caused. Stale data stays visible
  // while a refetch is in flight, exactly as before.
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const fetchKey = JSON.stringify([refreshKey, ...deps]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setSettledKey(fetchKey);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setSettledKey(fetchKey);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, fetchKey]);

  return {
    data,
    isLoading: enabled && settledKey !== fetchKey,
    error,
    refresh,
  };
}

// ============================================================================
// Topic hooks
// ============================================================================

// Project filtering is ASSOCIATION-BACKED (research-project decoupling):
// the service reads `research_topic → project` edges then does one batched
// RLS-visible topic read. Signatures unchanged to limit blast radius.
export function useTopicsForProject(projectId: string | undefined) {
  return useServiceQuery<ResearchTopic[]>(
    () => {
      if (!projectId) return Promise.resolve([]);
      return service.getTopicsForProject(projectId);
    },
    [projectId],
    !!projectId,
  );
}

export function useTopicsForProjects(projectIds: string[]) {
  const key = projectIds.join(",");
  return useServiceQuery<ResearchTopic[]>(
    () => service.getTopicsForProjects(projectIds),
    [key],
    projectIds.length > 0,
  );
}

/**
 * topicId → projectId from the canonical association edges, one batched read.
 * This is how list surfaces label a topic's project now that
 * `rs_topic.project_id` is dead — never read a column for this.
 */
export function useTopicProjectLinks(topicIds: string[]) {
  const key = topicIds.join(",");
  return useServiceQuery<Record<string, string>>(
    () => service.getTopicProjectLinks(topicIds),
    [key],
    topicIds.length > 0,
  );
}

/**
 * Fetch ALL topics the caller can read. No hierarchy narrowing — RLS is the
 * only filter. Used by `TopicList` when no specific filter is selected so
 * that "All" really means "All".
 */
export function useAllTopics(enabled = true) {
  return useServiceQuery<ResearchTopic[]>(
    () => service.getAllTopics(),
    [],
    enabled,
  );
}

export function useTopic(topicId: string | undefined) {
  return useServiceQuery<ResearchTopic | null>(
    () => {
      if (!topicId) return Promise.resolve(null);
      return service.getTopic(topicId);
    },
    [topicId],
    !!topicId,
  );
}

// ============================================================================
// Keyword hooks
// ============================================================================

export function useResearchKeywords(topicId: string) {
  return useServiceQuery<ResearchKeyword[]>(
    () => service.getKeywords(topicId),
    [topicId],
    !!topicId,
  );
}

// ============================================================================
// Source hooks
// ============================================================================

export function useResearchSource(sourceId: string | undefined) {
  return useServiceQuery<ResearchSource | null>(
    () => {
      if (!sourceId) return Promise.resolve(null);
      return service.getSource(sourceId);
    },
    [sourceId],
    !!sourceId,
  );
}

export function useResearchSources(
  topicId: string,
  filters?: Partial<SourceFilters>,
) {
  const filterKey = filters ? JSON.stringify(filters) : "all";
  return useServiceQuery<ResearchSource[]>(
    () => service.getSources(topicId, filters),
    [topicId, filterKey],
    !!topicId,
  );
}

// ============================================================================
// Content hooks
// ============================================================================

export function useSourceContent(sourceId: string) {
  return useServiceQuery<ResearchContent[]>(
    () => service.getSourceContent(sourceId),
    [sourceId],
    !!sourceId,
  );
}

// ============================================================================
// Analysis hooks
// ============================================================================

export function useSourceAnalysis(contentId: string | undefined) {
  return useServiceQuery<ResearchAnalysis[]>(
    () => {
      if (!contentId) return Promise.resolve([]);
      return service.getSourceAnalysis(contentId);
    },
    [contentId],
    !!contentId,
  );
}

export function useAnalysisForSource(sourceId: string | undefined) {
  return useServiceQuery<ResearchAnalysis[]>(
    () => {
      if (!sourceId) return Promise.resolve([]);
      return service.getAnalysisForSource(sourceId);
    },
    [sourceId],
    !!sourceId,
  );
}

export function useAnalysesForTopic(topicId: string) {
  return useServiceQuery<ResearchAnalysis[]>(
    () => service.getAnalysesForTopic(topicId),
    [topicId],
    !!topicId,
  );
}

// ============================================================================
// Synthesis hooks
// ============================================================================

export function useResearchSynthesis(
  topicId: string,
  params?: { scope?: string; keyword_id?: string },
) {
  const paramsKey = params ? JSON.stringify(params) : "all";
  return useServiceQuery<ResearchSynthesis[]>(
    () => service.getSynthesis(topicId, params),
    [topicId, paramsKey],
    !!topicId,
  );
}

// ============================================================================
// Tag hooks
// ============================================================================

export function useResearchTags(topicId: string) {
  return useServiceQuery<ResearchTag[]>(
    () => service.getTags(topicId),
    [topicId],
    !!topicId,
  );
}

/** All source⇄tag assignments for a topic, keyed by source_id — powers the
 *  Sources list tag chips + per-row picker without one query per row. */
export function useTopicSourceTags(topicId: string) {
  return useServiceQuery<Record<string, { id: string; name: string }[]>>(
    () => service.getTopicSourceTags(topicId),
    [topicId],
    !!topicId,
  );
}

export function useSourceTags(sourceId: string | undefined) {
  return useServiceQuery<SourceTag[]>(
    () => {
      if (!sourceId) return Promise.resolve([]);
      return service.getSourceTags(sourceId);
    },
    [sourceId],
    !!sourceId,
  );
}

export function useSourceImportance(topicId: string) {
  return useServiceQuery<Map<string, SourceImportance>>(
    () => service.getSourceImportance(topicId),
    [topicId],
    !!topicId,
  );
}

export function useCurationData(topicId: string) {
  return useServiceQuery<CurationData>(
    () => service.getCurationData(topicId),
    [topicId],
    !!topicId,
  );
}

// ============================================================================
// Document hooks
// ============================================================================

export function useResearchDocument(topicId: string) {
  return useServiceQuery<ResearchDocument | null>(
    () => service.getDocument(topicId),
    [topicId],
    !!topicId,
  );
}

/** Newest SUCCESSFUL report — the AI-grounding read (see service note). */
export function useLatestSuccessfulResearchDocument(topicId: string) {
  return useServiceQuery<ResearchDocument | null>(
    () => service.getLatestSuccessfulDocument(topicId),
    [topicId],
    !!topicId,
  );
}

export function useDocumentVersions(topicId: string) {
  return useServiceQuery<ResearchDocument[]>(
    () => service.getDocumentVersions(topicId),
    [topicId],
    !!topicId,
  );
}

// ============================================================================
// Media hooks
// ============================================================================

export function useResearchMedia(topicId: string) {
  return useServiceQuery<ResearchMedia[]>(
    () => service.getMedia(topicId),
    [topicId],
    !!topicId,
  );
}

// ============================================================================
// Template hooks
// ============================================================================

export function useResearchTemplates() {
  return useServiceQuery<ResearchTemplate[]>(() => service.getTemplates(), []);
}
