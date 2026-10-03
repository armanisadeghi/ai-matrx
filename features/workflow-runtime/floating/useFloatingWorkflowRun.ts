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
 * THE REMOUNT LAW (Arman, 2026-10-02): a remount is not leaving. The handoff
 * waits a grace window after the last home of the run goes, and a home of the
 * same run mounting inside it cancels it — so React's dev double mount, a
 * re-render that remounts the stage, or two homes of one run never pop the
 * window. A surface that is NOT the run's home on a page (a board tile, which
 * keeps the run through its `Keep` while it sleeps) passes
 * `floatOnLeave: false`: it never closes a float the person opened, and its
 * sleeping, waking or removal never opens one.
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
import { runIsOver } from "../types";

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
  /**
   * This surface is the run's home on a page: close the float while it is on
   * screen and hand the run to the float when it leaves. False for a view that
   * is not the run's page (a board tile). Default true.
   */
  floatOnLeave?: boolean;
}

/** How long after the run's last home leaves the float takes over. */
export const FLOAT_HANDOFF_GRACE_MS = 1_000;

interface RunHomes {
  count: number;
  handoff: ReturnType<typeof setTimeout> | null;
}

/** Per store: runId → the homes of that run on screen now, and a pending handoff. */
const homesByStore = new WeakMap<object, Map<string, RunHomes>>();

function homesFor(dispatch: object): Map<string, RunHomes> {
  let homes = homesByStore.get(dispatch);
  if (!homes) {
    homes = new Map();
    homesByStore.set(dispatch, homes);
  }
  return homes;
}

export function useFloatingWorkflowRun({
  runId,
  workflowName = null,
  stepLabels = null,
  floatOnLeave = true,
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
    if (!runId || !floatOnLeave) return;
    const homesByRun = homesFor(dispatch);
    let homes = homesByRun.get(runId);
    if (homes) {
      // Another home of this run is on screen, or one just left and its
      // handoff is pending: this is a remount, the float was never opened.
      homes.count += 1;
      if (homes.handoff !== null) {
        clearTimeout(homes.handoff);
        homes.handoff = null;
      }
    } else {
      homes = { count: 1, handoff: null };
      homesByRun.set(runId, homes);
      // The page is on screen: it is the run's home, and the float steps aside.
      dispatch(closeWorkflowRunWindowAction(runId));
    }
    const held = homes;
    return () => {
      held.count -= 1;
      if (held.count > 0) return;
      held.handoff = setTimeout(() => {
        held.handoff = null;
        if (held.count > 0 || homesByRun.get(runId) !== held) return;
        homesByRun.delete(runId);
        const { status: finalStatus, workflowName: name, stepLabels: labels } =
          latest.current;
        // Never seen (no status yet) still counts as live — a run adopted
        // moments ago is the most important one not to lose.
        // A run that is over is never handed off — see the header.
        if (runIsOver(finalStatus)) return;
        dispatch(
          openWorkflowRunWindowAction({
            runId,
            workflowName: name,
            stepLabels: labels,
          }),
        );
      }, FLOAT_HANDOFF_GRACE_MS);
    };
  }, [dispatch, runId, floatOnLeave]);
}
