/**
 * Canonical Copy / Copy-for-AI payloads for workflow run failures.
 *
 * These builders receive the rendered view explicitly. They never reach into
 * Redux, refetch a run, or reinterpret an engine error at copy time, so the
 * payload cannot drift away from the sentence the person is looking at.
 */

import {
  buildAgentPayload,
  type AgentPayloadInput,
} from "@/components/agent-copy/buildAgentPayload";

const LOCATION = "AI Matrx — Workflow run";

const INVESTIGATION_PROMPT = `Investigate the workflow failure evidence below. Reconstruct the run and node lifecycle, identify the direct cause, and trace the producing workflow definition and engine contract before changing code or data. Preserve the structured error and fix the shared choke point rather than hiding the symptom. Verify the original failure class with focused coverage.`;

export interface WorkflowFailureView {
  kind: "route" | "run" | "node" | "activity";
  headline: string;
  technical?: string | null;
  nextStep?: string | null;
  runId?: string | null;
  definitionId?: string | null;
  workflowName?: string | null;
  status?: string | null;
  stepId?: string | null;
  stepLabel?: string | null;
  failedSteps?: string[];
  completedSteps?: number;
  totalSteps?: number;
  costUsd?: number;
  detail?: string | null;
}

function compactLines(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

/** The exact rendered failure, plus the page-leading run facts around it. */
export function workflowFailureHuman(view: WorkflowFailureView): string {
  const progress =
    view.completedSteps !== undefined && view.totalSteps !== undefined
      ? `${view.completedSteps} of ${view.totalSteps} steps`
      : null;
  const cost =
    view.costUsd !== undefined && view.costUsd > 0
      ? `$${view.costUsd.toFixed(4)}`
      : null;
  return compactLines([
    view.workflowName ? `Workflow: ${view.workflowName}` : null,
    view.status ? `Status: ${view.status}` : null,
    view.runId ? `Run: ${view.runId}` : null,
    progress ? `Progress: ${progress}` : null,
    cost ? `Cost: ${cost}` : null,
    view.stepLabel ? `Step: ${view.stepLabel}` : null,
    view.headline,
    view.failedSteps?.length
      ? `Failed steps: ${view.failedSteps.join(", ")}`
      : null,
    view.nextStep ? `Next step: ${view.nextStep}` : null,
    view.technical ? `Technical detail:\n${view.technical}` : null,
    view.detail ? `Detail: ${view.detail}` : null,
  ]).join("\n");
}

/** WHAT-I-SEE payload for one route, run, node, warning, or failure state. */
export function workflowFailureAgentInput(
  view: WorkflowFailureView,
): AgentPayloadInput {
  const progress =
    view.completedSteps !== undefined && view.totalSteps !== undefined
      ? `${view.completedSteps} of ${view.totalSteps} steps`
      : null;
  const cost =
    view.costUsd !== undefined && view.costUsd > 0
      ? `$${view.costUsd.toFixed(4)}`
      : null;

  return {
    kind: `workflow-${view.kind}-failure`,
    location: LOCATION,
    description: `The workflow ${view.kind} failure or warning currently rendered on screen.`,
    summary: workflowFailureHuman(view),
    attributes: {
      status: view.status,
      failed_steps: view.failedSteps?.length,
      completed_steps: view.completedSteps,
      total_steps: view.totalSteps,
      cost_usd: view.costUsd,
    },
    context: {
      "workflow-name": view.workflowName,
      "definition-id": view.definitionId,
      "run-id": view.runId,
      "step-id": view.stepId,
      "step-label": view.stepLabel,
      progress,
      cost,
    },
    data: {
      rendered: {
        headline: view.headline,
        failed_steps: view.failedSteps ?? [],
        next_step: view.nextStep ?? null,
        technical_detail: view.technical ?? null,
        detail: view.detail ?? null,
      },
      run: {
        definition_id: view.definitionId ?? null,
        run_id: view.runId ?? null,
        workflow_name: view.workflowName ?? null,
        status: view.status ?? null,
        progress,
        cost,
      },
      node: {
        id: view.stepId ?? null,
        label: view.stepLabel ?? null,
      },
    },
  };
}

/** Paste-ready sibling variant that keeps the faithful payload intact. */
export function workflowFailureInvestigationPrompt(
  view: WorkflowFailureView,
): string {
  return `${INVESTIGATION_PROMPT}\n\n<workflow-failure-evidence>\n${buildAgentPayload(
    workflowFailureAgentInput(view),
  )}\n</workflow-failure-evidence>`;
}
