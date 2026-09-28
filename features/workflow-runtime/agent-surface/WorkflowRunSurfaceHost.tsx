"use client";

/**
 * WorkflowRunSurfaceHost — THE ONE `matrx-user/workflow-run` surface for one
 * run: the read half (`buildWorkflowRunScope`, from the live run at trigger
 * time) and the write half (the run page's own verbs through
 * `useWorkflowRunControls`, refused by the page's own availability rules).
 *
 * Mounted by the run page (`WorkflowRunPage`, both the permalink and a run a
 * workflow page adopted) and by a run on the Board, so an agent reads and
 * drives a run identically wherever it is open.
 */

import type { ReactNode } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
import {
  selectNodeAggregatePhases,
  selectRunState,
} from "../redux/workflow-runs.selectors";
import { describeWorkflowSteps } from "../components/run/node-presentation";
import {
  nodeVerbAvailability,
  verbAvailability,
  type RunControlVerb,
} from "../components/run/run-controls";
import type { WorkflowDefinitionLike } from "../trigger-points";
import { buildWorkflowRunScope } from "./workflow-run-scope";

export const WORKFLOW_RUN_SURFACE_NAME = "matrx-user/workflow-run";

const RUN_VERBS: readonly RunControlVerb[] = ["pause", "resume", "stop", "cancel"];

function isRunVerb(value: unknown): value is RunControlVerb {
  return typeof value === "string" && (RUN_VERBS as readonly string[]).includes(value);
}

export function WorkflowRunSurfaceHost({
  runId,
  workflowId,
  workflowName,
  definition,
  children,
}: {
  runId: string;
  workflowId: string;
  workflowName: string;
  definition: WorkflowDefinitionLike;
  children: ReactNode;
}) {
  const store = useAppStore();
  const controls = useWorkflowRunControls();
  const steps = describeWorkflowSteps(definition);

  const liveRun = () => selectRunState(runId)(store.getState());
  const liveStatus = () => {
    const run = liveRun();
    return run?.statusKnown ? run.status : null;
  };
  const livePhase = (nodeId: string) =>
    selectNodeAggregatePhases(runId)(store.getState())[nodeId];

  const getScope = () =>
    buildWorkflowRunScope({
      runId,
      run: liveRun(),
      workflowId,
      workflowName,
      steps,
      phases: selectNodeAggregatePhases(runId)(store.getState()),
      selectedText:
        typeof window !== "undefined" ? (window.getSelection()?.toString() ?? "") : "",
    });

  /** A step node_id this run's plan actually has — else a refusal naming the real ones. */
  const requireStep = (value: unknown, target: string): string => {
    if (typeof value !== "string" || !value.trim())
      throw new Error(`${target} expects a step's node_id (a string from steps).`);
    const nodeId = value.trim();
    if (!steps.some((s) => s.nodeId === nodeId))
      throw new Error(
        `${target}: this run has no step "${nodeId}". Its steps are: ${steps.map((s) => s.nodeId).join(", ") || "none"}.`,
      );
    return nodeId;
  };

  const getWriteHandlers = (): SurfaceWriteHandlers => ({
    run_control: {
      validate: (value) => {
        if (!isRunVerb(value))
          throw new Error('run_control expects one of "pause", "resume", "stop", "cancel".');
        const state = verbAvailability(value, liveStatus());
        if (!state.enabled) throw new Error(`Cannot ${value} this run: ${state.reason ?? "not available now"}`);
      },
      apply: async (value) => {
        if (!isRunVerb(value))
          throw new Error('run_control expects one of "pause", "resume", "stop", "cancel".');
        const ok =
          value === "pause"
            ? await controls.pause(runId)
            : value === "resume"
              ? await controls.resumePaused(runId)
              : await controls.cancel(runId, value === "stop" ? "graceful" : "immediate");
        // The verb toasts its own failure; the agent must hear it too.
        if (!ok) throw new Error(`The server did not accept "${value}" for this run.`);
        return { summary: `Asked the run to ${value}.` };
      },
    },
    retry_step: {
      validate: (value) => {
        const nodeId = requireStep(value, "retry_step");
        const state = nodeVerbAvailability("retry", liveStatus(), livePhase(nodeId));
        if (!state.enabled) throw new Error(`Cannot retry "${nodeId}": ${state.reason ?? "not available now"}`);
      },
      apply: async (value) => {
        const nodeId = requireStep(value, "retry_step");
        if (!(await controls.retryNode(runId, nodeId)))
          throw new Error(`The server did not accept retrying "${nodeId}".`);
        return { summary: `Retrying step ${nodeId}.` };
      },
    },
    skip_step: {
      validate: (value) => {
        const nodeId = requireStep(value, "skip_step");
        const state = nodeVerbAvailability("skip", liveStatus(), livePhase(nodeId));
        if (!state.enabled) throw new Error(`Cannot move past "${nodeId}": ${state.reason ?? "not available now"}`);
      },
      apply: async (value) => {
        const nodeId = requireStep(value, "skip_step");
        if (!(await controls.skipNode(runId, nodeId)))
          throw new Error(`The server did not accept moving past "${nodeId}".`);
        return { summary: `Moved past step ${nodeId}.` };
      },
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={WORKFLOW_RUN_SURFACE_NAME}
      getScope={getScope}
      isEditable={false}
      getWriteHandlers={getWriteHandlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
