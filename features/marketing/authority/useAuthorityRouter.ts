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
import type { TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { getLatestAuthorityResult } from "./data";
import type { AuthorityRouterResult, AuthorityRunState } from "./types";

export const authorityResultKey = (siteId: string) =>
  ["marketing", "site", siteId, "authority-router"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function resultFromEvent(
  event: TypedStreamEvent,
): AuthorityRouterResult | null {
  if (event.event !== "data") return null;
  const data = record(event.data);
  const result = record(data?.result);
  if (result?.result_kind !== "authority.route") return null;
  return result as unknown as AuthorityRouterResult;
}

function stageFromEvent(event: TypedStreamEvent): string | null {
  if (event.event === "phase") {
    return event.data.phase === "connected" ? null : event.data.phase;
  }
  if (event.event !== "data") return null;
  const data = record(event.data);
  switch (data?.kind) {
    case "seo.command_run":
      return "Opening a durable analysis run…";
    case "seo.authority_evidence_started":
      return "Joining crawl, backlink, Search Console, page-map, and content-plan evidence…";
    case "seo.authority_candidates_ready":
      return `Deterministic map ready — reviewing ${Number(data.candidates ?? 0).toLocaleString()} exact routes…`;
    case "seo.authority_ai_started":
      return "The routing strategist is checking anchors, placement, relevance, and conflicts…";
    case "seo.authority_ai_completed":
      return "Finalizing the prioritized implementation plan…";
    default:
      return null;
  }
}

export function useAuthorityRouter(siteId: string) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [run, setRun] = useState<AuthorityRunState>({ status: "idle" });
  const requestRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  const latest = useQuery({
    queryKey: authorityResultKey(siteId),
    queryFn: ({ signal }) => getLatestAuthorityResult(siteId, signal),
    enabled: Boolean(siteId),
  });

  useEffect(
    () => () => {
      // Abort FIRST, then reap — an orphaned fetch draining into a missing
      // row is the disappearing-run class (LIVE_RUN_RETENTION.md seam #3).
      abortRef.current?.abort();
      abortRef.current = null;
      if (requestRef.current) {
        dispatch(removeRequest(requestRef.current));
        requestRef.current = null;
      }
    },
    [dispatch],
  );

  const start = useCallback(
    async (options?: { guidance?: string; forceRefresh?: boolean }) => {
      if (!siteId || inFlight.current) return;
      inFlight.current = true;
      let streamError: string | null = null;
      // Abort the previous run's stream BEFORE reaping its row — otherwise the
      // orphaned fetch keeps draining into a missing row and the response body
      // leaks for the run's lifetime.
      abortRef.current?.abort();
      if (requestRef.current) {
        dispatch(removeRequest(requestRef.current));
        requestRef.current = null;
      }
      const abortController = new AbortController();
      abortRef.current = abortController;
      setRun({ status: "running", stage: "Starting the authority map…" });

      const consumeStream = dispatch(
        adoptForeignStream({
          abortController,
          onAdopted: ({ requestId }) => {
            requestRef.current = requestId;
            setRun((current) => ({ ...current, requestId }));
          },
          onEvent: (event) => {
            const stage = stageFromEvent(event);
            const result = resultFromEvent(event);
            if (event.event === "data") {
              const data = record(event.data);
              if (typeof data?.run_id === "string") {
                setRun((current) => ({
                  ...current,
                  runId: data.run_id as string,
                }));
              }
            }
            if (stage) setRun((current) => ({ ...current, stage }));
            if (result) setRun((current) => ({ ...current, result }));
            if (event.event === "error") {
              streamError = describeBackendFailure(
                parseStreamError(event.data),
              ).headline;
            }
          },
        }),
      );
      const response = await dispatch(
        callApi({
          path: "/seo/sites/{site_id}/authority/route",
          method: "POST",
          pathParams: { site_id: siteId },
          body: {
            guidance: options?.guidance ?? "",
            force_refresh: options?.forceRefresh ?? false,
          },
          stream: true,
          consumeStream,
          signal: abortController.signal,
        }),
      );
      inFlight.current = false;
      // Cancelled by teardown or a newer run — settle silently (no error
      // state, no toast); the run keeps executing server-side.
      if (abortController.signal.aborted) return;
      abortRef.current = null;
      if (response.error || streamError) {
        const headline =
          streamError ??
          (response.error
            ? describeBackendFailure(parseCallApiError(response.error)).headline
            : "Authority analysis failed before a result was returned.");
        setRun((current) => ({ ...current, status: "error", error: headline }));
        toast.error(`Authority analysis failed: ${headline}`);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: authorityResultKey(siteId),
      });
      setRun((current) => ({ ...current, status: "done" }));
      toast.success("Authority routes are ready to review.");
    },
    [dispatch, queryClient, siteId],
  );

  const result = run.result ?? latest.data ?? null;
  return { run, result, latest, start };
}
