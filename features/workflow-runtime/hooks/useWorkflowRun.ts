"use client";

/**
 * useWorkflowRun — attach the Run Stream Adapter to a run for the life of a
 * surface. One adoption per runId per page (a module-level registry refcounts
 * mounts, so two components watching the same run share one adapter and one
 * set of transports).
 *
 * THE REMOUNT LAW (Arman, 2026-10-02): adopting is idempotent per run. When
 * the last holder lets go, the adoption outlives it for a grace window; a
 * holder arriving inside it (a remount, a board tile woken from sleep, remove +
 * undo, the run handed to its floating window) reattaches to the SAME
 * adoption — no re-read, no replay, no second set of transports or timers.
 * The run's state lives in the workflowRuns slice throughout.
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
  /** Pending stop after the last holder let go; cleared by a new holder. */
  stopTimer: ReturnType<typeof setTimeout> | null;
}

/** How long an adoption outlives its last holder (remount / undo / handoff window). */
export const ADOPTION_RELEASE_GRACE_MS = 15_000;

/** One adapter per runId per store (the page has one store; tests make many). */
const adoptionsByStore = new WeakMap<object, Map<string, AdoptionEntry>>();

function adoptionsFor(dispatch: object): Map<string, AdoptionEntry> {
  let adoptions = adoptionsByStore.get(dispatch);
  if (!adoptions) {
    adoptions = new Map();
    adoptionsByStore.set(dispatch, adoptions);
  }
  return adoptions;
}

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
    const adoptions = adoptionsFor(dispatch);
    let entry = adoptions.get(runId);
    if (entry) {
      entry.refCount++;
      if (entry.stopTimer !== null) {
        clearTimeout(entry.stopTimer);
        entry.stopTimer = null;
      }
    } else {
      entry = {
        handle: dispatch(adoptWorkflowRun({ runId })),
        refCount: 1,
        stopTimer: null,
      };
      adoptions.set(runId, entry);
    }
    handleRef.current = entry.handle;
    const held = entry;
    return () => {
      handleRef.current = null;
      held.refCount--;
      if (held.refCount > 0) return;
      held.stopTimer = setTimeout(() => {
        held.stopTimer = null;
        if (held.refCount > 0 || adoptions.get(runId) !== held) return;
        held.handle.stop();
        adoptions.delete(runId);
      }, ADOPTION_RELEASE_GRACE_MS);
    };
  }, [runId, dispatch]);

  return {
    ensureLane: (targetRunId: string, invocationKey: string, seedText?: string) =>
      handleRef.current?.ensureLane(targetRunId, invocationKey, seedText) ??
      null,
  };
}
