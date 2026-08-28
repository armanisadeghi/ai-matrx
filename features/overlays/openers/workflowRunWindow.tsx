"use client";

/**
 * Opener for the `workflowRunWindow` overlay — the floating home a workflow
 * run falls back to when no page is holding it.
 *
 * Almost nobody calls this directly. The adapter that owns the handoff is
 * `features/workflow-runtime/floating/useFloatingWorkflowRun.ts`: a run
 * surface mounts that hook, and the window opens by itself the moment the
 * surface goes away with the run still live. Reach for these only to open (or
 * close) a run's float from somewhere that has no run surface at all.
 *
 * The instance id is derived from the run id (`workflowRunWindowInstanceId`),
 * so a run has exactly ONE float no matter how many times it is opened —
 * navigating away and back does not stack a second window on the same run.
 */

import { useCallback } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "workflowRunWindow" as const;

export interface OpenWorkflowRunWindowOptions {
  /** The run to follow. Adopting it in the window is what keeps it alive. */
  runId: string;
  /** The workflow's name, so the title is words rather than a uuid. */
  workflowName?: string | null;
  /**
   * nodeId → the definition's human step name.
   *
   * 🚨 Not a nicety — THE NO-GRAPH-IDS LAW. The window renders at the root of
   * the tree, outside every provider that knows the workflow, so without this
   * the float narrates a run in node ids: "T in · Started", "io.user_input".
   * The surface handing the run over is the last thing that still has the
   * definition, so it hands the labels over with it. Plain JSON, small, and
   * it travels once at handoff rather than being refetched by the window.
   */
  stepLabels?: Record<string, string> | null;
}

/** ONE float per run — the identity is the run, not the click. */
export function workflowRunWindowInstanceId(runId: string): string {
  return `workflow-run:${runId}`;
}

/**
 * The plain action, for code that cannot run a hook — including a React
 * cleanup function, which is exactly where the handoff happens.
 */
export function openWorkflowRunWindowAction(
  opts: OpenWorkflowRunWindowOptions,
) {
  const instanceId = workflowRunWindowInstanceId(opts.runId);
  return openOverlay({
    overlayId: OVERLAY_ID,
    instanceId,
    data: {
      windowInstanceId: instanceId,
      runId: opts.runId,
      workflowName: opts.workflowName ?? null,
      stepLabels: opts.stepLabels ?? null,
    },
  });
}

/** Close a run's float — the page it belongs to is back on screen. */
export function closeWorkflowRunWindowAction(runId: string) {
  return closeOverlay({
    overlayId: OVERLAY_ID,
    instanceId: workflowRunWindowInstanceId(runId),
  });
}

export function useOpenWorkflowRunWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenWorkflowRunWindowOptions) => {
      dispatch(openWorkflowRunWindowAction(opts));
    },
    [dispatch],
  );
}

export function useCloseWorkflowRunWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (runId: string) => {
      dispatch(closeWorkflowRunWindowAction(runId));
    },
    [dispatch],
  );
}
