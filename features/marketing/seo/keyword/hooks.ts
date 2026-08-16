"use client";

/**
 * Canonical keyword primitive — React Query hooks + the volume-refresh
 * compute action. Query keys live under the shared `seoKeywordKeys` namespace
 * so every consumer (input, panel tabs, page cards) shares one cache.
 */

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import {
  useOpenLiveRunWindow,
  type LiveRunWindowHandle,
} from "@/features/overlays/openers/liveRunWindow";
import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import {
  listKeywordEdges,
  listKeywordsWithMarket,
} from "@/features/marketing/seo/keyword-research/data/queries";
import { extractErrorMessage } from "@/utils/errors";
import { isJsonObject } from "@/types/json";

import {
  getPageSearchTotals,
  listPageQueryStats,
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
  pageSearchTotals: (pageId: string, days: number | null) =>
    [
      ...seoKeywordKeys.all,
      "page-search-totals",
      pageId,
      days ?? "all",
    ] as const,
  pageQueryStats: (pageId: string, days: number | null) =>
    [...seoKeywordKeys.all, "page-query-stats", pageId, days ?? "all"] as const,
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

/** Range totals (clicks/impressions/CTR/position) for one page. */
export function usePageSearchTotals(
  pageId: string | null | undefined,
  days: number | null,
) {
  return useQuery({
    queryKey: seoKeywordKeys.pageSearchTotals(pageId ?? "", days),
    queryFn: ({ signal }) =>
      getPageSearchTotals(pageId as string, days, signal),
    enabled: Boolean(pageId),
    staleTime: 5 * 60_000,
  });
}

/** Complete range-aware per-query breakdown for one page; the raw fact read
 * remains bounded and carries a loud truncation flag. */
export function usePageQueryStats(
  pageId: string | null | undefined,
  days: number | null,
) {
  return useQuery({
    queryKey: seoKeywordKeys.pageQueryStats(pageId ?? "", days),
    queryFn: ({ signal }) => listPageQueryStats(pageId as string, days, signal),
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
 * Fetch (or force-refresh) provider market data for one phrase — or a batch
 * of them — via the canonical `POST /seo/keywords/volume-refresh` NDJSON
 * command. The server upserts the universal `seo.keyword` row when missing —
 * this is the sanctioned way an unknown phrase enters the library from the
 * UI. On completion every `seoKeywordKeys` cache is invalidated so chips,
 * tabs, and the workbench all see the new market data.
 */
export function useKeywordVolumeRefresh(organizationId?: string | null) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [state, setState] = useState<VolumeRefreshState>({ status: "idle" });

  const run = useCallback(
    async (phrase: string | string[], forceRefresh = false) => {
      const phrases = (Array.isArray(phrase) ? phrase : [phrase])
        .map((value) => value.trim())
        .filter(Boolean);
      if (!phrases.length) return;
      setState({ status: "running", stage: "Connecting" });
      let sawResult = false;
      let streamError: string | null = null;
      const result = await dispatch(
        callApi({
          path: "/seo/keywords/volume-refresh",
          method: "POST",
          body: { phrases, force_refresh: forceRefresh },
          scopeOverrides: organizationId
            ? { organization_id: organizationId }
            : undefined,
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
    [dispatch, organizationId, queryClient],
  );

  return { state, run };
}

export interface SerpIntentAnalysisState {
  status: "idle" | "running" | "done" | "error";
  error?: string;
}

/**
 * Deliberate, paid AI enhancement over two ALREADY-STORED SERP snapshots.
 * The endpoint performs no provider search. Its token stream is adopted into
 * the canonical execution system and shown in the floating LiveRunWindow,
 * where `keyword_serp_intent_analysis_v1` uses its ONE Shape component.
 */
export function useKeywordSerpIntentAnalysis() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const openLiveRunWindow = useOpenLiveRunWindow();
  const requestIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveWindowRef = useRef<LiveRunWindowHandle | null>(null);
  const [state, setState] = useState<SerpIntentAnalysisState>({
    status: "idle",
  });

  async function run({
    keywordId,
    phrase,
    googleTargetId,
    braveTargetId,
  }: {
    keywordId: string;
    phrase: string;
    googleTargetId: string;
    braveTargetId: string;
  }) {
    abortRef.current?.abort();
    if (requestIdRef.current) {
      dispatch(removeRequest(requestIdRef.current));
      requestIdRef.current = null;
    }
    const abortController = new AbortController();
    abortRef.current = abortController;
    setState({ status: "running" });
    liveWindowRef.current = openLiveRunWindow({
      instanceId: `keyword-serp-intent:${keywordId}`,
      label: `Enhancing intent · ${phrase}`,
      pending: true,
    });
    let completed = false;
    let streamedError: string | null = null;
    const consumeStream = dispatch(
      adoptForeignStream({
        abortController,
        onAdopted: ({ requestId }) => {
          requestIdRef.current = requestId;
          liveWindowRef.current?.update({ requestId, pending: false });
        },
        onEvent: (event) => {
          if (event.event === "error") {
            streamedError = extractErrorMessage(event.data);
            return;
          }
          if (event.event !== "data" || !isJsonObject(event.data)) return;
          const data = event.data;
          if (data.kind === "seo.keyword_serp_intent_completed") {
            completed = true;
          }
        },
      }),
    );
    const response = await dispatch(
      callApi({
        path: "/seo/keywords/{keyword_id}/serp-intent-analysis",
        method: "POST",
        pathParams: { keyword_id: keywordId },
        body: {
          google_target_id: googleTargetId,
          brave_target_id: braveTargetId,
        },
        stream: true,
        consumeStream,
        signal: abortController.signal,
      }),
    );
    if (abortController.signal.aborted) return false;
    const error = response.error?.message ?? streamedError;
    if (error || !completed) {
      const message =
        error ?? "The analysis ended before the saved result arrived.";
      setState({ status: "error", error: message });
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: seoKeywordKeys.all });
    setState({ status: "done" });
    return true;
  }

  return { state, run };
}
