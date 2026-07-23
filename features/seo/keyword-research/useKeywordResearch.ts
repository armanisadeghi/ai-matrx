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

import { listKeywordEdges, listKeywordsWithMarket } from "./data/queries";
import type {
  KeywordEdgeView,
  KeywordResearchResponse,
  KeywordWithMarket,
} from "./types";

export interface ResearchRunState {
  status: "idle" | "running" | "done" | "error";
  primaryKeyword?: string;
  result?: KeywordResearchResponse;
  error?: string;
}

export function useKeywordResearch() {
  const dispatch = useAppDispatch();
  const [keywords, setKeywords] = useState<KeywordWithMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [run, setRun] = useState<ResearchRunState>({ status: "idle" });
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
      setRun({ status: "running", primaryKeyword: phrase });
      const result = await dispatch(
        callApi({
          path: "/seo/keywords/research",
          method: "POST",
          body: { primary_keyword: phrase },
          // Synchronous compute pipeline (agent → ingest → volume → classify)
          // that legitimately runs tens of seconds; Cloudflare cuts at 100s.
          connectTimeoutMs: 100_000,
          totalTimeoutMs: 110_000,
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
      const data = result.data as KeywordResearchResponse;
      setRun({ status: "done", primaryKeyword: phrase, result: data });
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
      const result = await dispatch(
        callApi({
          path: "/seo/keywords/volume-refresh",
          method: "POST",
          body: { phrases, force_refresh: forceRefresh },
          // Synchronous provider fetch (DataForSEO) — can exceed 15s.
          connectTimeoutMs: 100_000,
          totalTimeoutMs: 110_000,
        }),
      );
      if (result.error) throw new Error(result.error.message);
      void reload(search);
      return result.data;
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
    runResearch,
    refreshVolume,
    loadEdges,
  };
}
