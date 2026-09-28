/**
 * The read half of `matrx-user/workflow-run` — ONE run as the agent sees it.
 *
 * Pure: takes the live `workflowRuns` state plus the run's plan (the workflow
 * definition's steps, already described by `describeWorkflowSteps`) and
 * returns the manifest's scope through `createWorkflowRunScope`, so every
 * `alwaysAvailable` key is enforced by the type. Called at trigger time by
 * `WorkflowRunSurfaceHost`, never on render.
 *
 * Payloads are BOUNDED (the manifest promises excerpts, never whole outputs):
 * a run can carry megabytes of step output, and the agent needs a summary it
 * can reason over, not a dump that crowds everything else out.
 */

import {
  createWorkflowRunScope,
  type WorkflowRunExcerptEntry,
  type WorkflowRunStepEntry,
} from "@/features/surfaces/manifests/workflow-run.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { WorkflowRunState } from "../redux/workflow-runs.slice";
import type { RunStepPresentation } from "../components/run/node-presentation";
import {
  nodeVerbAvailability,
  runStateLabel,
  verbAvailability,
  type RunControlVerb,
} from "../components/run/run-controls";

/** Longest excerpt of one output / emission / input value, in characters. */
const EXCERPT_CHARS = 600;
/** How many of the newest emissions the scope carries. */
const MAX_EMISSIONS = 12;
const RUN_VERBS: RunControlVerb[] = ["pause", "resume", "stop", "cancel"];

/** JSON (or the string itself), cut to `max` characters with a marker. */
export function excerptOf(value: unknown, max = EXCERPT_CHARS): string {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? `${text.slice(0, max)}… [${text.length - max} more characters]` : text;
}

/** How many invocations a step ran, and what its latest one produced. */
function outputOf(
  run: WorkflowRunState | null,
  nodeId: string,
): { invocations: number; latestOutput: Record<string, unknown> | null; kind: string | null } {
  const aggregate = run?.nodeAggregates[nodeId];
  if (!run || !aggregate) return { invocations: 0, latestOutput: null, kind: null };
  const invocations = aggregate.invocationKeys
    .map((key) => run.nodes[key])
    .filter((item) => item !== undefined);
  const latest = [...invocations].reverse().find((i) => i.output !== null) ?? null;
  return {
    invocations: invocations.length,
    latestOutput: latest?.output ?? null,
    kind: latest?.outputKind ?? null,
  };
}

export function buildWorkflowRunScope(args: {
  runId: string;
  run: WorkflowRunState | null;
  workflowId: string;
  workflowName: string;
  steps: readonly RunStepPresentation[];
  /** Each step's live aggregate phase — `selectNodeAggregatePhases(runId)`. */
  phases: Readonly<Record<string, string | undefined>>;
  selectedText?: string;
}): SurfaceScopePayload {
  const { runId, run, workflowId, workflowName, steps, phases } = args;
  const status = run?.statusKnown ? run.status : null;

  const stepEntries: WorkflowRunStepEntry[] = [];
  const stepOutputs: WorkflowRunExcerptEntry[] = [];
  let current: { node_id: string; label: string } | undefined;
  for (const step of steps) {
    const facts = outputOf(run, step.nodeId);
    const phase = phases[step.nodeId] ?? "idle";
    const retry = nodeVerbAvailability("retry", status, phases[step.nodeId]);
    const skip = nodeVerbAvailability("skip", status, phases[step.nodeId]);
    stepEntries.push({
      node_id: step.nodeId,
      label: step.label,
      family: step.family,
      phase,
      started: !!run?.sticky.startedNodes[step.nodeId],
      completed: !!run?.sticky.completedNodes[step.nodeId],
      failed: !!run?.sticky.failedNodes[step.nodeId],
      invocations: facts.invocations,
      retry,
      skip,
    });
    if (!current && (phase === "running" || phase === "retrying"))
      current = { node_id: step.nodeId, label: step.label };
    if (facts.latestOutput !== null) {
      stepOutputs.push({
        node_id: step.nodeId,
        label: step.label,
        kind: facts.kind,
        excerpt: excerptOf(facts.latestOutput),
      });
    }
  }

  const emissions: WorkflowRunExcerptEntry[] = (run?.emissions ?? [])
    .slice(-MAX_EMISSIONS)
    .map((e) => ({
      node_id: e.nodeId,
      ...(e.title ? { title: e.title } : {}),
      kind: e.kind,
      excerpt: excerptOf(e.payload),
    }));

  const inputs = run?.input
    ? Object.fromEntries(
        Object.entries(run.input).map(([key, value]) => [
          key,
          typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
            ? typeof value === "string"
              ? excerptOf(value)
              : value
            : excerptOf(value),
        ]),
      )
    : undefined;

  const failed = stepEntries.filter((s) => s.phase === "failed" || s.failed).map((s) => s.node_id);

  return createWorkflowRunScope({
    run_id: runId,
    workflow_id: workflowId,
    workflow_name: workflowName,
    run_cost_usd: run?.costTotalUsd ?? 0,
    run_status_label: runStateLabel(status),
    run_controls: RUN_VERBS.map((verb) => ({ verb, ...verbAvailability(verb, status) })),
    steps: stepEntries,
    step_count: steps.length,
    failed_step_ids: failed,
    step_outputs: stepOutputs,
    emissions,
    ...(run?.startedAtTs ? { run_started_at: run.startedAtTs } : {}),
    ...(status ? { run_status: status } : {}),
    ...(run?.error ? { run_error: run.error } : {}),
    ...(run?.readFailure ? { run_read_failure: run.readFailure } : {}),
    ...(run?.interrupt
      ? {
          pending_question: {
            node_id: run.interrupt.nodeId,
            question: excerptOf(run.interrupt.payload, 1200),
          },
        }
      : {}),
    ...(current ? { current_step: current } : {}),
    ...(inputs && Object.keys(inputs).length > 0 ? { run_inputs: inputs } : {}),
    ...(run?.result ? { run_result: excerptOf(run.result, 3000) } : {}),
    ...(args.selectedText ? { selection: args.selectedText } : {}),
  });
}
