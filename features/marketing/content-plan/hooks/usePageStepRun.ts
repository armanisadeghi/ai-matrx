"use client";

/**
 * Run ONE Website Factory pipeline step for ONE page.
 *
 * `POST /content-plan/nodes/{id}/steps/{step}` — p3_family / p4_write /
 * p5_review, each independently re-runnable. Every one is server work that
 * PERSISTS on arrival (`plan.node_artifact` + `plan.node_step`, superseding the
 * previous revision), so a refresh, a closed panel, or a dropped connection
 * loses nothing — the rail reloads the truth from the database.
 *
 * The stream is ADOPTED into the canonical execution slice
 * (`adoptForeignStream`), so the model's own tokens render live through the ONE
 * pipeline — never a bespoke renderer, never a bare spinner.
 *
 * A precondition refusal (no brief to write from, no draft to review) comes
 * back as an HTTP status BEFORE the stream opens, so it surfaces as the gap
 * plus its fix rather than a mid-stream error.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import {
  addRunToSet,
  clearRunSet,
} from "@/features/agents/redux/execution-system/run-sets/run-sets.thunks";
import { callApi } from "@/lib/api/call-api";
import {
  describeBackendFailure,
  parseCallApiError,
  parseStreamError,
} from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { planKeys } from "../data/hooks";
import { RUNNABLE_PIPELINE_STEPS, type RunnablePipelineStep } from "../types";

export interface PageStepRunState {
  status: "idle" | "running" | "done" | "error";
  /** Which step is in flight — the rail disables only that one. */
  step?: RunnablePipelineStep;
  stage?: string;
  error?: string;
  /** Canonical live-render handle — `<LiveRunDisplay requestId=…>`. */
  requestId?: string;
}

const IDLE: PageStepRunState = { status: "idle" };

function readPhaseMessage(event: TypedStreamEvent): string | null {
  if (event.event === "phase") {
    return event.data.phase === "connected" ? null : event.data.phase;
  }
  if (event.event === "info") {
    return event.data.user_message ?? event.data.system_message ?? null;
  }
  return null;
}

export function isRunnableStep(step: string): step is RunnablePipelineStep {
  return (RUNNABLE_PIPELINE_STEPS as readonly string[]).includes(step);
}

export function usePageStepRun(args: {
  nodeId: string;
  siteId: string | null;
  /** For the run-set label — the route reads better than a uuid. */
  pageLabel?: string;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [run, setRun] = useState<PageStepRunState>(IDLE);
  const inFlight = useRef(false);
  // Adopted rows have no owning instance — nothing else reaps them.
  const adoptedRequestIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runEpochRef = useRef(0);

  const { nodeId, siteId, pageLabel } = args;
  const runSetKey = `content-plan-ai:${siteId ?? "none"}:page-step:${nodeId}`;

  useEffect(
    () => () => {
      // Let the adopted reader keep feeding the set-held Redux row through a
      // panel remount; only this hook's local state becomes stale.
      runEpochRef.current += 1;
      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
    },
    [dispatch],
  );

  const start = useCallback(
    async (step: RunnablePipelineStep, guidance = "") => {
      if (inFlight.current) return;
      const epoch = ++runEpochRef.current;
      const setRunForEpoch = (
        updater: (current: PageStepRunState) => PageStepRunState,
      ) => {
        if (runEpochRef.current === epoch) setRun(updater);
      };
      inFlight.current = true;
      setRun({ status: "running", step, stage: "Starting…" });
      let streamFailure: string | null = null;

      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
      dispatch(clearRunSet(runSetKey));
      const streamAbort = new AbortController();
      abortRef.current = streamAbort;
      const consumeStream = dispatch(
        adoptForeignStream({
          onAdopted: ({ requestId }) => {
            if (runEpochRef.current !== epoch) {
              dispatch(removeRequest(requestId));
              return;
            }
            adoptedRequestIdRef.current = requestId;
            setRunForEpoch((current) => ({ ...current, requestId }));
            dispatch(
              addRunToSet({
                setKey: runSetKey,
                requestId,
                label: `${step} — ${pageLabel ?? "page"}`,
              }),
            );
          },
          abortController: streamAbort,
          onEvent: (event) => {
            const stage = readPhaseMessage(event);
            if (stage) setRunForEpoch((current) => ({ ...current, stage }));
            if (event.event === "error") {
              streamFailure = describeBackendFailure(
                parseStreamError(event.data),
              ).headline;
            }
          },
        }),
      );

      const result = await dispatch(
        callApi({
          path: "/content-plan/nodes/{node_id}/steps/{step}",
          method: "POST",
          pathParams: { node_id: nodeId, step },
          body: { guidance },
          stream: true,
          consumeStream,
          signal: streamAbort.signal,
        }),
      );

      if (runEpochRef.current === epoch) {
        inFlight.current = false;
        if (abortRef.current === streamAbort) abortRef.current = null;
      }
      // The artifact and the step row are written before anything streams —
      // refetch regardless of how the stream ended.
      void queryClient.invalidateQueries({
        queryKey: planKeys.nodeArtifacts(nodeId),
      });
      if (siteId) {
        void queryClient.invalidateQueries({
          queryKey: planKeys.nodeSteps(siteId),
        });
      }

      if (runEpochRef.current !== epoch) return;

      if (result.error) {
        const explanation = describeBackendFailure(
          parseCallApiError(result.error),
        );
        setRunForEpoch((current) => ({
          ...current,
          status: "error",
          error: explanation.headline,
        }));
        toast.error(explanation.headline);
        return;
      }
      if (streamFailure) {
        setRunForEpoch((current) => ({
          ...current,
          status: "error",
          error: streamFailure ?? undefined,
        }));
        toast.error(streamFailure);
        return;
      }
      setRunForEpoch((current) => ({ ...current, status: "done" }));
      toast.success("Step complete — the page's pipeline record is updated.");
    },
    [dispatch, nodeId, pageLabel, queryClient, runSetKey, siteId],
  );

  // The run-set key is the handle a `RunSetWindowController` needs — live model
  // output belongs in the FLOATING window, never as a block bolted onto the
  // panel the user is reading (THE FLOATING LAW).
  return { run, start, isRunning: run.status === "running", runSetKey };
}
