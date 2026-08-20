"use client";

/**
 * RunStage — THE live run experience.
 *
 * What was here before was a dashboard: a 24-column grid of small boxes, each
 * holding a spinner and a synthetic caption, with nothing on screen that a
 * person could look forward to. This is the rebuild, and it is composed the
 * way the podcast studio is composed, because that is the surface that works:
 *
 *   HERO      — what is being made, how far along, how long, and THE PROMISE:
 *               every deliverable named from the first frame (ProductionTeaser).
 *   RAIL      — the whole journey, every step of the DEFINITION present from
 *               second zero, plus the REAL activity feed: the actual tools the
 *               agents called, the engine's own phases, per-step timings
 *               (LiveProgressRail + ResearchActivityFeed).
 *   STAGE     — the authored readouts, wide enough to actually read, each one
 *               streaming its content through the canonical pipeline.
 *   ASIDES    — what the workflow deliberately showed mid-run: every
 *               `node_emitted` from a "Show on Screen" step, rendered through
 *               its authored component when it has one (RunEmissions).
 *   DELIVER   — the finished shapes appearing one by one as their real kind
 *               components (MediaOptionsGrid).
 *
 * Two laws hold the composition together. The surface only ever GROWS —
 * deliverables land at the BOTTOM, the hero reserves its lines, and nothing
 * that has rendered is unmounted because data arrived. And nothing here parses
 * a stream: every token reaches the screen through LiveRunDisplay /
 * MarkdownStream / the kind registry.
 */

import { useEffect, useMemo, useRef } from "react";

import { useAppSelector } from "@/lib/redux/hooks";

import { selectNodeAggregatePhases } from "../../redux/workflow-runs.selectors";
import {
  deriveDefaultSurfaceConfig,
  type ProgressRailSource,
  type RunSurfaceConfig,
} from "../../surface/config";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import { InterruptCard } from "../readout-parts";
import { RunSurfaceView } from "../RunSurfaceView";
import { RunActivityFeed } from "./RunActivityFeed";
import { RunDeliverables } from "./RunDeliverables";
import { RunEmissions } from "./RunEmissions";
import { RunFailureCard } from "./RunFailureCard";
import { RunHero } from "./RunHero";
import { RunJourney } from "./RunJourney";
import {
  deliverableSteps,
  describeWorkflowSteps,
  type RunStepPresentation,
} from "./node-presentation";

/**
 * Every synthetic sub-step the author declared anywhere in the config, merged
 * into one map. The rail used to only see the sub-steps of whichever page was
 * showing; the journey narrates the WHOLE run, so it reads them all.
 */
function collectSyntheticSteps(
  config: RunSurfaceConfig,
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const readout of config.readouts) {
    if (readout.source.kind !== "progressRail") continue;
    const source = readout.source as ProgressRailSource;
    for (const [nodeId, labels] of Object.entries(
      source.syntheticSteps ?? {},
    )) {
      if (!merged[nodeId]) merged[nodeId] = labels;
    }
  }
  return merged;
}

/**
 * The deliverables the STAGE does not already show. When an author has placed
 * a deliverable on one of their own pages, that placement wins — rendering the
 * same kind component twice on one screen is the duplication the canonical
 * component law exists to prevent, and the author's layout is the intent. The
 * section then carries exactly what the surface leaves out (on Study Pack:
 * the assembled study pack, which no page renders).
 */
function undisplayedDeliverables(
  deliverables: RunStepPresentation[],
  config: RunSurfaceConfig,
): RunStepPresentation[] {
  const shown = new Set<string>();
  for (const readout of config.readouts) {
    if (readout.source.kind === "node") shown.add(readout.source.nodeId);
    if (readout.source.kind === "group") {
      for (const nodeId of readout.source.nodeIds) shown.add(nodeId);
    }
  }
  return deliverables.filter((step) => !shown.has(step.nodeId));
}

/** Keeps the step that is working right now inside the rail's own viewport. */
function useFollowRunningStep(
  steps: RunStepPresentation[],
  phases: Record<string, string | undefined>,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const runningId =
    steps.find((step) => {
      const phase = phases[step.nodeId];
      return phase === "running" || phase === "retrying";
    })?.nodeId ?? null;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !runningId) return;
    const row = container.querySelector<HTMLElement>(
      `[data-step-id="${CSS.escape(runningId)}"]`,
    );
    if (!row) return;
    // Scroll the RAIL only — never `scrollIntoView`, which would yank the whole
    // page while the reader is reading the stage. Measured from the two rects
    // (the row's offsetParent is not the scroll container, so offset arithmetic
    // lands on the wrong step), and PARKED a third of the way down rather than
    // merely "nearest": a nearest-fit scroll leaves the live step flush against
    // an edge, one row from invisible, which is the one row that must never be
    // off screen.
    const rowRect = row.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    const target =
      container.scrollTop +
      (rowRect.top - boxRect.top) -
      container.clientHeight / 3;
    container.scrollTop = Math.max(0, target);
  }, [runningId]);

  return scrollRef;
}

export function RunStage({
  runId,
  definition,
  workflowName,
  workflowDescription,
  config,
  /** Wired to the surface's own Run verb when it has one. */
  onRetry,
}: {
  runId: string;
  definition: WorkflowDefinitionLike;
  workflowName: string;
  workflowDescription?: string | null;
  /** The authored surface. Absent → derived from the definition. */
  config?: RunSurfaceConfig | null;
  onRetry?: () => void;
}) {
  const steps = useMemo(() => describeWorkflowSteps(definition), [definition]);
  const deliverables = useMemo(() => deliverableSteps(steps), [steps]);
  const surface = useMemo(
    () => config ?? deriveDefaultSurfaceConfig(definition),
    [config, definition],
  );
  const synthetic = useMemo(() => collectSyntheticSteps(surface), [surface]);
  const ownDeliverables = useMemo(
    () => undisplayedDeliverables(deliverables, surface),
    [deliverables, surface],
  );
  const stepLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const step of steps) labels[step.nodeId] = step.label;
    return labels;
  }, [steps]);

  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const railRef = useFollowRunningStep(steps, phases);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 px-3 py-3 sm:px-5 sm:py-4">
      <RunHero
        runId={runId}
        workflowName={workflowName}
        workflowDescription={workflowDescription}
        steps={steps}
        deliverables={deliverables}
        totalSteps={steps.length}
      />

      <RunFailureCard
        runId={runId}
        stepLabels={stepLabels}
        whatItRan={workflowName}
        onRetry={onRetry}
      />
      <InterruptCard runId={runId} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* The rail comes FIRST on mobile — on a phone, "what is happening"
            outranks the content that is still being written. */}
        <aside className="order-1 space-y-3 lg:order-2 lg:sticky lg:top-2 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-border bg-card/40">
            <div className="border-b border-border/60 px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                The plan
              </h2>
            </div>
            <div
              ref={railRef}
              className="max-h-[22rem] overflow-y-auto px-3 py-2.5 lg:max-h-[28rem]"
            >
              <RunJourney
                runId={runId}
                steps={steps}
                syntheticSteps={synthetic}
              />
            </div>
          </div>

          <RunActivityFeed runId={runId} stepLabels={stepLabels} />
        </aside>

        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <RunSurfaceView
            runId={runId}
            definition={definition}
            config={surface}
            hideRunStatusCards
            hideProgressRails
          />
          <RunEmissions runId={runId} stepLabels={stepLabels} />
          <RunDeliverables runId={runId} deliverables={ownDeliverables} />
        </div>
      </div>
    </div>
  );
}
