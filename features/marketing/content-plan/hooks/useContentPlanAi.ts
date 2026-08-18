"use client";

/**
 * features/marketing/content-plan/hooks/useContentPlanAi.ts
 *
 * The workspace's two AI actions — the ONLY calls this feature makes to the
 * Python brain (plan CRUD stays Supabase-direct, per the workspace rule):
 *
 *   - Generate plan  → POST /content-plan/sites/{site_id}/generate (stream):
 *     aidream's 3-research-waves + merge generator; nodes land in `plan.node`
 *     server-side and appear here on refetch.
 *   - Deepen node    → POST /content-plan/nodes/{node_id}/deepen (stream):
 *     writes brief lines + sources onto one node.
 *
 * Both stream the Matrx protocol via `callApi({stream:true})`: `phase` events
 * drive the live stage line, `data` events refresh the tree, `error`/`end`
 * settle the run. The tree ALWAYS refetches on end — even after an error —
 * because the server may have applied a partial tree before failing.
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
import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";
import { runWithConcurrency } from "@/lib/async/run-with-concurrency";

import { planKeys } from "../data/hooks";

export interface PlanAiRunState {
  status: "idle" | "running" | "done" | "error";
  /** Live server phase line ("Wave 2/3: competitor coverage…"). */
  stage?: string;
  error?: string;
  /**
   * Canonical live-render handle: the server stream is ADOPTED into
   * `activeRequests` (adoptForeignStream), so `<LiveRunDisplay requestId=…>`
   * renders the model's tokens as they arrive — never a bare spinner.
   */
  requestId?: string;
}

const IDLE: PlanAiRunState = { status: "idle" };

/**
 * Bulk deepen deliberately opens every selected page stream together. During
 * that burst the shared server can take longer than callApi's 15-second
 * default to return response headers even though it accepted the durable work.
 * Keep the client below Cloudflare's ~100-second edge ceiling, and never retry:
 * a timed-out request may already be running and a retry could duplicate spend.
 */
export const CONTENT_PLAN_STREAM_CONNECT_TIMEOUT_MS = 95_000;

function readPhaseMessage(event: TypedStreamEvent): string | null {
  if (event.event === "phase") {
    return event.data.phase === "connected" ? null : event.data.phase;
  }
  if (event.event === "info") {
    return event.data.user_message ?? event.data.system_message ?? null;
  }
  return null;
}

/** Generate (or extend) a site's plan with the server's 3+1 generator. */
export function usePlanGenerate(siteId: string | null) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [run, setRun] = useState<PlanAiRunState>(IDLE);
  const inFlight = useRef(false);
  // Coalesce mid-stream refetches: a 150-node run may emit one `data` event
  // per node — one invalidation per ~750ms keeps the tree live without a
  // refetch storm (the post-stream invalidation below is the backstop).
  const lastInvalidate = useRef(0);
  // Adopted rows have no owning instance — drop the previous run's row before
  // starting a new one (the keyword-research adopter's proven pattern), on
  // reset, and on unmount (nothing else reaps them).
  const adoptedRequestIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const runEpochRef = useRef(0);
  const runSetKey = `content-plan-ai:${siteId ?? "none"}:generate`;

  useEffect(
    () => () => {
      // Let the adopted reader keep feeding the set-held Redux row through a
      // host remount; only this hook's local state becomes stale.
      cancelledRef.current = true;
      runEpochRef.current += 1;
      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
    },
    [dispatch],
  );

  const start = useCallback(
    async (options?: {
      maxNodes?: number;
      guidance?: string;
      /** Ground the waves in this research topic's final Document. Omitted →
       * the server falls back to the site's recorded research link. */
      researchTopicId?: string | null;
    }) => {
      if (!siteId || inFlight.current) return;
      const epoch = ++runEpochRef.current;
      const setRunForEpoch = (
        updater: (current: PlanAiRunState) => PlanAiRunState,
      ) => {
        if (runEpochRef.current === epoch) setRun(updater);
      };
      inFlight.current = true;
      cancelledRef.current = false;
      setRun({ status: "running", stage: "Starting the generator…" });
      let streamFailure: string | null = null;

      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
      dispatch(clearRunSet(runSetKey));
      const streamAbort = new AbortController();
      abortRef.current = streamAbort;
      // The stream is ADOPTED into the canonical execution slice so the
      // model's own tokens render live (`<LiveRunDisplay requestId>`); this
      // hook still sees every event for its typed progress + refetch logic.
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
                label: "Generating plan",
              }),
            );
          },
          abortController: streamAbort,
          onEvent: (event) => {
            const stage = readPhaseMessage(event);
            if (stage) {
              setRunForEpoch((current) => ({ ...current, stage }));
            }
            if (event.event === "data") {
              // Nodes may land mid-stream (apply=true) — show them live.
              const now = Date.now();
              if (now - lastInvalidate.current > 750) {
                lastInvalidate.current = now;
                void queryClient.invalidateQueries({
                  queryKey: planKeys.nodes(siteId),
                });
              }
            }
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
          path: "/content-plan/sites/{site_id}/generate",
          method: "POST",
          pathParams: { site_id: siteId },
          body: {
            max_nodes: options?.maxNodes ?? 40,
            guidance: options?.guidance ?? null,
            apply: true,
            research_topic_id: options?.researchTopicId ?? null,
          },
          stream: true,
          consumeStream,
          signal: streamAbort.signal,
          connectTimeoutMs: CONTENT_PLAN_STREAM_CONNECT_TIMEOUT_MS,
        }),
      );

      if (runEpochRef.current === epoch) {
        inFlight.current = false;
        if (abortRef.current === streamAbort) abortRef.current = null;
      }
      // Whatever happened, the server may have written nodes — refetch.
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      void queryClient.invalidateQueries({ queryKey: planKeys.siteStats() });

      if (runEpochRef.current !== epoch) return;

      // A user dismissal aborted the stream deliberately — settle silently
      // (no error toast for an action the user chose).
      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }

      if (result.error) {
        const explanation = describeBackendFailure(
          parseCallApiError(result.error),
        );
        setRunForEpoch((current) => ({
          ...current,
          status: "error",
          error: explanation.headline,
        }));
        toast.error(`Plan generation failed: ${explanation.headline}`);
        return;
      }
      if (streamFailure) {
        setRunForEpoch((current) => ({
          ...current,
          status: "error",
          error: streamFailure ?? undefined,
        }));
        toast.error(`Plan generation failed: ${streamFailure}`);
        return;
      }
      setRunForEpoch((current) => ({ ...current, status: "done" }));
      toast.success("Plan generation finished — the tree is up to date.");
    },
    [dispatch, queryClient, runSetKey, siteId],
  );

  const reset = useCallback(() => {
    runEpochRef.current += 1;
    // Dismiss during a run: abort the fetch so the reader is drained and
    // `inFlight` clears when callApi returns (the server finishes regardless —
    // detach-on-disconnect).
    if (inFlight.current) {
      cancelledRef.current = true;
      abortRef.current?.abort();
    }
    inFlight.current = false;
    abortRef.current = null;
    if (adoptedRequestIdRef.current) {
      dispatch(removeRequest(adoptedRequestIdRef.current));
      adoptedRequestIdRef.current = null;
    }
    dispatch(clearRunSet(runSetKey));
    setRun(IDLE);
  }, [dispatch, runSetKey]);

  return { run, start, reset, runSetKey };
}

/** What NodePanel receives — the workbench owns the hook instance. */
export type PlanDeepenController = ReturnType<typeof usePlanDeepen>;

/** Deepen ONE node: server writes brief lines + sources onto it. */
export function usePlanDeepen(siteId: string | null) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [run, setRun] = useState<PlanAiRunState>(IDLE);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const adoptedRequestIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const runEpochRef = useRef(0);
  const runSetKey = `content-plan-ai:${siteId ?? "none"}:deepen`;

  useEffect(
    () => () => {
      cancelledRef.current = true;
      runEpochRef.current += 1;
      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
    },
    [dispatch],
  );

  const start = useCallback(
    async (targetNodeId: string) => {
      if (!siteId || inFlight.current) return;
      const epoch = ++runEpochRef.current;
      const setRunForEpoch = (
        updater: (current: PlanAiRunState) => PlanAiRunState,
      ) => {
        if (runEpochRef.current === epoch) setRun(updater);
      };
      inFlight.current = true;
      cancelledRef.current = false;
      setNodeId(targetNodeId);
      setRun({ status: "running", stage: "Deepening (brief + sources)…" });
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
                label: "Deepening page — brief + sources",
              }),
            );
          },
          abortController: streamAbort,
          onEvent: (event) => {
            const stage = readPhaseMessage(event);
            if (stage) {
              setRunForEpoch((current) => ({ ...current, stage }));
            }
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
          path: "/content-plan/nodes/{node_id}/deepen",
          method: "POST",
          pathParams: { node_id: targetNodeId },
          stream: true,
          consumeStream,
          signal: streamAbort.signal,
          connectTimeoutMs: CONTENT_PLAN_STREAM_CONNECT_TIMEOUT_MS,
        }),
      );

      if (runEpochRef.current === epoch) {
        inFlight.current = false;
        if (abortRef.current === streamAbort) abortRef.current = null;
      }
      // The server may have written the brief regardless of what happened to
      // the stream — always refetch.
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      void queryClient.invalidateQueries({
        queryKey: planKeys.node(targetNodeId),
      });
      void queryClient.invalidateQueries({
        queryKey: planKeys.nodeEdges(targetNodeId),
      });
      // Deepen can assign a primary keyword into the canonical per-page SEO
      // plan. The readiness dialog and every SEO editor read that index rather
      // than the retired plan.node keyword copy, so leaving this cache warm
      // made a successful assignment look as if it never happened.
      void queryClient.invalidateQueries({
        queryKey: planKeys.seoPlans(siteId),
      });
      void queryClient.invalidateQueries({
        queryKey: planKeys.nodeSteps(siteId),
      });
      void queryClient.invalidateQueries({
        queryKey: planKeys.nodeArtifacts(targetNodeId),
      });

      if (runEpochRef.current !== epoch) return;

      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }

      if (result.error) {
        const explanation = describeBackendFailure(
          parseCallApiError(result.error),
        );
        setRunForEpoch((current) => ({
          ...current,
          status: "error",
          error: explanation.headline,
        }));
        toast.error(`Deepen failed: ${explanation.headline}`);
        return;
      }
      if (streamFailure) {
        setRunForEpoch((current) => ({
          ...current,
          status: "error",
          error: streamFailure ?? undefined,
        }));
        toast.error(`Deepen failed: ${streamFailure}`);
        return;
      }
      setRunForEpoch((current) => ({ ...current, status: "done" }));
      toast.success("Node deepened — brief and sources updated.");
    },
    [dispatch, queryClient, runSetKey, siteId],
  );

  const reset = useCallback(() => {
    runEpochRef.current += 1;
    // Dismiss mid-run: abort the outbound stream (server work continues and
    // persists — detach-on-disconnect) so `inFlight` clears and the next
    // deepen can start immediately; settle silently, no failure toast.
    if (inFlight.current) {
      cancelledRef.current = true;
      abortRef.current?.abort();
    }
    inFlight.current = false;
    abortRef.current = null;
    if (adoptedRequestIdRef.current) {
      dispatch(removeRequest(adoptedRequestIdRef.current));
      adoptedRequestIdRef.current = null;
    }
    dispatch(clearRunSet(runSetKey));
    setNodeId(null);
    setRun(IDLE);
  }, [dispatch, runSetKey]);

  return { run, nodeId, start, reset, runSetKey };
}

// ── bulk deepen (handoff item: fan the SAME deepen over many pages) ─────────

export interface BulkDeepenFailure {
  nodeId: string;
  route: string;
  error: string;
}

export interface BulkDeepenState {
  status: "idle" | "running" | "done" | "error";
  total: number;
  done: number;
  /** Routes currently running. Bulk deepen starts every selected route together. */
  active: string[];
  /** Canonical live-render handle for the most recently adopted stream. */
  requestId?: string;
  failures: BulkDeepenFailure[];
  cancelled: boolean;
}

const BULK_IDLE: BulkDeepenState = {
  status: "idle",
  total: 0,
  done: 0,
  active: [],
  failures: [],
  cancelled: false,
};

export type PlanBulkDeepenController = ReturnType<typeof usePlanBulkDeepen>;

/**
 * Run the EXISTING research-grounded deepen over many nodes in parallel, with
 * per-node failure isolation and cancellation of active streams. Not a new
 * agent — the same POST /nodes/{id}/deepen per node.
 */
export function usePlanBulkDeepen(siteId: string | null) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [run, setRun] = useState<BulkDeepenState>(BULK_IDLE);
  const inFlight = useRef(false);
  const cancelRef = useRef(false);
  const adoptedRequestIdsRef = useRef(new Set<string>());
  const abortControllersRef = useRef(new Set<AbortController>());
  const runEpochRef = useRef(0);
  const runSetKey = `content-plan-ai:${siteId ?? "none"}:bulk-deepen`;

  useEffect(
    () => () => {
      runEpochRef.current += 1;
      for (const requestId of adoptedRequestIdsRef.current) {
        dispatch(removeRequest(requestId));
      }
      adoptedRequestIdsRef.current.clear();
    },
    [dispatch],
  );

  const start = useCallback(
    async (targets: Array<{ id: string; route: string }>) => {
      if (!siteId || inFlight.current || targets.length === 0) return;
      const epoch = ++runEpochRef.current;
      const setRunForEpoch = (
        updater: (current: BulkDeepenState) => BulkDeepenState,
      ) => {
        if (runEpochRef.current === epoch) setRun(updater);
      };
      inFlight.current = true;
      cancelRef.current = false;
      dispatch(clearRunSet(runSetKey));
      setRun({
        status: "running",
        total: targets.length,
        done: 0,
        failures: [],
        cancelled: false,
        active: [],
      });

      const failures: BulkDeepenFailure[] = [];
      const activeRoutes = new Set<string>();
      let done = 0;

      await runWithConcurrency(
        targets,
        targets.length,
        async (target) => {
          if (runEpochRef.current !== epoch) return;
          activeRoutes.add(target.route);
          setRunForEpoch((current) => ({
            ...current,
            active: [...activeRoutes],
          }));
          let streamFailure: string | null = null;
          const streamAbort = new AbortController();
          abortControllersRef.current.add(streamAbort);
          const consumeStream = dispatch(
            adoptForeignStream({
              onAdopted: ({ requestId }) => {
                if (runEpochRef.current !== epoch) {
                  dispatch(removeRequest(requestId));
                  return;
                }
                adoptedRequestIdsRef.current.add(requestId);
                setRunForEpoch((current) => ({ ...current, requestId }));
                dispatch(
                  addRunToSet({
                    setKey: runSetKey,
                    requestId,
                    label: `Deepening — ${target.route}`,
                  }),
                );
              },
              abortController: streamAbort,
              onEvent: (event) => {
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
                path: "/content-plan/nodes/{node_id}/deepen",
                method: "POST",
                pathParams: { node_id: target.id },
                stream: true,
                consumeStream,
                signal: streamAbort.signal,
                connectTimeoutMs: CONTENT_PLAN_STREAM_CONNECT_TIMEOUT_MS,
              }),
            );
            const error = result.error
              ? describeBackendFailure(parseCallApiError(result.error)).headline
              : streamFailure;
            if (error && !cancelRef.current) {
              failures.push({ nodeId: target.id, route: target.route, error });
            }
          } catch (error) {
            if (!cancelRef.current) {
              failures.push({
                nodeId: target.id,
                route: target.route,
                error: describeBackendFailure(
                  parseCallApiError({
                    message:
                      error instanceof Error ? error.message : String(error),
                  }),
                ).headline,
              });
            }
          } finally {
            abortControllersRef.current.delete(streamAbort);
            activeRoutes.delete(target.route);
            done += 1;
            setRunForEpoch((current) => ({
              ...current,
              active: [...activeRoutes],
              done,
              failures: [...failures],
            }));
            void queryClient.invalidateQueries({
              queryKey: planKeys.nodes(siteId),
            });
            void queryClient.invalidateQueries({
              queryKey: planKeys.nodeEdges(target.id),
            });
          }
        },
        () => !cancelRef.current && runEpochRef.current === epoch,
      );

      if (runEpochRef.current !== epoch) return;
      inFlight.current = false;
      const cancelled = cancelRef.current;
      setRunForEpoch((current) => ({
        ...current,
        status: failures.length > 0 ? "error" : "done",
        cancelled,
        active: [],
      }));
      if (cancelled) {
        toast.info(`Bulk deepen stopped — ${done} of ${targets.length} done.`);
      } else if (failures.length > 0) {
        // callApi/parseNdjsonStream already captured every underlying failure
        // at the request/stream boundary. This aggregate stays visible without
        // manufacturing a second system_error detached from its causal detail.
        toastErrorAlreadyCaptured(
          `Bulk deepen finished with ${failures.length} failure(s) of ${targets.length}.`,
        );
      } else {
        toast.success(`Deepened ${done} page(s) — briefs and sources updated.`);
      }
    },
    [dispatch, queryClient, runSetKey, siteId],
  );

  return {
    run,
    start,
    cancel: () => {
      cancelRef.current = true;
      for (const controller of abortControllersRef.current) controller.abort();
    },
    reset: () => {
      runEpochRef.current += 1;
      cancelRef.current = true;
      for (const controller of abortControllersRef.current) controller.abort();
      abortControllersRef.current.clear();
      inFlight.current = false;
      for (const requestId of adoptedRequestIdsRef.current) {
        dispatch(removeRequest(requestId));
      }
      adoptedRequestIdsRef.current.clear();
      dispatch(clearRunSet(runSetKey));
      setRun(BULK_IDLE);
    },
    runSetKey,
  };
}
