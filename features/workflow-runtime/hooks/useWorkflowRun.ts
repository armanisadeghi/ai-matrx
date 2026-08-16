"use client";

/**
 * useWorkflowRun — attach the Run Stream Adapter to a run for the life of a
 * surface. One adoption per runId per page (a module-level registry refcounts
 * mounts, so two components watching the same run share one adapter and one
 * set of transports).
 *
 * Returns the adapter handle pieces a surface needs: the promotion API
 * (viewer-driven lane creation within the budget) — all STATE reads go
 * through the workflowRuns selectors, never through this hook.
 */

import { useEffect, useRef } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";

import {
  adoptWorkflowRun,
  type AdoptedWorkflowRun,
} from "../redux/adopt-workflow-run.thunk";

interface AdoptionEntry {
  handle: AdoptedWorkflowRun;
  refCount: number;
}

/** One adapter per runId across the whole page. */
const adoptions = new Map<string, AdoptionEntry>();

export interface UseWorkflowRunResult {
  /**
   * Promote a node invocation to a streaming lane. Returns the lane's
   * requestId (for `<MarkdownStream requestId/>` / `<LiveRunDisplay/>`) or
   * null when the lane budget refuses. Idempotent per invocation.
   *
   * `targetRunId` may be any run in this adoption's tree (the root or a
   * linked child — the lane budget spans the tree). `seedText` starts a NEW
   * lane with the tracked tail so promotion keeps the visible history.
   */
  ensureLane: (
    targetRunId: string,
    invocationKey: string,
    seedText?: string,
  ) => string | null;
}

export function useWorkflowRun(runId: string | null): UseWorkflowRunResult {
  const dispatch = useAppDispatch();
  const handleRef = useRef<AdoptedWorkflowRun | null>(null);

  useEffect(() => {
    if (!runId) return;
    const existing = adoptions.get(runId);
    if (existing) {
      existing.refCount++;
      handleRef.current = existing.handle;
    } else {
      const handle = dispatch(adoptWorkflowRun({ runId }));
      adoptions.set(runId, { handle, refCount: 1 });
      handleRef.current = handle;
    }
    return () => {
      const entry = adoptions.get(runId);
      handleRef.current = null;
      if (!entry) return;
      entry.refCount--;
      if (entry.refCount <= 0) {
        entry.handle.stop();
        adoptions.delete(runId);
      }
    };
  }, [runId, dispatch]);

  return {
    ensureLane: (targetRunId: string, invocationKey: string, seedText?: string) =>
      handleRef.current?.ensureLane(targetRunId, invocationKey, seedText) ??
      null,
  };
}
