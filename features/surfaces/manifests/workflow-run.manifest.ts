/**
 * Surface manifest — Workflow run (`matrx-user/workflow-run`).
 *
 * ONE run of a workflow, wherever it is on screen: its permalink
 * (`/workflows/runs/[runId]`), the run a workflow page adopted
 * (`/workflows/[id]?run=`), and a run on the Board. All three mount the same
 * host, `WorkflowRunSurfaceHost` (`features/workflow-runtime/surface-runtime/`),
 * whose scope builder (`buildWorkflowRunScope`) reads the live run from the
 * `workflowRuns` slice at trigger time.
 *
 * READ: the run's identity and state, the plan (every step with its live
 * phase), what it was started with, its error, the question it is waiting on,
 * and a BOUNDED view of what each step produced and emitted.
 *
 * WRITE: only the verbs the run page itself offers, through the SAME hook its
 * buttons call (`useWorkflowRunControls`) and the SAME availability rules
 * (`run-controls.ts`): pause / resume / stop / cancel the run (the control
 * bar), and retry or move past one step (the plan's step controls). Every
 * target asks first — each one changes paid work in flight. Deliberately NOT
 * targets: starting a new run (it asks for inputs and costs money; a person
 * presses Run), answering the run's question (the person's decision), and
 * anything that edits the workflow's design.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "run_identity",
    label: "Run identity",
    sortOrder: 100,
    description: "Which run this is, which workflow it runs, and when it started.",
  },
  {
    key: "run_state",
    label: "Run state",
    sortOrder: 200,
    description:
      "Where the run stands right now: its status, what it is waiting on, and why it failed.",
  },
  {
    key: "run_plan",
    label: "The plan",
    sortOrder: 300,
    description: "Every step of the workflow and how far each has got in this run.",
  },
  {
    key: "run_io",
    label: "Inputs and outputs",
    sortOrder: 400,
    description:
      "What the run was started with, what its steps produced, and what it emitted — bounded excerpts, not whole payloads.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Run identity ─────────────────────────────────────────────────────
  {
    name: "run_id",
    label: "Run id",
    description:
      "UUID of the workflow run on screen. Always present — every mount of this surface is about exactly one run.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "run_identity",
    sortOrder: 300,
  },
  {
    name: "workflow_id",
    label: "Workflow id",
    description:
      "UUID of the workflow definition this run executes. Always present once the run's workflow has been read (the surface mounts only after it has).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "run_identity",
    sortOrder: 310,
  },
  {
    name: "workflow_name",
    label: "Workflow name",
    description: "The workflow's human name, as the run page titles it. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    group: "run_identity",
    sortOrder: 320,
  },
  {
    name: "run_started_at",
    label: "Started at",
    description:
      "ISO timestamp the engine started the run. Empty until the run read or its first event has arrived.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "run_identity",
    sortOrder: 330,
  },
  {
    name: "run_cost_usd",
    label: "Cost so far",
    description:
      "Total model cost of this run in US dollars, summed from its step cost events. 0 until a step reports a cost.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "run_identity",
    sortOrder: 340,
  },

  // ── Run state ────────────────────────────────────────────────────────
  {
    name: "run_status",
    label: "Run status",
    description:
      "The engine's status word for the run: pending | running | pausing | paused | interrupted | awaiting_input | cancelling | completed | failed | cancelled (and the engine's other terminal words). Empty while the server has not yet said — never guess the run's state then.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "run_state",
    sortOrder: 300,
  },
  {
    name: "run_status_label",
    label: "Run state, in words",
    description:
      "The same plain sentence the run page's control bar shows for the run's state (e.g. \"Working\", \"Waiting on your answer\", \"Finished\"). Always present — says \"Opening this run\" until the status is known.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "run_state",
    sortOrder: 310,
  },
  {
    name: "run_controls",
    label: "Available run controls",
    description:
      "For each run verb (pause, resume, stop, cancel): whether it is available right now and, when not, the plain reason — exactly what the control bar shows. Read this before writing run_control.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 320,
    group: "run_state",
    sortOrder: 320,
  },
  {
    name: "run_error",
    label: "Run error",
    description:
      "The run's own failure record from the engine (message, failed step, detail), when it failed. Absent for a run that has not failed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "run_state",
    sortOrder: 330,
  },
  {
    name: "run_read_failure",
    label: "Run read failure",
    description:
      "Why the run could not be READ right now (a refused or failed read) — not the run's own failure. Absent on the happy path; when present, every other state value may be stale.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "run_state",
    sortOrder: 340,
  },
  {
    name: "pending_question",
    label: "Question it is waiting on",
    description:
      "When the run is stopped on a question for the person: the step that asked and the question payload (bounded). Absent when nothing is waiting. The person answers it on the page — it is not an agent write.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "run_state",
    sortOrder: 350,
  },

  // ── The plan ─────────────────────────────────────────────────────────
  {
    name: "steps",
    label: "Steps",
    description:
      "Every step of the workflow in plan order: { node_id, label, family, phase, started, completed, failed, invocations, retry: {enabled, reason}, skip: {enabled, reason} }. phase is idle | running | retrying | settled | failed | skipped. retry/skip say whether retry_step / skip_step would be accepted for that step right now. Always an array (empty for a workflow with no steps).",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2400,
    group: "run_plan",
    sortOrder: 300,
  },
  {
    name: "step_count",
    label: "Step count",
    description: "How many steps the workflow's plan has. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "run_plan",
    sortOrder: 310,
  },
  {
    name: "current_step",
    label: "Step working now",
    description:
      "The step that is running (or retrying) right now: { node_id, label }. Absent when no step is working (not started, waiting, or finished).",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "run_plan",
    sortOrder: 320,
  },
  {
    name: "failed_step_ids",
    label: "Failed steps",
    description:
      "node_ids of the steps that have failed in this run so far. Always an array (empty when none failed).",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "run_plan",
    sortOrder: 330,
  },

  // ── Inputs and outputs ───────────────────────────────────────────────
  {
    name: "run_inputs",
    label: "Run inputs",
    description:
      "What the run was started with — the run row's input, each value bounded to a short excerpt. Absent until the run read lands, and for a run started with nothing.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "run_io",
    sortOrder: 300,
  },
  {
    name: "step_outputs",
    label: "Step outputs",
    description:
      "What each finished step produced: [{ node_id, label, kind, excerpt }], the output of its latest invocation stringified and cut to a bounded excerpt. Only steps that produced output appear; always an array.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: true,
    group: "run_io",
    sortOrder: 310,
  },
  {
    name: "emissions",
    label: "Emitted content",
    description:
      "The latest content the run emitted to the person (the deliverables on the page): [{ node_id, title, kind, excerpt }], newest last, bounded in count and length. Always an array.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    group: "run_io",
    sortOrder: 320,
  },
  {
    name: "run_result",
    label: "Run result",
    description:
      "The run's final result record (the engine's run_result wrapper with each terminal step's outcome), stringified and bounded. Absent until the run has finished and been read.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    group: "run_io",
    sortOrder: 330,
  },
];

/**
 * The run page's own verbs. Every target is `mode: "entity"` (the verb takes
 * effect on the server at once — there is nothing to stage) and
 * `applyPolicy: "ask"` (each one changes paid work in flight). Each handler
 * refuses in `validate`, before the person sees a card, when the page itself
 * would show the control disabled — with the page's own reason.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "run_control",
    label: "Run control",
    description:
      "Drives the whole run exactly like the run page's control bar. Value: one of \"pause\" (stop at the next safe point and wait), \"resume\" (carry on after a pause), \"stop\" (finish the step it is on, keep everything produced, then end), \"cancel\" (end now — the step in progress and what it was making are lost). Refused, with the page's reason, when run_controls says that verb is not available.",
    valueType: "string",
    updatesValue: "run_status",
    mode: "entity",
    applyPolicy: "ask",
    group: "run_state",
    sortOrder: 100,
  },
  {
    name: "retry_step",
    label: "Retry a step",
    description:
      "Runs one step again, exactly like its \"Try again\" control in the plan. Value: the step's node_id (from steps). Refused, with the page's reason, when that step's retry is not available (steps[].retry).",
    valueType: "string",
    updatesValue: "steps",
    mode: "entity",
    applyPolicy: "ask",
    group: "run_plan",
    sortOrder: 100,
  },
  {
    name: "skip_step",
    label: "Move past a step",
    description:
      "Moves the run past one step without its output, exactly like its \"Move past it\" control in the plan. Value: the step's node_id (from steps). Refused, with the page's reason, when that step's skip is not available (steps[].skip).",
    valueType: "string",
    updatesValue: "steps",
    mode: "entity",
    applyPolicy: "ask",
    group: "run_plan",
    sortOrder: 110,
  },
];

export const workflowRunManifest: SurfaceManifest = {
  surfaceName: "matrx-user/workflow-run",
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "One workflow run — its state, plan, inputs and outputs, and the run page's own controls.",
  readiness: "partial",
  readinessNote:
    "Values, write targets and the shared host are wired on the run permalink, the adopted run on a workflow page, and a run on the Board. Not yet certified (S1–S18) and no bound-agent Matrx-vs-matrix walk has been run.",
  label: "Workflow run",
  urlPattern: "/workflows/runs/[runId]",
  intro: `<surface_intro>
You are on ONE run of a workflow — the page a person watches while it works and comes back to after it finishes.
run_id / workflow_name say which run this is. run_status and run_status_label say where it stands; when run_status is empty the server has not yet said, so say nothing about the run's state. pending_question is present when the run is stopped on a question for the person — they answer it on the page.
steps is the plan in order, each with its live phase and whether it may be retried or moved past right now; current_step is the one working; failed_step_ids the ones that failed, and run_error the run's own failure record.
run_inputs is what it was started with; step_outputs and emissions are bounded excerpts of what it produced — read them as a summary, not the full payloads.
run_control, retry_step and skip_step drive the run exactly like the page's own buttons, and the person approves each one.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  // Which record, at a glance.
  briefValues: ["workflow_name", "run_status", "run_started_at", "step_count"],
  writeTargets,
};

/** One step as emitted in `steps`. */
export interface WorkflowRunStepEntry {
  node_id: string;
  label: string;
  family: string;
  phase: string;
  started: boolean;
  completed: boolean;
  failed: boolean;
  invocations: number;
  retry: { enabled: boolean; reason: string | null };
  skip: { enabled: boolean; reason: string | null };
}

/** One verb as emitted in `run_controls`. */
export interface WorkflowRunControlEntry {
  verb: string;
  enabled: boolean;
  reason: string | null;
}

/** One excerpt row in `step_outputs` / `emissions`. */
export interface WorkflowRunExcerptEntry {
  node_id: string;
  label?: string;
  title?: string;
  kind: string | null;
  excerpt: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createWorkflowRunScope(values: {
  // alwaysAvailable: true → required
  run_id: string;
  workflow_id: string;
  workflow_name: string;
  run_cost_usd: number;
  run_status_label: string;
  run_controls: WorkflowRunControlEntry[];
  steps: WorkflowRunStepEntry[];
  step_count: number;
  failed_step_ids: string[];
  step_outputs: WorkflowRunExcerptEntry[];
  emissions: WorkflowRunExcerptEntry[];
  // alwaysAvailable: false → optional
  run_started_at?: string;
  run_status?: string;
  run_error?: Record<string, unknown>;
  run_read_failure?: string;
  pending_question?: Record<string, unknown>;
  current_step?: { node_id: string; label: string };
  run_inputs?: Record<string, unknown>;
  run_result?: string;
  selection?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
