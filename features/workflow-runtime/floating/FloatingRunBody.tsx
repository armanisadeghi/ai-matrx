"use client";

/**
 * FloatingRunBody — a workflow run, small enough to float.
 *
 * The content of the floating run window, and NOTHING about being a window:
 * no `WindowPanel` import, no chrome, no frame. That is deliberate — this is a
 * route-shared unit that drops into the window's body slot, so the bundle law
 * holds (a route that ever renders this never drags the window stack in) and
 * the same three facts could be shown anywhere else that needs them.
 *
 * It shows the three things a person who NAVIGATED AWAY needs, in the order
 * they need them:
 *
 *   1. WAITING FIRST. A run parked on a question is not "still working" — it
 *      is stopped until a human moves, and it must say so louder than
 *      anything else on screen. A person cannot answer a question they cannot
 *      see; that is the whole reason a run gets to follow them off its page.
 *   2. WHAT IT IS DOING — the one liveness line (`currentLivenessLine`), fed
 *      by the closed `AgentStepPhase` vocabulary.
 *   3. HOW FAR ALONG — the canonical `ProgressRailReadout`, the same steps
 *      rail the full page draws, so the float and the page can never narrate
 *      one run two different ways.
 *
 * Everything is read from the workflowRuns selectors by `runId`. Nothing here
 * adopts the run — the window root owns that (`useWorkflowRun`), which is what
 * actually keeps the stream alive across navigation.
 */

import { Loader2 } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  selectRunActivity,
  selectRunInterrupt,
  selectRunStatus,
} from "../redux/workflow-runs.selectors";
import { ProgressRailReadout } from "../components/ProgressRailReadout";
import { parseInterruptPayload } from "../interrupt/interrupt-view";
import { currentLivenessLine } from "./run-liveness";

/** Statuses where the run is parked on a person, not on the engine. */
const WAITING_STATUSES = new Set(["interrupted", "awaiting_input", "paused"]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "errored",
]);

const NO_STEP_LABELS: Record<string, string> = {};

export function FloatingRunBody({
  runId,
  stepLabels = NO_STEP_LABELS,
}: {
  runId: string;
  /**
   * nodeId → the definition's human step name, handed over by the surface
   * that gave this run up (`useFloatingWorkflowRun`). Absent only when a
   * float was opened by something with no definition in hand; node ids then
   * humanise, which reads roughly but never lies.
   */
  stepLabels?: Record<string, string>;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const activity = useAppSelector(selectRunActivity(runId));
  const interrupt = useAppSelector(selectRunInterrupt(runId));

  const waiting = interrupt !== null || (status !== null && WAITING_STATUSES.has(status));
  const terminal = status !== null && TERMINAL_STATUSES.has(status);
  const live = !terminal && !waiting;

  const line = currentLivenessLine(activity, stepLabels);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-3 py-2.5">
      {waiting ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            {interrupt ? "It needs your answer" : "Waiting on you"}
          </p>
          <p className="mt-0.5 line-clamp-3 text-xs text-foreground">
            {interrupt
              ? parseInterruptPayload(interrupt.payload).prompt
              : "This run is paused until you pick it back up."}
          </p>
        </div>
      ) : null}

      <div className="flex items-start gap-1.5">
        {live ? (
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : null}
        <p
          className={cn(
            "min-w-0 text-xs",
            live ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {line ? (
            <>
              {line.stepLabel ? (
                <span className="font-medium">{line.stepLabel} · </span>
              ) : null}
              {line.text}
              {line.detail ? (
                <span className="text-muted-foreground"> · {line.detail}</span>
              ) : null}
            </>
          ) : (
            "Starting…"
          )}
        </p>
      </div>

      <ProgressRailReadout runId={runId} nodeLabels={stepLabels} />
    </div>
  );
}
