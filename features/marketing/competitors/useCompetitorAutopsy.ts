"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { callApi } from "@/lib/api/call-api";
import {
  describeBackendFailure,
  parseCallApiError,
  parseStreamError,
} from "@/lib/api/errors";
import { isErrorEvent, type TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { isJsonObject } from "@/types/json";

import { listCompetitorSites, loadCompetitorWorkspace } from "./data";

export interface CompetitorRunState {
  status: "idle" | "running" | "done" | "error";
  requestId?: string;
  runId?: string;
  stage?: string;
  hasStreamedContent?: boolean;
  error?: string;
}

const STAGES: Record<string, string> = {
  "seo.competitor_discovery_started": "Finding the competitors that truly overlap",
  "seo.competitor_discovery_completed": "Competitor discovery complete",
  "seo.competitors_persisted": "Competitor identities saved",
  "seo.relevant_pages_started": "Finding the pages responsible for their visibility",
  "seo.relevant_pages_completed": "Winning pages identified",
  "seo.competitor_page_crawl_started": "Reading a competitor page",
  "seo.competitor_page_analyzed": "Page evidence analyzed",
  "seo.competitor_autopsy_persisted": "Recommendations saved",
  "seo.competitor_autopsy_completed": "Autopsy complete",
};

export function useCompetitorAutopsy(siteId: string | null) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const adoptedRequestId = useRef<string | null>(null);
  const [run, setRun] = useState<CompetitorRunState>({ status: "idle" });
  const sites = useQuery({
    queryKey: ["marketing", "competitors", "sites"],
    queryFn: listCompetitorSites,
    staleTime: 5 * 60_000,
  });
  const resolvedSiteId = siteId ?? sites.data?.[0]?.id ?? null;
  const workspace = useQuery({
    queryKey: ["marketing", "competitors", resolvedSiteId],
    queryFn: () => {
      if (!resolvedSiteId) throw new Error("Choose a site before loading competitor data.");
      return loadCompetitorWorkspace(resolvedSiteId);
    },
    enabled: Boolean(resolvedSiteId),
  });

  useEffect(
    () => () => {
      if (adoptedRequestId.current) dispatch(removeRequest(adoptedRequestId.current));
    },
    [dispatch],
  );

  const start = useCallback(
    async (input: {
      competitorDomains: string[];
      maxCompetitors: number;
      pagesPerCompetitor: number;
      forceRefresh: boolean;
    }) => {
      if (!resolvedSiteId) return;
      if (adoptedRequestId.current) {
        dispatch(removeRequest(adoptedRequestId.current));
        adoptedRequestId.current = null;
      }
      setRun({ status: "running", stage: "Preparing the evidence plan" });
      let streamError: string | null = null;
      const abortController = new AbortController();
      const consumeStream = dispatch(
        adoptForeignStream({
          abortController,
          onAdopted: ({ requestId }) => {
            adoptedRequestId.current = requestId;
            setRun((current) => ({ ...current, requestId }));
          },
          onEvent: (event: TypedStreamEvent) => {
            if (event.event === "chunk" || event.event === "render_block") {
              setRun((current) => ({ ...current, hasStreamedContent: true }));
              return;
            }
            if (isErrorEvent(event)) {
              streamError = describeBackendFailure(parseStreamError(event.data)).headline;
              setRun((current) => ({ ...current, status: "error", error: streamError ?? undefined }));
              return;
            }
            if (event.event !== "data") return;
            const data: unknown = event.data;
            if (!isJsonObject(data)) return;
            const kind = typeof data.kind === "string" ? data.kind : "";
            const commandRunId =
              typeof data.run_id === "string" ? data.run_id : null;
            if (kind === "seo.command_run" && commandRunId) {
              setRun((current) => ({ ...current, runId: commandRunId }));
            }
            if (kind) setRun((current) => ({ ...current, stage: STAGES[kind] ?? kind }));
            if (kind === "seo.competitor_autopsy_completed") {
              setRun((current) => ({ ...current, status: "done", stage: "Autopsy complete" }));
            }
          },
        }),
      );
      const result = await dispatch(
        callApi({
          path: "/seo/sites/{site_id}/competitor-autopsy",
          method: "POST",
          pathParams: { site_id: resolvedSiteId },
          body: {
            competitor_domains: input.competitorDomains,
            location_code: 2840,
            language_code: "en",
            max_competitors: input.maxCompetitors,
            pages_per_competitor: input.pagesPerCompetitor,
            force_refresh: input.forceRefresh,
          },
          stream: true,
          consumeStream,
          signal: abortController.signal,
        }),
      );
      if (result.error || streamError) {
        const headline = streamError ?? (
          result.error
            ? describeBackendFailure(parseCallApiError(result.error)).headline
            : "The competitor autopsy stopped before it completed."
        );
        setRun((current) => ({ ...current, status: "error", error: headline }));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["marketing", "competitors", resolvedSiteId] });
    },
    [dispatch, queryClient, resolvedSiteId],
  );

  return { sites, workspace, run, start, resolvedSiteId };
}
