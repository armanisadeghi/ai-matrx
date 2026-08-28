"use client";

/**
 * useFloatingWorkflowRun — THE FLOATING LAW for workflow runs, as one hook.
 *
 * "A user must never watch a spinner while AI works" (features/window-panels/
 * FEATURE.md). Every OTHER kind of run already obeyed it — agents float
 * through `useFloatingAgentRun`, marketing commands float through
 * `siteCommandRunWindow` — and workflow runs did not. A workflow run lived on
 * its own two routes and nowhere else: `useWorkflowRun` refcounts the Run
 * Stream Adapter per mount, so navigating away dropped the refcount to zero,
 * `stop()` tore the transports down, and the longest-running thing in the
 * product became invisible the moment the person did anything else.
 *
 * THE HANDOFF, which is the whole hook:
 *
 *   - MOUNTED, the surface wins. The run's own page is the better home; a
 *     floating copy of what is already on screen is noise. So mounting CLOSES
 *     any float on this run (which is also how a person coming back through
 *     the window's own door lands on the page and the float gets out of the
 *     way). This is the `visible` gate `useFloatingRunWindow` applies to agent
 *     runs, with the same reasoning.
 *   - UNMOUNTING with the run still live, the float takes over. The cleanup
 *     dispatches the window open, so by the time React has finished tearing
 *     the surface down there is already another adoption holding the run.
 *
 * Why the open lives in a cleanup rather than in the window's own logic: the
 * page IS the thing being navigated away from, so nothing above it is left to
 * notice. The last act of the surface has to be handing the run on.
 *
 * A TERMINAL run is not handed off. A run that already finished has a durable
 * record and a permalink; floating it would put a finished ledger on top of
 * wherever the person just went, forever, for having once visited its page.
 * The float is for work still in flight — including work parked on a question,
 * which is the case that matters most.
 */

import { useEffect, useRef } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closeWorkflowRunWindowAction,
  openWorkflowRunWindowAction,
} from "@/features/overlays/openers/workflowRunWindow";

import { selectRunStatus } from "../redux/workflow-runs.selectors";

/** Terminal runs are never handed off — see the header. */
const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "errored",
]);

export interface FloatingWorkflowRunOptions {
  /** The run this surface is showing. Null while it has none. */
  runId: string | null;
  /** The workflow's name, so the float's title is words rather than a uuid. */
  workflowName?: string | null;
  /**
   * nodeId → the definition's human step name. THE NO-GRAPH-IDS LAW: this
   * surface is the last thing that still holds the definition, so the labels
   * go over with the run — the window has no way to get them itself.
   */
  stepLabels?: Record<string, string> | null;
}

export function useFloatingWorkflowRun({
  runId,
  workflowName = null,
  stepLabels = null,
}: FloatingWorkflowRunOptions): void {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectRunStatus(runId ?? ""));

  // The cleanup runs after the last render, so it must read the LATEST status
  // and name rather than the ones captured when the effect was set up — a run
  // that finished while the page was open must not be handed off.
  const latest = useRef({ status, workflowName, stepLabels });
  useEffect(() => {
    latest.current = { status, workflowName, stepLabels };
  });

  useEffect(() => {
    if (!runId) return;
    // The page is on screen: it is the run's home, and the float steps aside.
    dispatch(closeWorkflowRunWindowAction(runId));
    return () => {
      const { status: finalStatus, workflowName: name, stepLabels: labels } =
        latest.current;
      // Never seen (no status yet) still counts as live — a run adopted
      // moments ago is the most important one not to lose.
      if (finalStatus !== null && TERMINAL_STATUSES.has(finalStatus)) return;
      dispatch(
        openWorkflowRunWindowAction({
          runId,
          workflowName: name,
          stepLabels: labels,
        }),
      );
    };
  }, [dispatch, runId]);
}
