"use client";

/**
 * State + action for the Page Analyzer (WS-11 / M-53): streams
 * POST /seo/pages/analyze — a durable command that runs the registered Page
 * Analyzer system agent against this canonical page's stored content, GSC
 * queries, and site context, then persists seo.site_keyword_value rows +
 * page<->keyword associations server-side. This hook only renders the
 * streamed result; it never re-derives the analysis client-side.
 *
 * DURABLE (2026-08-17): the analysis is a `seo.collection_run` claimed before
 * the agent call, and the stream detaches on disconnect — so navigating away no
 * longer loses it. `useSeoCommandRun` remembers the run id and rejoins it on
 * load; this hook is the page's typed face over that primitive.
 */

import { useCallback } from "react";

import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";

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

export function usePageAnalyzer(pageId: string, organizationId: string) {
  const command = useSeoCommandRun<PageAnalysisResult>({
    // Per PAGE: rejoining on one page must never attach to another's analysis.
    key: `page-analyzer:${pageId}`,
    path: "/seo/pages/analyze",
    finalKind: "seo.analyze_page_completed",
    stageLabels: STAGE_LABELS,
    parseResult: (raw) =>
      raw && typeof raw === "object" ? (raw as PageAnalysisResult) : null,
    // The page's owning site is the entity-local authority. Never let a
    // different active org (or the personal-org fallback) scope this run.
    scopeOverrides: { organization_id: organizationId },
  });

  const run = useCallback(
    async (forceRefresh: boolean) => {
      await command.launch({ page_id: pageId, force_refresh: forceRefresh });
    },
    [command, pageId],
  );

  const state: PageAnalyzerState = {
    // "rejoining" is a running analysis this tab did not start — the card's
    // own copy says so; every other consumer treats it as running.
    status: command.status === "rejoining" ? "running" : command.status,
    ...(command.stage ? { stage: command.stage } : {}),
    ...(command.result ? { result: command.result } : {}),
    ...(command.error ? { error: command.error } : {}),
    ...(command.runId ? { runId: command.runId } : {}),
  };

  return { state, run, rejoining: command.status === "rejoining" };
}
