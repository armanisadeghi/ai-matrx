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
      setRun({
        status: "done",
        primaryKeyword: phrase,
        result: result.data as KeywordResearchResponse,
      });
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

  return {
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
