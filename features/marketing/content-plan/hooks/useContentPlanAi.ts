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
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

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

export interface PlanAiRunState {
  status: "idle" | "running" | "done" | "error";
  /** Live server phase line ("Wave 2/3: competitor coverage…"). */
  stage?: string;
  error?: string;
}

const IDLE: PlanAiRunState = { status: "idle" };

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

  const start = useCallback(
    async (options?: { maxNodes?: number; guidance?: string }) => {
      if (!siteId || inFlight.current) return;
      inFlight.current = true;
      setRun({ status: "running", stage: "Starting the generator…" });
      let streamFailure: string | null = null;

      const result = await dispatch(
        callApi({
          path: "/content-plan/sites/{site_id}/generate",
          method: "POST",
          pathParams: { site_id: siteId },
          body: {
            max_nodes: options?.maxNodes ?? 40,
            guidance: options?.guidance ?? null,
            apply: true,
          },
          stream: true,
          onStreamEvent: (event) => {
            const stage = readPhaseMessage(event);
            if (stage) {
              setRun((current) => ({ ...current, stage }));
            }
            if (event.event === "data") {
              // Nodes may land mid-stream (apply=true) — show them live.
              void queryClient.invalidateQueries({
                queryKey: planKeys.nodes(siteId),
              });
            }
            if (event.event === "error") {
              streamFailure = describeBackendFailure(
                parseStreamError(event.data),
              ).headline;
            }
          },
        }),
      );

      inFlight.current = false;
      // Whatever happened, the server may have written nodes — refetch.
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      void queryClient.invalidateQueries({ queryKey: planKeys.siteStats() });

      if (result.error) {
        const explanation = describeBackendFailure(
          parseCallApiError(result.error),
        );
        setRun({ status: "error", error: explanation.headline });
        toast.error(`Plan generation failed: ${explanation.headline}`);
        return;
      }
      if (streamFailure) {
        setRun({ status: "error", error: streamFailure });
        toast.error(`Plan generation failed: ${streamFailure}`);
        return;
      }
      setRun({ status: "done" });
      toast.success("Plan generation finished — the tree is up to date.");
    },
    [dispatch, queryClient, siteId],
  );

  return { run, start, reset: () => setRun(IDLE) };
}

/** Deepen ONE node: server writes brief lines + sources onto it. */
export function usePlanDeepen(siteId: string | null) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [run, setRun] = useState<PlanAiRunState>(IDLE);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const start = useCallback(
    async (targetNodeId: string) => {
      if (!siteId || inFlight.current) return;
      inFlight.current = true;
      setNodeId(targetNodeId);
      setRun({ status: "running", stage: "Deepening (brief + sources)…" });
      let streamFailure: string | null = null;

      const result = await dispatch(
        callApi({
          path: "/content-plan/nodes/{node_id}/deepen",
          method: "POST",
          pathParams: { node_id: targetNodeId },
          stream: true,
          onStreamEvent: (event) => {
            const stage = readPhaseMessage(event);
            if (stage) setRun((current) => ({ ...current, stage }));
            if (event.event === "error") {
              streamFailure = describeBackendFailure(
                parseStreamError(event.data),
              ).headline;
            }
          },
        }),
      );

      inFlight.current = false;
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      void queryClient.invalidateQueries({
        queryKey: planKeys.nodeEdges(targetNodeId),
      });

      if (result.error) {
        const explanation = describeBackendFailure(
          parseCallApiError(result.error),
        );
        setRun({ status: "error", error: explanation.headline });
        toast.error(`Deepen failed: ${explanation.headline}`);
        return;
      }
      if (streamFailure) {
        setRun({ status: "error", error: streamFailure });
        toast.error(`Deepen failed: ${streamFailure}`);
        return;
      }
      setRun({ status: "done" });
      toast.success("Node deepened — brief and sources updated.");
    },
    [dispatch, queryClient, siteId],
  );

  return { run, nodeId, start, reset: () => setRun(IDLE) };
}
