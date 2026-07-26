"use client";

/**
 * Canonical keyword primitive — React Query hooks + the volume-refresh
 * compute action. Query keys live under the shared `seoKeywordKeys` namespace
 * so every consumer (input, panel tabs, page cards) shares one cache.
 */

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import { listKeywordEdges, listKeywordsWithMarket } from "@/features/marketing/seo/keyword-research/data/queries";
import { extractErrorMessage } from "@/utils/errors";

import {
  listPageTopQueries,
  listSitePerformanceForKeyword,
  normalizeKeywordPhrase,
  resolveKeyword,
} from "./data";

export const seoKeywordKeys = {
  all: ["seo-keyword"] as const,
  resolve: (normalized: string) =>
    [...seoKeywordKeys.all, "resolve", normalized] as const,
  suggest: (normalized: string) =>
    [...seoKeywordKeys.all, "suggest", normalized] as const,
  edges: (keywordId: string) =>
    [...seoKeywordKeys.all, "edges", keywordId] as const,
  sitePerformance: (siteId: string, keywordId: string) =>
    [...seoKeywordKeys.all, "site-performance", siteId, keywordId] as const,
  pageQueries: (pageId: string) =>
    [...seoKeywordKeys.all, "page-queries", pageId] as const,
};

/** Resolve a (caller-debounced) phrase against the keyword plane. */
export function useResolvedKeyword(phrase: string | null | undefined) {
  const normalized = normalizeKeywordPhrase(phrase ?? "");
  return useQuery({
    queryKey: seoKeywordKeys.resolve(normalized),
    queryFn: ({ signal }) => resolveKeyword(normalized, signal),
    enabled: normalized.length > 0,
    staleTime: 60_000,
  });
}

/** Library matches for a (caller-debounced) prefix — feeds the input dropdown. */
export function useKeywordLibraryMatches(
  phrase: string | null | undefined,
  limit = 8,
) {
  const normalized = normalizeKeywordPhrase(phrase ?? "");
  return useQuery({
    queryKey: [...seoKeywordKeys.suggest(normalized), limit],
    queryFn: ({ signal }) =>
      listKeywordsWithMarket({ search: normalized, limit, signal }),
    enabled: normalized.length >= 2,
    staleTime: 60_000,
  });
}

/** All relationship edges touching a keyword, partner phrases included. */
export function useKeywordEdges(keywordId: string | null | undefined) {
  return useQuery({
    queryKey: seoKeywordKeys.edges(keywordId ?? ""),
    queryFn: ({ signal }) => listKeywordEdges(keywordId as string, signal),
    enabled: Boolean(keywordId),
  });
}

/** One site's organic performance + workflow state for one keyword. */
export function useKeywordSitePerformance(
  siteId: string | null | undefined,
  keywordId: string | null | undefined,
) {
  return useQuery({
    queryKey: seoKeywordKeys.sitePerformance(siteId ?? "", keywordId ?? ""),
    queryFn: ({ signal }) =>
      listSitePerformanceForKeyword(
        siteId as string,
        keywordId as string,
        signal,
      ),
    enabled: Boolean(siteId && keywordId),
  });
}

/** The real GSC queries already reaching one canonical page. */
export function usePageTopQueries(pageId: string | null | undefined) {
  return useQuery({
    queryKey: seoKeywordKeys.pageQueries(pageId ?? ""),
    queryFn: ({ signal }) => listPageTopQueries(pageId as string, 12, signal),
    enabled: Boolean(pageId),
    staleTime: 5 * 60_000,
  });
}

export interface VolumeRefreshState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  error?: string;
}

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data"
    ? (event.data as Record<string, unknown>)
    : null;
}

/**
 * Fetch (or force-refresh) provider market data for ONE phrase via the
 * canonical `POST /seo/keywords/volume-refresh` NDJSON command. The server
 * upserts the universal `seo.keyword` row when missing — this is the
 * sanctioned way an unknown phrase enters the library from the UI. On
 * completion every `seoKeywordKeys` cache is invalidated so chips, tabs, and
 * the workbench all see the new market data.
 */
export function useKeywordVolumeRefresh() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [state, setState] = useState<VolumeRefreshState>({ status: "idle" });

  const run = useCallback(
    async (phrase: string, forceRefresh = false) => {
      const trimmed = phrase.trim();
      if (!trimmed) return;
      setState({ status: "running", stage: "Connecting" });
      let sawResult = false;
      let streamError: string | null = null;
      const result = await dispatch(
        callApi({
          path: "/seo/keywords/volume-refresh",
          method: "POST",
          body: { phrases: [trimmed], force_refresh: forceRefresh },
          stream: true,
          onStreamEvent: (event) => {
            if (event.event === "error") {
              streamError = extractErrorMessage(event.data);
              return;
            }
            const data = streamData(event);
            const kind = typeof data?.kind === "string" ? data.kind : null;
            if (!kind) return;
            if (kind === "seo.volume_refresh_completed") {
              sawResult = true;
              return;
            }
            setState({ status: "running", stage: kind });
          },
        }),
      );
      // Terminal state, always — the exact class the rank-check fix killed.
      if (result.error || streamError || !sawResult) {
        setState({
          status: "error",
          error:
            result.error?.message ??
            streamError ??
            "The volume stream ended without a completed result.",
        });
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: seoKeywordKeys.all });
      setState({ status: "done" });
      return true;
    },
    [dispatch, queryClient],
  );

  return { state, run };
}
