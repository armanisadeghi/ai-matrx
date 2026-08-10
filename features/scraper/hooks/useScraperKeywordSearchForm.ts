"use client";

import { useState, useCallback, useMemo } from "react";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import type { SearchResultItem } from "@/features/scraper/types/scraper-api";
import { RESULT_LIMIT_DEFAULT } from "@/features/scraper/scrape-command";

export interface UseScraperKeywordSearchFormReturn {
  keywords: string;
  setKeywords: (v: string) => void;
  maxResults: string;
  setMaxResults: (v: string) => void;
  flatResults: SearchResultItem[];
  selectedHitIndex: number | null;
  setSelectedHitIndex: (i: number | null) => void;
  handleSearch: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleClear: () => void;
  isLoading: boolean;
  hasError: boolean;
  error: string | null;
  errorDiagnostics: ReturnType<typeof useScraperApi>["errorDiagnostics"];
  statusMessage: string | null;
  reset: () => void;
  /** Clear API state, selection, and keyword inputs (floating workspace full reset). */
  resetAll: () => void;
}

export function useScraperKeywordSearchForm(): UseScraperKeywordSearchFormReturn {
  const [keywords, setKeywords] = useState("");
  const [maxResults, setMaxResults] = useState(String(RESULT_LIMIT_DEFAULT));
  const [selectedHitIndex, setSelectedHitIndex] = useState<number | null>(null);

  const {
    search,
    searchResults,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    statusMessage,
    reset,
  } = useScraperApi();

  const flatResults: SearchResultItem[] = useMemo(
    () => searchResults.flatMap((sr) => sr.results || []),
    [searchResults],
  );

  const handleSearch = useCallback(async () => {
    if (!keywords.trim()) return;
    reset();
    setSelectedHitIndex(null);
    const items = await search({
      keywords: [keywords.trim()],
      total_results_per_keyword: parseInt(maxResults, 10) || RESULT_LIMIT_DEFAULT,
    });
    if (items && items.length > 0) setSelectedHitIndex(0);
  }, [keywords, maxResults, search, reset]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !isLoading) void handleSearch();
    },
    [isLoading, handleSearch],
  );

  const handleClear = useCallback(() => {
    reset();
    setSelectedHitIndex(null);
  }, [reset]);

  const resetAll = useCallback(() => {
    reset();
    setKeywords("");
    setMaxResults(String(RESULT_LIMIT_DEFAULT));
    setSelectedHitIndex(null);
  }, [reset]);

  return {
    keywords,
    setKeywords,
    maxResults,
    setMaxResults,
    flatResults,
    selectedHitIndex,
    setSelectedHitIndex,
    handleSearch,
    handleKeyDown,
    handleClear,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    statusMessage,
    reset,
    resetAll,
  };
}
