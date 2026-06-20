"use client";

import { useMemo } from "react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { RESEARCH_ENDPOINTS } from "../service/research-endpoints";
import type {
  TopicCreate,
  KeywordCreate,
  ContentEditRequest,
  ContentPasteRequest,
  AnalyzeRequest,
  AnalyzeBulkRequest,
  AuthorityRankRequest,
  AutoTagPassRequest,
  AutoConsolidatePassRequest,
  GenerateTagsRequest,
  ApplyTagsRequest,
  ApplyTagsResponse,
  TagInputExportResponse,
  SynthesisRequest,
  SuggestRequest,
  AddLinksToScope,
  ExtensionContentSubmit,
  VerdictRequest,
} from "../types";

/**
 * Bundles every research-domain endpoint over the memoized `useBackendApi`
 * surface. The whole returned object is wrapped in `useMemo` keyed on `api`
 * so it is reference-stable across renders — consumers can safely depend on
 * the `api` reference inside `useEffect` / `useCallback` without re-firing
 * every render. Without this memo, hooks like `useCostSummary` (which
 * include `api` in their effect deps) would loop indefinitely and hammer the
 * backend.
 */
export function useResearchApi() {
  const api = useBackendApi();

  return useMemo(() => {
    const endpoints = (topicId: string) => RESEARCH_ENDPOINTS.topic(topicId);

    return {
      ...api,

      // --- Suggest (top-level, no topic needed) ---
      suggest: (body: SuggestRequest) =>
        api.post(RESEARCH_ENDPOINTS.suggest, body),

      // --- Topic CRUD (project-scoped) ---
      createTopic: (projectId: string, body: TopicCreate) =>
        api.post(RESEARCH_ENDPOINTS.projects.createTopic(projectId), body),

      // --- Topic State (computed progress from Python) ---
      getTopicState: (topicId: string, signal?: AbortSignal) =>
        api.get(endpoints(topicId).state, signal),

      // --- Pipeline ---
      runPipeline: (topicId: string, signal?: AbortSignal) =>
        api.post(endpoints(topicId).run, {}, signal),

      triggerSearch: (topicId: string, signal?: AbortSignal) =>
        api.post(endpoints(topicId).search, {}, signal),

      triggerScrape: (topicId: string, signal?: AbortSignal) =>
        api.post(endpoints(topicId).scrape, {}, signal),

      analyzeAll: (
        topicId: string,
        body?: AnalyzeBulkRequest,
        signal?: AbortSignal,
      ) =>
        api.post(
          endpoints(topicId).analyzeAll,
          body ?? { agent_type: "page_summary" },
          signal,
        ),

      synthesize: (
        topicId: string,
        body: SynthesisRequest,
        signal?: AbortSignal,
      ) => api.post(endpoints(topicId).synthesize, body, signal),

      // --- Source authority ranking (chunks ≤50 → Source Authority Ranker) ---
      rankSourceAuthority: (
        topicId: string,
        body?: AuthorityRankRequest,
        signal?: AbortSignal,
      ) => api.post(endpoints(topicId).rankAuthority, body ?? {}, signal),

      // --- Auto-tag pass (standalone "Run now" — same pass as the /run orchestrator) ---
      autoTag: (
        topicId: string,
        body?: AutoTagPassRequest,
        signal?: AbortSignal,
      ) => api.post(endpoints(topicId).autoTag, body ?? {}, signal),

      // --- Auto-consolidate pass (standalone "Run now" — same pass as /run) ---
      autoConsolidate: (
        topicId: string,
        body?: AutoConsolidatePassRequest,
        signal?: AbortSignal,
      ) => api.post(endpoints(topicId).autoConsolidate, body ?? {}, signal),

      // --- Cross-cutting tags ---

      /**
       * Discover cross-cutting tag dimensions across the topic's keywords +
       * search results. STREAMING — returns the raw Response; feed it to
       * `useResearchStream` and watch for `tag_suggestions_complete`. Also
       * persists the result to `rs_topic.tag_suggestions`.
       */
      generateTagSuggestions: (
        topicId: string,
        body?: GenerateTagsRequest,
        signal?: AbortSignal,
      ) =>
        api.post(
          endpoints(topicId).generateTagSuggestions,
          body ?? {},
          signal,
        ),

      /**
       * Create real `rs_tag` rows from the suggestions the user picked, and
       * assign matching sources. Plain POST → parsed JSON receipt.
       */
      applyTagSuggestions: async (
        topicId: string,
        body: ApplyTagsRequest,
      ): Promise<ApplyTagsResponse> => {
        const res = await api.post(
          endpoints(topicId).applyTagSuggestions,
          body,
        );
        return (await res.json()) as ApplyTagsResponse;
      },

      /**
       * Fetch the exact agent input (keyword list + search-results blob) so the
       * user can run the Cross-Cutting Tag Generator agent manually. GET → JSON.
       */
      getTagInputExport: async (
        topicId: string,
        signal?: AbortSignal,
      ): Promise<TagInputExportResponse> => {
        const res = await api.get(
          endpoints(topicId).tagInputExport,
          signal,
        );
        return (await res.json()) as TagInputExportResponse;
      },

      // --- Keywords (Python for validation + project_id resolution) ---
      addKeywords: (topicId: string, body: KeywordCreate) =>
        api.post(endpoints(topicId).keywords.add, body),

      // --- Source Actions ---

      scrapeSource: (topicId: string, sourceId: string) =>
        api.post(endpoints(topicId).sources.rescrape(sourceId), {}),

      analyzeSource: (
        topicId: string,
        sourceId: string,
        body?: AnalyzeRequest,
      ) =>
        api.post(
          endpoints(topicId).sources.analyze(sourceId),
          body ?? { agent_type: "page_summary" },
        ),

      transcribeSource: (topicId: string, sourceId: string) =>
        api.post(endpoints(topicId).sources.transcribe(sourceId), {}),

      uploadFile: (topicId: string, formData: FormData) =>
        api.upload(endpoints(topicId).sources.upload, formData),

      // --- Content (Python for versioning + hashing) ---
      editContent: (
        topicId: string,
        contentId: string,
        body: ContentEditRequest,
      ) =>
        api.fetch(endpoints(topicId).content.edit(contentId), {
          method: "PATCH",
          body: JSON.stringify(body),
        }),

      pasteContent: (
        topicId: string,
        sourceId: string,
        body: ContentPasteRequest,
      ) => api.post(endpoints(topicId).content.paste(sourceId), body),

      // --- Tags (Python for LLM actions) ---
      suggestTags: (topicId: string, sourceId: string) =>
        api.post(endpoints(topicId).sources.suggestTags(sourceId), {}),

      consolidateTag: (topicId: string, tagId: string) =>
        api.post(endpoints(topicId).tags.consolidate(tagId), {}),

      // --- Document (Python for LLM generation) ---
      generateDocument: (topicId: string) =>
        api.post(endpoints(topicId).document.generate, {}),

      // --- Links (Python for aggregation + business logic) ---
      getLinks: (topicId: string, signal?: AbortSignal) =>
        api.get(endpoints(topicId).links, signal),

      addLinksToScope: (topicId: string, body: AddLinksToScope) =>
        api.post(endpoints(topicId).linksAddToScope, body),

      // --- Analysis Retry ---
      retryAnalysis: (topicId: string, analysisId: string) =>
        api.post(endpoints(topicId).analyses.retry(analysisId), {}),

      retryFailedAnalyses: (topicId: string) =>
        api.post(endpoints(topicId).analyses.retryFailed, {}),

      // --- Costs (Python for multi-table aggregation) ---
      getCosts: (topicId: string, signal?: AbortSignal) =>
        api.get(endpoints(topicId).costs, signal),

      // --- Templates (Python) ---
      getTemplates: (signal?: AbortSignal) =>
        api.get(RESEARCH_ENDPOINTS.templates.list, signal),

      // --- Extension capture ladder ---

      /** Fetch the user's queue, bucketed by next capture level. */
      getExtensionScrapeQueue: (signal?: AbortSignal) =>
        api.get(RESEARCH_ENDPOINTS.extension.scrapeQueue, signal),

      /**
       * Submit captured HTML for a source at a specific tier of the capture ladder.
       * Levels 1-3 only — Level 4 (manual paste) goes through `pasteContent`.
       */
      submitExtensionContent: (
        topicId: string,
        sourceId: string,
        body: ExtensionContentSubmit,
      ) =>
        api.post(endpoints(topicId).sources.extensionContent(sourceId), body),

      /**
       * Mark a source as complete, removing it from every tier of the queue.
       * Backwards-compat shortcut — internally equivalent to
       * `applyVerdict(..., { verdict: 'mark_complete' })`.
       */
      markSourceComplete: (topicId: string, sourceId: string) =>
        api.post(endpoints(topicId).sources.markComplete(sourceId), {}),

      /**
       * Apply a user verdict to a source — the optional escape hatch the user
       * can use to end the capture cycle on their own terms.
       *
       *  - `accept_as_is` → status='complete', removes from queue forever
       *  - `dead_link`    → status='dead_link', removes from queue forever
       *  - `retry`        → status='pending', re-enters queue at next_level
       *  - `mark_complete` → legacy alias for accept_as_is
       */
      applyVerdict: (topicId: string, sourceId: string, body: VerdictRequest) =>
        api.post(endpoints(topicId).sources.verdict(sourceId), body),
    };
  }, [api]);
}
