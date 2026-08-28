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
 *   SHOWCASE  — the ONE thing the author staged for the person to look at,
 *               page-centered, reserved from the declared contract before the
 *               run exists (ShowcaseSlot).
 *   DELIVER   — the declared deliverables as reserved slots that their own
 *               settled output or claimed emission fills in, and beneath them
 *               every emission no slot claimed (DeliveredStream).
 *
 * Two laws hold the composition together. The surface only ever GROWS —
 * deliverables land at the BOTTOM, the hero reserves its lines, and nothing
 * that has rendered is unmounted because data arrived. And nothing here parses
 * a stream: every token reaches the screen through LiveRunDisplay /
 * MarkdownStream / the kind registry.
 *
 * ─── Volley 5: THE EMISSION CONTRACT, adopted ───────────────────────────────
 * The mid-run asides and the finished goods used to be two independent
 * sections — `RunEmissions` walked `run.emissions` and `RunDeliverables`
 * walked the DEFINITION for producer steps — with nothing joining them, so a
 * "Show on Screen" node that was also a deliverable could promise the same
 * payload twice under two names. SPEC-workflow-ui-contract §3 is the rule that
 * ends that, and `kind-emissions/` is the proven implementation of it:
 * `useResultSchema` reserves the slots from the SERVED promise before a run
 * exists, `splitByPresentation` lifts the one staged reveal out of the stream,
 * and `DeliveredStream` owns the dedupe (widened key: a deliverable that
 * declares NO kind claims any emission from its own node) so the two halves
 * can never disagree.
 *
 * A result schema that cannot be read is NOT a dead page — it degrades to the
 * definition-derived deliverables shelf plus the raw emission stream, which is
 * exactly what this stage showed before the contract existed.
 *
 * 🚨 The `workflow-emit` import boundary (D115) still binds this file — see
 * `RunEmissions.tsx:29-39`. Emission rendering reaches that feature only
 * through `kind-emissions/EmissionRender`, which imports `DbEmitRenderer` and
 * nothing else.
 */

import { useEffect, useMemo, useRef } from "react";

import { useAppSelector } from "@/lib/redux/hooks";

import { useFloatingWorkflowRun } from "../../floating/useFloatingWorkflowRun";

import {
  selectNodeAggregatePhases,
  selectRunEmissions,
  selectRunStatus,
} from "../../redux/workflow-runs.selectors";
import { DeliveredStream } from "../../kind-emissions/DeliveredStream";
import { splitByPresentation } from "../../kind-emissions/emission-routing";
import {
  panelDeliverables,
  showcaseDeliverables,
} from "../../kind-emissions/result-schema";
import { ShowcaseSlot } from "../../kind-emissions/ShowcaseSlot";
import {
  resultSchemaOrNull,
  useResultSchema,
} from "../../kind-emissions/useResultSchema";
import {
  deriveDefaultSurfaceConfig,
  type ProgressRailSource,
  type RunSurfaceConfig,
} from "../../surface/config";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import { useInterruptQuestion } from "../../interrupt/InterruptQuestion";
import { RunDecisions } from "../../interrupt/RunDecisions";
import { InterruptCard, RunResultCard } from "../readout-parts";
import { RunSurfaceView } from "../RunSurfaceView";
import { RunActivityFeed } from "./RunActivityFeed";
import { RunControlBar } from "./RunControlBar";
import { RunDeliverables } from "./RunDeliverables";
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
    if (!source.syntheticSteps) continue;
    for (const [nodeId, labels] of Object.entries(source.syntheticSteps)) {
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
function surfaceShownNodeIds(config: RunSurfaceConfig): Set<string> {
  const shown = new Set<string>();
  for (const readout of config.readouts) {
    if (readout.source.kind === "node") shown.add(readout.source.nodeId);
    if (readout.source.kind === "group") {
      for (const nodeId of readout.source.nodeIds) shown.add(nodeId);
    }
  }
  return shown;
}

function undisplayedDeliverables(
  deliverables: RunStepPresentation[],
  shown: ReadonlySet<string>,
): RunStepPresentation[] {
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
  definitionId,
  definition,
  workflowName,
  workflowDescription,
  config,
  /** Wired to the surface's own Run verb when it has one. */
  onRetry,
}: {
  runId: string;
  /** The workflow this run belongs to — the declared result contract's key. */
  definitionId: string;
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
  const shownBySurface = useMemo(() => surfaceShownNodeIds(surface), [surface]);
  const ownDeliverables = useMemo(
    () => undisplayedDeliverables(deliverables, shownBySurface),
    [deliverables, shownBySurface],
  );
  const stepLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const step of steps) labels[step.nodeId] = step.label;
    return labels;
  }, [steps]);

  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const railRef = useFollowRunningStep(steps, phases);

  // ── THE DECLARED PROMISE + THE LIVE EMISSIONS (SPEC §3) ─────────────────
  // The schema is read from the workflow, NOT from the run: the slots exist
  // before this run reported anything, and would exist before it started at
  // all. The split lifts the one staged reveal out of the stream; the panel
  // half and the declared panel deliverables meet inside `DeliveredStream`,
  // which owns the dedupe.
  const status = useAppSelector(selectRunStatus(runId));
  const emissions = useAppSelector(selectRunEmissions(runId));
  /**
   * 🚨 LOADING IS NOT "NO PROMISE" — the distinction the page shift lives in.
   *
   * Found in the browser on the proving walk: reading this as a plain
   * schema-or-null made the in-flight fetch look identical to an unreadable
   * one, so a permalink opened by client-side navigation painted the DEGRADED
   * shape first (every emission loose in the stream, plus the run-result card)
   * and then RE-SORTED itself when the promise landed a moment later — each
   * emission jumping out of the stream and into its slot under the reader.
   * That is precisely the shift the reserved-slot contract exists to end.
   *
   * So the three states are kept apart: while it is LOADING the delivered
   * section holds, because the slots are about to be declared and content
   * placed now would have to move; only a genuine ERROR degrades.
   */
  /**
   * 🚨 THE FLOATING LAW. This stage is the run's home while it is on screen —
   * and the instant it is not, the run is handed to the floating window, which
   * takes over the adoption so the stream never dies mid-flight. Without this
   * one line, navigating away from a live run tore its transports down and the
   * person got a spinner somewhere else and no way back. See
   * `floating/useFloatingWorkflowRun.ts` for the handoff itself.
   */
  useFloatingWorkflowRun({ runId, workflowName });

  const schemaState = useResultSchema(definitionId);
  const schemaPending = schemaState.status === "loading";
  const schemaFailed = schemaState.status === "error";
  const declared = resultSchemaOrNull(schemaState);
  const { showcase, panel } = splitByPresentation(emissions);
  // A live question that asked for the stage. Read once here so the slot and
  // the panel placement cannot disagree about where it belongs.
  const question = useInterruptQuestion(runId);
  const stagedQuestion =
    question && question.view.presentation === "showcase" ? question : null;
  // An authored surface that already places a node's readout keeps it — the
  // author's layout is the intent, and rendering one shape twice on one screen
  // is what THE CANONICAL COMPONENT LAW exists to prevent.
  const declaredPanel = panelDeliverables(declared).filter(
    (d) => !shownBySurface.has(d.nodeId),
  );
  const declaredShowcase = showcaseDeliverables(declared);

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

      {/* The run's own controls (census #34) — pause / resume / stop / cancel,
          disabled with their reason rather than hidden. */}
      <RunControlBar runId={runId} />

      <RunFailureCard
        runId={runId}
        stepLabels={stepLabels}
        whatItRan={workflowName}
        onRetry={onRetry}
      />
      {/* THE QUESTION (SPEC §4.1). A `panel` question sits here, in the run's
          own column of cards; a `showcase` question is STAGED below instead —
          `placement` is what keeps it from being drawn in both places. */}
      <InterruptCard runId={runId} placement="panel" />

      {/* THE SHOWCASE — page-centered, above the columns, reserved from the
          declared contract and never also in the stream below. Renders
          nothing at all when this workflow stages nothing… unless a question
          asked for the stage, which outranks a reveal: the run is blocked on
          it, and "the sign-off you want the person to actually see" is the
          whole reason `presentation: "showcase"` exists on a question. */}
      <ShowcaseSlot
        runId={runId}
        emission={showcase}
        declared={declaredShowcase}
        started={status !== null}
        staged={
          stagedQuestion ? (
            <InterruptCard runId={runId} placement="showcase" />
          ) : null
        }
        stagedTitle={stagedQuestion?.view.title ?? null}
      />

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

          {/* THE DECISION RECORD (SPEC §4.2). The live question vanishes the
              moment the run resumes; who signed off — or whether an agent did
              it on the deadline — must not vanish with it. */}
          <RunDecisions runId={runId} nodeLabels={stepLabels} />

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
          {/* THE DELIVERED STREAM — declared slots first (reserved, then
              settled by their own output or their claimed emission), then
              every emission no slot claimed. One component, so the dedupe is
              structural rather than a discipline. */}
          {schemaPending ? null : (
            <section className="space-y-2">
              {declaredPanel.length > 0 || panel.length > 0 ? (
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your deliverables
                </h2>
              ) : null}
              <DeliveredStream
                runId={runId}
                declared={declaredPanel}
                emissions={panel}
              />
            </section>
          )}

          {/* THE DEGRADE. With an UNREADABLE result schema there is no declared
              promise to reserve from, so the definition-derived shelf carries
              the producer steps exactly as it did before the contract — and it
              is suppressed entirely once the promise IS readable, because
              `DeliveredStream` is then already drawing those same nodes. */}
          {schemaFailed ? (
            <RunDeliverables runId={runId} deliverables={ownDeliverables} />
          ) : null}

          {/* The run's own `run_result` packet — shown ONLY when no deliverable
              section is drawing those same terminal payloads. Rendering one
              shape twice on one screen is the duplication THE CANONICAL
              COMPONENT LAW exists to prevent. */}
          {!schemaPending &&
          deliverables.length === 0 &&
          declaredPanel.length === 0 ? (
            <RunResultCard runId={runId} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
