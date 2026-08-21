/**
 * camera.ts — the pure brain of the Courier concept (ui-reimagine bake-off).
 *
 * The paradigm: a workflow run is presented as a PACKAGE BEING DELIVERED
 * (reference products: Flighty's live flight page × the Domino's tracker).
 * One camera follows the work; this module decides where it points and what
 * the one-sentence marquee says. Pure — no React, no Redux — so every rule
 * here is testable and the components stay dumb.
 */

import type { NodeAggregatePhase } from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import type { RunStepPresentation } from "@/features/workflow-runtime/components/run/node-presentation";

/**
 * Where the camera looks when the viewer hasn't pinned it: the person's own
 * question first (an interrupt), else the freshest working step, else the
 * last step that has done anything, else the start of the route.
 */
export function pickFollowedNode(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
  pinnedNodeId: string | null,
  interruptNodeId: string | null,
): string | null {
  if (pinnedNodeId && steps.some((s) => s.nodeId === pinnedNodeId)) {
    return pinnedNodeId;
  }
  if (interruptNodeId && steps.some((s) => s.nodeId === interruptNodeId)) {
    return interruptNodeId;
  }
  let lastActive: string | null = null;
  let lastTouched: string | null = null;
  for (const step of steps) {
    const phase = phases[step.nodeId] ?? "idle";
    if (phase === "running" || phase === "retrying" || phase === "waiting") {
      lastActive = step.nodeId;
    }
    if (phase !== "idle") lastTouched = step.nodeId;
  }
  return lastActive ?? lastTouched ?? steps[0]?.nodeId ?? null;
}

/** How many steps of the route are finished (settled or skipped). */
export function doneCount(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
): number {
  let done = 0;
  for (const step of steps) {
    const phase = phases[step.nodeId];
    if (phase === "settled" || phase === "skipped") done++;
  }
  return done;
}

/**
 * The marquee's one plain sentence. Never the raw enum, never jargon — the
 * words a package tracker would use.
 */
export function marqueeSentence(
  status: string | null,
  done: number,
  total: number,
): string {
  switch (status) {
    case null:
      return "Connecting to the work…";
    case "pending":
      return "Getting ready to start";
    case "running":
      return total > 0 ? `In the works — ${done} of ${total} steps done` : "In the works";
    case "pausing":
      return "Pausing…";
    case "paused":
      return "Paused — pick it back up whenever you like";
    case "interrupted":
      return "It needs a quick answer from you";
    case "cancelling":
      return "Stopping…";
    case "cancelled":
      return "Stopped before the finish";
    case "completed":
      return "Delivered";
    case "failed":
    case "errored":
      return "It ran into a problem";
    default:
      return status;
  }
}

/** One row of the route line: a step, or a folded run of finished steps. */
export type JourneyRow =
  | { kind: "step"; step: RunStepPresentation }
  | { kind: "fold"; steps: RunStepPresentation[] };

/**
 * The route line shows EVERY step from frame zero — but at 40 steps a wall of
 * identical rows is unreadable, so consecutive FINISHED steps fold into one
 * "n steps done" bead (expandable). Short routes (≤ 8 steps) never fold, and
 * the followed step never folds, so a 4-step workflow reads as 4 plain rows.
 */
export function compressJourney(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
  followedNodeId: string | null,
  expandedFolds: ReadonlySet<string>,
): JourneyRow[] {
  if (steps.length <= 8) return steps.map((step) => ({ kind: "step", step }));
  const rows: JourneyRow[] = [];
  let buffer: RunStepPresentation[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    if (buffer.length < 3 || expandedFolds.has(buffer[0].nodeId)) {
      for (const step of buffer) rows.push({ kind: "step", step });
    } else {
      rows.push({ kind: "fold", steps: buffer });
    }
    buffer = [];
  };
  for (const step of steps) {
    const phase = phases[step.nodeId] ?? "idle";
    const finished = phase === "settled" || phase === "skipped";
    if (finished && step.nodeId !== followedNodeId) {
      buffer.push(step);
    } else {
      flush();
      rows.push({ kind: "step", step });
    }
  }
  flush();
  return rows;
}
