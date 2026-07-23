"use client";

/**
 * State + actions for the keyword research workbench.
 *
 * Reads are Supabase-direct (universal keyword plane). Compute goes to the
 * Python brain via callApi: POST /seo/keywords/research (agent → artifact →
 * ingestion → volume) and POST /seo/keywords/volume-refresh (provider fetch
 * for stale/missing market rows).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";

import { listKeywordEdges, listKeywordsWithMarket } from "./data/queries";
import type {
  KeywordEdgeView,
  KeywordResearchResponse,
  KeywordWithMarket,
} from "./types";

export interface ResearchRunState {
  status: "idle" | "running" | "done" | "error";
  primaryKeyword?: string;
  stage?: string;
  streamingOutput?: string;
  result?: KeywordResearchResponse;
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  "seo.research_started": "Starting keyword research",
  "seo.research_agent_completed": "Research agent completed",
  "seo.research_artifact_persisted": "Research artifact persisted",
  "seo.research_relationships_persisted": "Keyword relationships persisted",
  "seo.volume_refresh_started": "Planning keyword-volume refresh",
  "seo.volume_refresh_planned": "Checking stored market freshness",
  "seo.volume_run_claimed": "Provider run claimed",
  "seo.volume_provider_request_started": "Requesting DataForSEO market data",
  "seo.volume_provider_task_checkpoint": "DataForSEO task checkpoint persisted",
  "seo.volume_provider_task_checkpoints": "DataForSEO task checkpoints persisted",
  "seo.volume_provider_response": "DataForSEO response received",
  "seo.volume_raw_persisted": "Raw provider response persisted",
  "seo.volume_normalized": "Provider response normalized",
  "seo.volume_observations_persisted": "Keyword market observations persisted",
  "seo.volume_batch_completed": "Keyword-volume batch completed",
  "seo.volume_refresh_completed": "Keyword volume complete",
  "seo.classification_started": "Classifying keyword intent",
  "seo.classification_completed": "Keyword classification persisted",
  "seo.research_completed": "Research complete",
};

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data"
    ? (event.data as Record<string, unknown>)
    : null;
}

function resultFromEvent(
  event: TypedStreamEvent,
  expectedKind: string,
): Record<string, unknown> | null {
  const data = streamData(event);
  if (data?.kind !== expectedKind) return null;
  const result = data.result;
  return result && typeof result === "object"
    ? (result as Record<string, unknown>)
    : null;
}

export function useKeywordResearch() {
  const dispatch = useAppDispatch();
  const [keywords, setKeywords] = useState<KeywordWithMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [run, setRun] = useState<ResearchRunState>({ status: "idle" });
  const [volumeStage, setVolumeStage] = useState<string | null>(null);
  // The phrases of the last research run — when set, the explorer scopes to
  // this cluster instead of the whole universal library.
  const [clusterPhrases, setClusterPhrases] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async (searchValue: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listKeywordsWithMarket({
        search: searchValue,
        signal: controller.signal,
      });
      setKeywords(rows);
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void reload(search), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, reload]);

  const runResearch = useCallback(
    async (primaryKeyword: string) => {
      const phrase = primaryKeyword.trim();
      if (!phrase) return;
      const completedResults: KeywordResearchResponse[] = [];
      setRun({
        status: "running",
        primaryKeyword: phrase,
        stage: "Connecting",
        streamingOutput: "",
      });
      const result = await dispatch(
        callApi({
          path: "/seo/keywords/research",
          method: "POST",
          body: { primary_keyword: phrase },
          stream: true,
          onStreamEvent: (event) => {
            if (event.event === "chunk") {
              setRun((current) => ({
                ...current,
                streamingOutput: `${current.streamingOutput ?? ""}${event.data.text}`,
              }));
              return;
            }
            const data = streamData(event);
            const kind = typeof data?.kind === "string" ? data.kind : null;
            if (kind) {
              setRun((current) => ({
                ...current,
                stage: STAGE_LABELS[kind] ?? kind,
              }));
            }
            const final = resultFromEvent(event, "seo.research_completed");
            if (final) {
              const completedResult = final as unknown as KeywordResearchResponse;
              completedResults.push(completedResult);
              setRun((current) => ({
                ...current,
                status: "done",
                stage: "Research complete",
                result: completedResult,
              }));
            }
          },
        }),
      );
      if (result.error) {
        setRun({
          status: "error",
          primaryKeyword: phrase,
          error: result.error.message,
        });
        return;
      }
      const completedResult = completedResults.at(-1);
      if (!completedResult) {
        setRun({
          status: "error",
          primaryKeyword: phrase,
          error: "The research stream ended without a completed result.",
        });
        return;
      }
      const data = completedResult;
      const artifact = data.artifact as {
        primary_keyword?: string;
        keyword_lists?: { keywords?: string[] }[];
      };
      const phrases = [
        artifact.primary_keyword ?? phrase,
        ...(artifact.keyword_lists ?? []).flatMap((list) => list.keywords ?? []),
      ]
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean);
      setClusterPhrases(Array.from(new Set(phrases)));
      void reload(search);
    },
    [dispatch, reload, search],
  );

  const refreshVolume = useCallback(
    async (phrases: string[], forceRefresh: boolean) => {
      const completedResults: Record<string, unknown>[] = [];
      setVolumeStage("Connecting");
      const result = await dispatch(
        callApi({
          path: "/seo/keywords/volume-refresh",
          method: "POST",
          body: { phrases, force_refresh: forceRefresh },
          stream: true,
          onStreamEvent: (event) => {
            const data = streamData(event);
            const kind = typeof data?.kind === "string" ? data.kind : null;
            if (kind) setVolumeStage(STAGE_LABELS[kind] ?? kind);
            const final = resultFromEvent(event, "seo.volume_refresh_completed");
            if (final) completedResults.push(final);
          },
        }),
      );
      if (result.error) {
        setVolumeStage(null);
        throw new Error(result.error.message);
      }
      const completedResult = completedResults.at(-1);
      if (!completedResult) {
        setVolumeStage(null);
        throw new Error("The volume stream ended without a completed result.");
      }
      void reload(search);
      setVolumeStage(null);
      return completedResult;
    },
    [dispatch, reload, search],
  );

  const loadEdges = useCallback(
    (keywordId: string): Promise<KeywordEdgeView[]> => listKeywordEdges(keywordId),
    [],
  );

  const clearCluster = useCallback(() => setClusterPhrases(null), []);

  return {
    clusterPhrases,
    clearCluster,
    keywords,
    loading,
    loadError,
    search,
    setSearch,
    run,
    volumeStage,
    runResearch,
    refreshVolume,
    loadEdges,
  };
}
