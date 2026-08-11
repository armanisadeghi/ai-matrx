"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { callApi } from "@/lib/api/call-api";
import {
  describeBackendFailure,
  parseCallApiError,
  parsePersistedBackendError,
  parseStreamError,
} from "@/lib/api/errors";
import { isErrorEvent, type TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { reputationKeys } from "@/features/marketing/data/reputation-hooks";
import type { ReputationBrief } from "@/features/marketing/data/reputation-types";

export interface ReputationRunResult {
  result_kind: "reputation.intelligence";
  site_id: string;
  kind_instance_id: string | null;
  accepted_cases: number;
  rejected_cases: number;
  publication_opportunities: number;
  brief: ReputationBrief;
}

export interface ReputationAnalysisState {
  status: "idle" | "running" | "done" | "error";
  requestId?: string;
  runId?: string;
  stage?: string;
  hasStreamedContent?: boolean;
  result?: ReputationRunResult;
  error?: string;
}

const STAGES: Record<string, string> = {
  "seo.reputation_evidence_started": "Inventorying evidence",
  "seo.reputation_evidence_ready": "Evidence bundle verified",
  "seo.reputation_analysis_started": "Adjudicating evidence",
  "seo.reputation_analysis_ready": "Saving accepted decisions",
  "seo.reputation_analysis_completed": "Reputation intelligence ready",
};

function dataOf(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data"
    ? (event.data as Record<string, unknown>)
    : null;
}

function resultOf(event: TypedStreamEvent): ReputationRunResult | null {
  const data = dataOf(event);
  if (data?.kind !== "seo.reputation_analysis_completed") return null;
  return data.result && typeof data.result === "object"
    ? (data.result as unknown as ReputationRunResult)
    : null;
}

function storageKey(siteId: string): string {
  return `seo.reputation.activeRun.${siteId}`;
}

export function useReputationAnalysis(input: {
  siteId: string;
  brandId: string;
  organizationId: string;
}) {
  const { siteId, brandId, organizationId } = input;
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const adoptedRequestId = useRef<string | null>(null);
  const [run, setRun] = useState<ReputationAnalysisState>({ status: "idle" });

  useEffect(
    () => () => {
      if (adoptedRequestId.current) {
        dispatch(removeRequest(adoptedRequestId.current));
        adoptedRequestId.current = null;
      }
    },
    [dispatch],
  );

  const consume = useCallback(
    async (
      request:
        | { kind: "fresh"; forceRefresh: boolean }
        | { kind: "rejoin"; runId: string },
    ) => {
      let completed: ReputationRunResult | null = null;
      let busy = false;
      let failure: string | null = null;
      if (adoptedRequestId.current) {
        dispatch(removeRequest(adoptedRequestId.current));
        adoptedRequestId.current = null;
      }
      setRun((current) => ({ ...current, status: "running", error: undefined }));
      const controller = new AbortController();
      const consumeStream = dispatch(
        adoptForeignStream({
          abortController: controller,
          onAdopted: ({ requestId }) => {
            adoptedRequestId.current = requestId;
            setRun((current) => ({ ...current, requestId }));
          },
          onEvent: (event) => {
            if (event.event === "chunk" || event.event === "render_block") {
              setRun((current) => ({ ...current, hasStreamedContent: true }));
              return;
            }
            if (isErrorEvent(event)) {
              failure = describeBackendFailure(parseStreamError(event.data)).headline;
              setRun((current) => ({
                ...current,
                status: "error",
                stage: "Analysis stopped",
                error: failure ?? undefined,
              }));
              return;
            }
            const data = dataOf(event);
            if (!data) return;
            const kind = typeof data?.kind === "string" ? data.kind : null;
            if (!kind) return;
            if (kind === "seo.command_run" && typeof data.run_id === "string") {
              sessionStorage.setItem(storageKey(siteId), data.run_id);
              setRun((current) => ({ ...current, runId: data.run_id as string }));
            }
            if (kind === "seo.run_in_progress") busy = true;
            if (kind === "seo.run_snapshot") {
              if (data.status === "completed" && data.result) {
                completed = data.result as unknown as ReputationRunResult;
              } else if (data.status === "failed") {
                const persisted = parsePersistedBackendError(data.error);
                failure = persisted
                  ? describeBackendFailure(persisted).headline
                  : "The reputation analysis failed.";
              } else {
                busy = true;
              }
            }
            const final = resultOf(event);
            if (final) completed = final;
            setRun((current) => ({
              ...current,
              stage: STAGES[kind] ?? current.stage,
            }));
          },
        }),
      );
      const response = await dispatch(
        request.kind === "fresh"
          ? callApi({
              path: "/seo/sites/{site_id}/reputation/analyze",
              method: "POST",
              pathParams: { site_id: siteId },
              body: { force_refresh: request.forceRefresh },
              scopeOverrides: { organization_id: organizationId },
              stream: true,
              consumeStream,
              signal: controller.signal,
            })
          : callApi({
              path: "/seo/collections/{run_id}/rejoin",
              method: "POST",
              pathParams: { run_id: request.runId },
              stream: true,
              consumeStream,
              signal: controller.signal,
            }),
      );
      if (response.error) {
        failure = describeBackendFailure(parseCallApiError(response.error)).headline;
      }
      if (completed) {
        sessionStorage.removeItem(storageKey(siteId));
        setRun((current) => ({
          ...current,
          status: "done",
          stage: "Reputation intelligence ready",
          result: completed ?? undefined,
        }));
        await queryClient.invalidateQueries({
          queryKey: reputationKeys.workspace(siteId, brandId),
        });
        return;
      }
      if (busy && !failure) return;
      sessionStorage.removeItem(storageKey(siteId));
      setRun((current) => ({
        ...current,
        status: "error",
        error:
          failure ??
          "The server ended without a durable reputation result. Retry the analysis.",
      }));
    },
    [brandId, dispatch, organizationId, queryClient, siteId],
  );

  useEffect(() => {
    const runId = sessionStorage.getItem(storageKey(siteId));
    if (!runId) return;
    const timer = window.setTimeout(() => {
      void consume({ kind: "rejoin", runId });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [consume, siteId]);

  return {
    run,
    analyze: (forceRefresh = false) => consume({ kind: "fresh", forceRefresh }),
  };
}
