"use client";

/**
 * The three WHOLE-PLAN Setup passes — keyword strategy, entity attachment and
 * the plan review — run on the SERVER.
 *
 * 🚨 THESE USED TO RUN IN THIS BROWSER. Each one is a large paid pass over the
 * entire plan plus the full research report, and the only copy of what it
 * produced lived in React state: a refresh, a tab close, or a dropped
 * connection billed the user and left nothing behind.
 *
 * `POST /content-plan/sites/{id}/{keyword-strategy|entity-attachments|review}`
 * now builds every variable server-side, records the run on `chat.agent_run`,
 * and persists the complete proposal to `web.site.settings.content_plan.*`
 * BEFORE it streams anything. This hook starts the stream, adopts it into the
 * canonical execution slice so the model's own tokens render live, and then
 * reads the PERSISTED proposal back — never the stream payload, so the value
 * the user sees is the value that is stored.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { callApi } from "@/lib/api/call-api";
import {
  describeBackendFailure,
  parseCallApiError,
  parseStreamError,
} from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";

import type {
  EntityAttachPlan,
  KeywordStrategyResult,
  PlanReviewResult,
} from "../setup/ai";
import { fetchFreshSite } from "../setup/draft";
import {
  readEntityAttachProposal,
  readKeywordStrategyProposal,
  readPlanReviewProposal,
  type PlanProposal,
} from "../setup/proposals";
import { planAiRunKeys } from "./usePlanAiRuns";

/** Which pass is running — one at a time, per the server's own cost posture. */
export type SetupPassKind = "keywords" | "entities" | "review";

const PASS_PATHS: Record<SetupPassKind, string> = {
  keywords: "/content-plan/sites/{site_id}/keyword-strategy",
  entities: "/content-plan/sites/{site_id}/entity-attachments",
  review: "/content-plan/sites/{site_id}/review",
};

const PASS_LABELS: Record<SetupPassKind, string> = {
  keywords: "Planning keyword strategy",
  entities: "Attaching entities",
  review: "Reviewing the plan",
};

export interface SetupPassState {
  /** The pass currently running, or null. */
  running: SetupPassKind | null;
  /** Human progress line from the server's phase/info milestones. */
  stage: string;
  /** Canonical live-render handle — `<LiveRunDisplay requestId=…>`. */
  requestId: string | null;
  label: string | null;
}

const IDLE: SetupPassState = {
  running: null,
  stage: "",
  requestId: null,
  label: null,
};

function readPhaseMessage(event: TypedStreamEvent): string | null {
  if (event.event === "phase") {
    return event.data.phase === "connected" ? null : event.data.phase;
  }
  if (event.event === "info") {
    return event.data.user_message ?? event.data.system_message ?? null;
  }
  return null;
}

export function useSetupPasses(siteId: string | null) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SetupPassState>(IDLE);
  const inFlight = useRef(false);
  // Adopted rows have no owning instance — nothing else reaps them.
  const adoptedRequestIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
    },
    [dispatch],
  );

  /**
   * Run one pass and hand back the PERSISTED proposal.
   *
   * Throws with a human-readable message on failure — every caller already
   * renders its own error line, and a pass that fails must say why (the
   * server refuses loudly when the site has no research report, no pages, or
   * no entity roster, and those are all one-click fixable).
   */
  const runPass = useCallback(
    async <T>(
      kind: SetupPassKind,
      read: (settings: unknown) => PlanProposal<T> | null,
      guidance = "",
    ): Promise<PlanProposal<T>> => {
      if (!siteId) throw new Error("Pick a site first.");
      if (inFlight.current) throw new Error("An AI pass is already running.");
      inFlight.current = true;
      setState({
        running: kind,
        stage: "Reading the plan and the research…",
        requestId: null,
        label: PASS_LABELS[kind],
      });
      let streamFailure: string | null = null;

      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
      const streamAbort = new AbortController();
      abortRef.current = streamAbort;
      const consumeStream = dispatch(
        adoptForeignStream({
          onAdopted: ({ requestId }) => {
            adoptedRequestIdRef.current = requestId;
            setState((current) => ({ ...current, requestId }));
          },
          abortController: streamAbort,
          onEvent: (event) => {
            const stage = readPhaseMessage(event);
            if (stage) setState((current) => ({ ...current, stage }));
            if (event.event === "error") {
              streamFailure = describeBackendFailure(
                parseStreamError(event.data),
              ).headline;
            }
          },
        }),
      );

      try {
        const result = await dispatch(
          callApi({
            path: PASS_PATHS[kind],
            method: "POST",
            pathParams: { site_id: siteId },
            body: { guidance },
            stream: true,
            consumeStream,
            signal: streamAbort.signal,
          }),
        );
        if (result.error) {
          throw new Error(
            describeBackendFailure(parseCallApiError(result.error)).headline,
          );
        }
        if (streamFailure) throw new Error(streamFailure);

        // The proposal is already stored — read it back rather than trusting
        // the terminal event, so what the user reviews is exactly what a
        // refresh would show them.
        const fresh = await fetchFreshSite(siteId);
        const proposal = read(fresh.settings);
        if (!proposal) {
          throw new Error(
            "The run finished but its result could not be read back from this site.",
          );
        }
        return proposal;
      } finally {
        inFlight.current = false;
        abortRef.current = null;
        setState(IDLE);
        // The site row changed (the proposal landed on it) and the run is now
        // in this site's AI history.
        void queryClient.invalidateQueries({ queryKey: marketingKeys.siteOptions() });
        void queryClient.invalidateQueries({ queryKey: planAiRunKeys.list(siteId) });
      }
    },
    [dispatch, queryClient, siteId],
  );

  const planKeywords = useCallback(
    (guidance = ""): Promise<PlanProposal<KeywordStrategyResult>> =>
      runPass("keywords", readKeywordStrategyProposal, guidance),
    [runPass],
  );

  const attachEntities = useCallback(
    (guidance = ""): Promise<PlanProposal<EntityAttachPlan>> =>
      runPass("entities", readEntityAttachProposal, guidance),
    [runPass],
  );

  const reviewPlan = useCallback(
    (guidance = ""): Promise<PlanProposal<PlanReviewResult>> =>
      runPass("review", readPlanReviewProposal, guidance),
    [runPass],
  );

  const dismiss = useCallback(() => {
    if (adoptedRequestIdRef.current) {
      dispatch(removeRequest(adoptedRequestIdRef.current));
      adoptedRequestIdRef.current = null;
    }
    setState(IDLE);
  }, [dispatch]);

  return {
    planKeywords,
    attachEntities,
    reviewPlan,
    /** Live-render handle — mount `<LiveRunDisplay {...passes.live} />`. */
    live: {
      requestId: state.requestId,
      label: state.label,
      isRunning: state.running !== null,
      stage: state.stage,
      dismiss,
    },
    running: state.running,
    keywordsBusy: state.running === "keywords",
    entitiesBusy: state.running === "entities",
    reviewBusy: state.running === "review",
    busy: state.running !== null,
  };
}

export type SetupPassesController = ReturnType<typeof useSetupPasses>;
