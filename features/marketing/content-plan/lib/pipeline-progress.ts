/**
 * Pure projections of site-wide `plan.node_step` rows for dense plan views.
 * Missing rows stay distinct from explicit `pending` rows: untouched nodes
 * are omitted from the returned map, so tree/table surfaces render no noise.
 */
import {
  PIPELINE_STEPS,
  type PipelineStepKey,
  type PlanNodeStepRow,
} from "../types";

type PipelineStepStatus = "pending" | "running" | "done" | "failed" | "skipped";

type PipelineProgressTone =
  "muted" | "primary" | "success" | "warning" | "destructive";

export interface NodePipelineProgress {
  byStep: ReadonlyMap<string, PlanNodeStepRow>;
  doneCount: number;
  failedCount: number;
  runningCount: number;
  skippedCount: number;
  pendingCount: number;
  neverRunCount: number;
  unknownCount: number;
  milestone: PipelineStepKey | null;
  milestoneLabel: string | null;
  filterLabel: string;
  filterValue: string;
  tone: PipelineProgressTone;
}

const PIPELINE_STEP_KEYS: ReadonlySet<string> = new Set(
  PIPELINE_STEPS.map(({ step }) => step),
);

const PIPELINE_STATUSES: ReadonlySet<string> = new Set<PipelineStepStatus>([
  "pending",
  "running",
  "done",
  "failed",
  "skipped",
]);

const MILESTONE_LABELS: Record<PipelineStepKey, string> = {
  p1_keywords: "Keywords",
  p2_research: "Researched",
  p3_family: "Family mapped",
  p4_write: "Written",
  p5_review: "Reviewed",
  p6_build: "Built",
  p7_publish: "Published",
};

const FILTER_RANK: Record<string, number> = {
  Started: 0,
  Skipped: 0,
  Keywords: 1,
  Researched: 2,
  "Family mapped": 3,
  Written: 4,
  Reviewed: 5,
  Built: 6,
  Published: 7,
  Running: 90,
  Failed: 98,
  "Pipeline mismatch": 99,
};

function filterValue(label: string): string {
  return `${String(FILTER_RANK[label] ?? 99).padStart(2, "0")}:${label}`;
}

export const PIPELINE_FILTER_OPTIONS = [
  "Started",
  "Skipped",
  "Keywords",
  "Researched",
  "Family mapped",
  "Written",
  "Reviewed",
  "Built",
  "Published",
  "Running",
  "Failed",
  "Pipeline mismatch",
].map((label) => ({ value: filterValue(label), label }));

function summarizeNodeSteps(
  rows: readonly PlanNodeStepRow[],
): NodePipelineProgress {
  const byStep = new Map<string, PlanNodeStepRow>();
  for (const row of rows) byStep.set(row.step, row);

  const knownRows = Array.from(byStep.values()).filter((row) =>
    PIPELINE_STEP_KEYS.has(row.step),
  );
  const countStatus = (status: PipelineStepStatus) =>
    knownRows.filter((row) => row.status === status).length;

  const doneCount = countStatus("done");
  const failedCount = countStatus("failed");
  const runningCount = countStatus("running");
  const skippedCount = countStatus("skipped");
  const pendingCount = countStatus("pending");
  const unknownCount = Array.from(byStep.values()).filter(
    (row) =>
      !PIPELINE_STEP_KEYS.has(row.step) || !PIPELINE_STATUSES.has(row.status),
  ).length;

  const milestoneEntry = [...PIPELINE_STEPS]
    .reverse()
    .find(({ step }) => byStep.get(step)?.status === "done");
  const milestone = milestoneEntry?.step ?? null;
  const milestoneLabel = milestone ? MILESTONE_LABELS[milestone] : null;

  let label = milestoneLabel ?? (skippedCount > 0 ? "Skipped" : "Started");
  let tone: PipelineProgressTone =
    milestoneLabel !== null
      ? "success"
      : skippedCount > 0
        ? "warning"
        : "muted";
  if (runningCount > 0) {
    label = "Running";
    tone = "primary";
  }
  if (failedCount > 0) {
    label = "Failed";
    tone = "destructive";
  }
  if (unknownCount > 0) {
    label = "Pipeline mismatch";
    tone = "destructive";
  }

  return {
    byStep,
    doneCount,
    failedCount,
    runningCount,
    skippedCount,
    pendingCount,
    neverRunCount: Math.max(0, PIPELINE_STEPS.length - knownRows.length),
    unknownCount,
    milestone,
    milestoneLabel,
    filterLabel: label,
    filterValue: filterValue(label),
    tone,
  };
}

/** Group one site-wide query into the per-node summaries every projection uses. */
export function buildNodePipelineProgress(
  rows: readonly PlanNodeStepRow[],
): Map<string, NodePipelineProgress> {
  const rowsByNode = new Map<string, PlanNodeStepRow[]>();
  for (const row of rows) {
    const nodeRows = rowsByNode.get(row.node_id) ?? [];
    nodeRows.push(row);
    rowsByNode.set(row.node_id, nodeRows);
  }

  const progressByNode = new Map<string, NodePipelineProgress>();
  for (const [nodeId, nodeRows] of rowsByNode) {
    progressByNode.set(nodeId, summarizeNodeSteps(nodeRows));
  }
  return progressByNode;
}

/** Human-readable status detail for native tooltips and accessible labels. */
export function pipelineProgressTitle(progress: NodePipelineProgress): string {
  const parts = [
    `${progress.doneCount} of ${PIPELINE_STEPS.length} done`,
    progress.runningCount > 0 ? `${progress.runningCount} running` : null,
    progress.failedCount > 0 ? `${progress.failedCount} failed` : null,
    progress.skippedCount > 0 ? `${progress.skippedCount} skipped` : null,
    progress.pendingCount > 0 ? `${progress.pendingCount} pending` : null,
    progress.neverRunCount > 0 ? `${progress.neverRunCount} never run` : null,
    progress.unknownCount > 0
      ? `${progress.unknownCount} unrecognized row`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.join(" · ");
}
