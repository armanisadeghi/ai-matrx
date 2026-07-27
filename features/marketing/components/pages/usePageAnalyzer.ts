"use client";

/**
 * State + action for the Page Analyzer (WS-11 / M-53): streams
 * POST /seo/pages/analyze — a durable command that runs the registered Page
 * Analyzer system agent against this canonical page's stored content, GSC
 * queries, and site context, then persists seo.site_keyword_value rows +
 * page<->keyword associations server-side. This hook only renders the
 * streamed result; it never re-derives the analysis client-side.
 */

import { useCallback, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";

const PAGE_ANALYZE_PATH = "/seo/pages/analyze";

export interface PageAnalysisKeywordRef {
  phrase: string;
  evidence?: string | null;
  confidence?: number | null;
}

export interface PageAnalysisArtifact {
  analyzer_version: string;
  page_url: string;
  inferred_primary_keyword: PageAnalysisKeywordRef;
  supported_keywords: PageAnalysisKeywordRef[];
  discovered_keywords: PageAnalysisKeywordRef[];
  declared_vs_actual: {
    status: string;
    declared_keyword: string | null;
    notes?: string | null;
  };
  content_role: string;
  funnel_position: string;
  cannibalization_risk: { sibling_url: string; shared_query: string; why: string }[];
  gaps: { gap: string; severity: string }[];
}

export interface PageAnalysisResult {
  page_id: string;
  site_id: string;
  analyzer_version: string;
  artifact: PageAnalysisArtifact;
  summary: {
    primary_keyword_id: string | null;
    supporting_keyword_ids: string[];
    discovered_keyword_ids: string[];
    content_role: string | null;
    funnel_position: string | null;
  };
}

export interface PageAnalyzerState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  result?: PageAnalysisResult;
  error?: string;
  runId?: string;
}

const STAGE_LABELS: Record<string, string> = {
  "seo.analyze_page_started": "Starting page analysis",
  "seo.analyze_page_inputs_gathered": "Gathering page content, GSC queries, site context",
  "seo.analyze_page_agent_completed": "Analyzer agent completed",
  "seo.analyze_page_persisted": "Persisting keyword picture",
};

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data" ? (event.data as Record<string, unknown>) : null;
}

export function usePageAnalyzer(pageId: string, organizationId: string) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<PageAnalyzerState>({ status: "idle" });

  const run = useCallback(
    async (forceRefresh: boolean) => {
      setState({ status: "running", stage: "Connecting" });
      let completed: PageAnalysisResult | undefined;
      const result = await dispatch(
        callApi({
          path: PAGE_ANALYZE_PATH,
          method: "POST",
          body: { page_id: pageId, force_refresh: forceRefresh },
          // The page's owning site is the entity-local authority. Never let a
          // different active org (or the personal-org fallback) scope this run.
          scopeOverrides: { organization_id: organizationId },
          stream: true,
          onStreamEvent: (event) => {
            const data = streamData(event);
            if (!data) return;
            const kind = typeof data.kind === "string" ? data.kind : null;
            if (!kind) return;
            if (kind === "seo.command_run" && typeof data.run_id === "string") {
              setState((current) => ({ ...current, runId: data.run_id as string }));
            }
            if (kind === "seo.analyze_page_completed") {
              const analysisResult = data.result as PageAnalysisResult | undefined;
              if (analysisResult) {
                completed = analysisResult;
                setState((current) => ({
                  ...current,
                  status: "done",
                  stage: "Analysis complete",
                  result: analysisResult,
                }));
              }
              return;
            }
            setState((current) => ({ ...current, stage: STAGE_LABELS[kind] ?? kind }));
          },
        }),
      );
      if (result.error) {
        setState((current) => ({
          ...current,
          status: "error",
          error: result.error?.message,
        }));
        return;
      }
      if (!completed) {
        setState((current) => ({
          ...current,
          status: "error",
          error: "The analysis stream ended without a completed result.",
        }));
      }
    },
    [dispatch, organizationId, pageId],
  );

  return { state, run };
}
