/**
 * The Commission — pure presentation model (ui-reimagine wave 2).
 *
 * The paradigm: a workflow run is a COMMISSION. The page is the dossier for
 * one piece of commissioned work: the manifest (what you asked for and what
 * you'll receive), the route (every step of the making, condensing as it
 * completes), one aimed focus window on the freshest work, and the delivered
 * chapters filling their pre-declared places.
 *
 * This module is pure derivation — no React, no Redux. It turns the
 * definition-derived steps + the run's live phase map into:
 *
 *  - the CONDENSED ROUTE: at 4 steps everything is visible; at 40, finished
 *    stretches fold into "n steps done" and the far future folds into
 *    "n steps ahead", so attention always sits on now and next.
 *  - the FOLLOW TARGET: which step the focus window shows when it is in
 *    "following" mode (the freshest working step; a failure or a question
 *    outranks everything; a finished run rests on its last real work).
 */

import type { NodeAggregatePhase } from "../../redux/workflow-runs.selectors";
import type { RunStepPresentation } from "../../components/run/node-presentation";

export type StepStanding = "done" | "live" | "ahead";

export function standingOf(phase: NodeAggregatePhase | undefined): StepStanding {
  switch (phase) {
    case "settled":
    case "skipped":
      return "done";
    case "running":
    case "retrying":
    case "failed":
    case "waiting":
      return "live";
    default:
      return "ahead";
  }
}

export type RouteItem =
  | { kind: "step"; step: RunStepPresentation }
  | {
      kind: "fold";
      /** Stable key for expand/collapse state. */
      key: string;
      steps: RunStepPresentation[];
      standing: "done" | "ahead";
    };

/** Fold a run of same-standing steps only when it is at least this long —
 * shorter runs read better spelled out (a 4-step workflow never folds). */
const FOLD_MIN = 3;

/** How many upcoming steps stay individually visible before the future folds. */
const AHEAD_VISIBLE = 3;

/**
 * The condensed route. `expanded` holds fold keys the person opened —
 * an opened fold spells its steps out until they collapse it again.
 */
export function condenseRoute(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
  expanded: ReadonlySet<string>,
): RouteItem[] {
  const items: RouteItem[] = [];
  let i = 0;
  let aheadShown = 0;
  let sawLive = false;

  while (i < steps.length) {
    const standing = standingOf(phases[steps[i].nodeId]);
    if (standing === "live") {
      sawLive = true;
      items.push({ kind: "step", step: steps[i] });
      i++;
      continue;
    }

    // Collect the maximal run of the same standing.
    let j = i;
    while (j < steps.length && standingOf(phases[steps[j].nodeId]) === standing) {
      j++;
    }
    const run = steps.slice(i, j);

    if (standing === "done") {
      // Keep the most recent finished step visible (it anchors "we just did
      // this"); fold the rest of the stretch when it is long enough.
      const foldable = run.slice(0, -1);
      const anchor = run[run.length - 1];
      const key = `done:${run[0].nodeId}`;
      if (foldable.length >= FOLD_MIN && !expanded.has(key)) {
        items.push({ kind: "fold", key, steps: foldable, standing: "done" });
      } else {
        for (const step of foldable) items.push({ kind: "step", step });
      }
      items.push({ kind: "step", step: anchor });
    } else {
      // The future: after the live frontier, show the next few and fold the
      // rest. Before anything is live (intake), show everything up to the
      // visible budget then fold — the whole shape must still be present.
      const budget = Math.max(0, AHEAD_VISIBLE - (sawLive ? 0 : 0) - aheadShown);
      const visible = run.slice(0, budget);
      const rest = run.slice(budget);
      for (const step of visible) items.push({ kind: "step", step });
      aheadShown += visible.length;
      const key = `ahead:${rest[0]?.nodeId ?? "none"}`;
      if (rest.length >= FOLD_MIN && !expanded.has(key)) {
        items.push({ kind: "fold", key, steps: rest, standing: "ahead" });
      } else {
        for (const step of rest) items.push({ kind: "step", step });
      }
    }
    i = j;
  }
  return items;
}

/**
 * The step the focus window follows when nobody has aimed it.
 * Priority: a step waiting on the person (interrupt) → a failed step → the
 * LAST running step (freshest work) → the last finished step → the first.
 */
export function followTarget(
  steps: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
  interruptNodeId: string | null,
): string | null {
  if (steps.length === 0) return null;
  if (interruptNodeId && steps.some((s) => s.nodeId === interruptNodeId)) {
    return interruptNodeId;
  }
  let lastRunning: string | null = null;
  let firstFailed: string | null = null;
  let lastDone: string | null = null;
  for (const step of steps) {
    const phase = phases[step.nodeId];
    if (phase === "failed" && firstFailed === null) firstFailed = step.nodeId;
    if (phase === "running" || phase === "retrying" || phase === "waiting") {
      lastRunning = step.nodeId;
    }
    if (phase === "settled" || phase === "skipped") lastDone = step.nodeId;
  }
  return firstFailed ?? lastRunning ?? lastDone ?? steps[0].nodeId;
}

/** The promise tally an honest ending reads out: delivered vs not. */
export function promiseTally(
  deliverables: RunStepPresentation[],
  phases: Record<string, NodeAggregatePhase>,
): { delivered: RunStepPresentation[]; undelivered: RunStepPresentation[] } {
  const delivered: RunStepPresentation[] = [];
  const undelivered: RunStepPresentation[] = [];
  for (const step of deliverables) {
    (phases[step.nodeId] === "settled" ? delivered : undelivered).push(step);
  }
  return { delivered, undelivered };
}
