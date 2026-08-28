/**
 * THE RUN CONTROL MODEL — which lifecycle verb a run's status allows, and the
 * plain-language reason when it does not.
 *
 * Census #34: the shipped run page had no controls at all. The verbs already
 * existed (`useWorkflowRunControls`: pause / resumePaused / cancel / retryNode
 * / skipNode); nothing surfaced them, so a run that went wrong could only be
 * abandoned. This module is the decision half, kept pure so the rule is
 * testable and so every surface that grows a control bar makes the same call.
 *
 * THE LAW THIS ENCODES: a verb a status forbids is DISABLED WITH ITS REASON,
 * never hidden. A control that disappears teaches nobody why; a control that
 * says "this run has already finished" teaches in one word. Hiding is reserved
 * for a verb that can never apply to this run at all.
 *
 * No React, no Redux, no fetch — a total function over the status union.
 */

import type { WorkflowRunStatus } from "@/types/python-generated/workflow-events";
import { TERMINAL_RUN_STATUSES } from "@/types/python-generated/workflow-events";

/** The verbs a person can aim at a whole run from the run page. */
export type RunControlVerb = "pause" | "resume" | "stop" | "cancel";

export interface VerbAvailability {
  enabled: boolean;
  /** Why not — reader's language, shown as the disabled control's title. */
  reason: string | null;
}

/** Null = the run has not reported a status yet (adopting the stream). */
export type RunStatusOrPending = WorkflowRunStatus | null;

function isTerminal(status: RunStatusOrPending): boolean {
  return status !== null && TERMINAL_RUN_STATUSES.has(status);
}

/**
 * A run that is not running and not finished: it is sitting there, waiting for
 * something. `paused` waits for a resume; `interrupted` / `awaiting_input`
 * wait for an ANSWER, which is a different verb and a different surface (the
 * interrupt card), which is why they are parked but not resumable.
 */
export function isParked(status: RunStatusOrPending): boolean {
  return (
    status === "paused" ||
    status === "interrupted" ||
    status === "awaiting_input"
  );
}

/** True while the scheduler is (or is about to be) making progress. */
export function isInFlight(status: RunStatusOrPending): boolean {
  return (
    status === "running" ||
    status === "pending" ||
    status === "pausing" ||
    status === "cancelling"
  );
}

const FINISHED = "This run has already finished.";
const NOT_YET = "Waiting for this run to report in.";

export function verbAvailability(
  verb: RunControlVerb,
  status: RunStatusOrPending,
): VerbAvailability {
  if (status === null) return { enabled: false, reason: NOT_YET };
  if (isTerminal(status)) return { enabled: false, reason: FINISHED };

  switch (verb) {
    case "pause":
      if (status === "pausing") {
        return { enabled: false, reason: "It is already stopping to wait." };
      }
      if (status === "cancelling") {
        return { enabled: false, reason: "It is already being stopped." };
      }
      if (isParked(status)) {
        return { enabled: false, reason: "It is already waiting." };
      }
      return { enabled: true, reason: null };

    case "resume":
      if (status === "paused") return { enabled: true, reason: null };
      if (status === "interrupted" || status === "awaiting_input") {
        return {
          enabled: false,
          reason: "It is waiting on your answer — answer it above to carry on.",
        };
      }
      if (status === "pausing") {
        return {
          enabled: false,
          reason: "It is still finishing the step it was on.",
        };
      }
      return { enabled: false, reason: "It is already going." };

    case "stop":
    case "cancel":
      if (status === "cancelling") {
        return { enabled: false, reason: "It is already being stopped." };
      }
      return { enabled: true, reason: null };
  }
}

/**
 * Per-step verbs. Retry re-runs the step that broke; skip moves past it. Both
 * are meaningless on a run that is over, and on a step that never failed.
 *
 * `skipped` is deliberately retryable: a step skipped by mistake (or by a
 * condition that has since been answered) is exactly the case a person needs
 * to undo, and the engine accepts the retry.
 */
export type NodeControlVerb = "retry" | "skip";

export function nodeVerbAvailability(
  verb: NodeControlVerb,
  runStatus: RunStatusOrPending,
  nodePhase: string | undefined,
): VerbAvailability {
  if (isTerminal(runStatus)) return { enabled: false, reason: FINISHED };
  if (runStatus === null) return { enabled: false, reason: NOT_YET };

  const failed = nodePhase === "failed";
  const skipped = nodePhase === "skipped";

  if (verb === "retry") {
    if (failed || skipped) return { enabled: true, reason: null };
    return {
      enabled: false,
      reason: "Only a step that stopped can be run again.",
    };
  }
  // skip
  if (failed) return { enabled: true, reason: null };
  return {
    enabled: false,
    reason: "Only a step that stopped can be skipped past.",
  };
}

/** True when a step should offer retry/skip at all (the row grows controls). */
export function stepOffersControls(
  runStatus: RunStatusOrPending,
  nodePhase: string | undefined,
): boolean {
  return (
    !isTerminal(runStatus) &&
    runStatus !== null &&
    (nodePhase === "failed" || nodePhase === "skipped")
  );
}

/** The one-line state of the run, for the control bar's own label. */
export function runStateLabel(status: RunStatusOrPending): string {
  switch (status) {
    case null:
      return "Getting ready";
    case "pending":
      return "Starting";
    case "running":
      return "Working";
    case "pausing":
      return "Stopping to wait";
    case "paused":
      return "Waiting — you can carry on";
    case "interrupted":
    case "awaiting_input":
      return "Waiting on your answer";
    case "cancelling":
      return "Stopping";
    case "cancelled":
      return "Stopped";
    case "completed":
      return "Finished";
    case "errored":
      return "Hit a problem";
    case "failed":
      return "Didn't finish";
  }
}
