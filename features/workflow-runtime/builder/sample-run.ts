/**
 * The sample run — a REAL run state, assembled from REAL events.
 *
 * The preview beside the builder must show the actual run page, not a drawing
 * of one. When the workflow has a past run we bind to it and the preview IS
 * that run. When it has never run — or when the author wants to see the page
 * at a moment the past run has long since passed — we still refuse to mock:
 * this module produces the platform's own `WorkflowRunEvent` objects, folded
 * by the platform's own reducer into the platform's own slice, and rendered by
 * the platform's own components. Nothing is faked except the passage of time.
 *
 * The only invented content is the placeholder line inside a step's box, and
 * it says exactly what it is ("the real output appears here") — never
 * plausible-looking output a person could mistake for their own.
 *
 * Pure module — builds events, dispatches nothing.
 */

import type {
  NodeStreamEvent,
  WorkflowRunEvent,
} from "@/types/python-generated/workflow-events";

import type { WorkflowDefinitionLike } from "../trigger-points";
import { describeSteps, type StepInfo } from "./vocabulary";

/** One position on the preview's timeline. */
export interface SampleMoment {
  /** Human sentence for the scrubber's caption. */
  label: string;
  /** The step this moment is about, when it is about one. */
  nodeId: string | null;
}

/**
 * Steps in the order they actually run: a topological order over the edges,
 * falling back to graph order for anything a cycle or a missing edge leaves
 * unplaced. Deterministic — ties break on graph order, never on Map iteration.
 */
export function runOrder(definition: WorkflowDefinitionLike): string[] {
  const ids = definition.nodes.map((n) => n.id);
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of definition.edges) {
    if (!indegree.has(edge.target) || !outgoing.has(edge.source)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  let ready = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  while (ready.length > 0) {
    // Graph order within a wave keeps the timeline stable across reloads.
    ready.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    const next: string[] = [];
    for (const id of ready) {
      if (placed.has(id)) continue;
      placed.add(id);
      ordered.push(id);
      for (const target of outgoing.get(id) ?? []) {
        const remaining = (indegree.get(target) ?? 0) - 1;
        indegree.set(target, remaining);
        if (remaining === 0) next.push(target);
      }
    }
    ready = next;
  }
  for (const id of ids) if (!placed.has(id)) ordered.push(id);
  return ordered;
}

/**
 * The timeline the scrubber runs along: before the first step, one position
 * per step while it works, then the finished page.
 */
export function sampleMoments(definition: WorkflowDefinitionLike): SampleMoment[] {
  const steps = describeSteps(definition);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const moments: SampleMoment[] = [{ label: "Before it starts", nodeId: null }];
  for (const id of runOrder(definition)) {
    moments.push({
      label: `While "${byId.get(id)?.label ?? id}" is working`,
      nodeId: id,
    });
  }
  moments.push({ label: "When everything is done", nodeId: null });
  return moments;
}

/** The first moment at which a step has finished — where a screen bound to
 *  that step's completion first appears. */
export function momentAfterStep(
  definition: WorkflowDefinitionLike,
  nodeId: string,
): number {
  const index = runOrder(definition).indexOf(nodeId);
  return index < 0 ? 0 : index + 2;
}

const SAMPLE_TS = "2026-01-01T00:00:00.000Z";

function nodeEventBase(
  runId: string,
  step: number,
  step_info: StepInfo,
  specType: string,
) {
  return {
    ts: SAMPLE_TS,
    run_id: runId,
    step,
    node_id: step_info.id,
    spec_type: specType,
    attempt: 1,
  };
}

export interface SampleRunFrames {
  events: WorkflowRunEvent[];
  streams: NodeStreamEvent[];
}

/**
 * Every event needed to put the sample run at `momentIndex`. Replayed from
 * scratch each time the scrubber moves, so the state is always exactly what
 * the real engine would have produced by then.
 */
export function sampleRunFrames(
  definition: WorkflowDefinitionLike,
  runId: string,
  momentIndex: number,
): SampleRunFrames {
  const events: WorkflowRunEvent[] = [];
  const streams: NodeStreamEvent[] = [];
  const steps = describeSteps(definition);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const specById = new Map(
    definition.nodes.map((n) => [
      n.id,
      typeof n.data?.spec_type === "string" ? n.data.spec_type : "",
    ]),
  );
  const outputKindById = new Map(
    definition.nodes.map((n) => [
      n.id,
      typeof n.data?.output_kind === "string" && n.data.output_kind.length > 0
        ? n.data.output_kind
        : null,
    ]),
  );
  const order = runOrder(definition);
  const clamped = Math.max(0, Math.min(order.length + 1, momentIndex));

  if (clamped === 0) {
    // Attached but not started: the page a person sees the instant they hit
    // Run. No run_started event — status stays "pending".
    return { events, streams };
  }

  events.push({
    ts: SAMPLE_TS,
    event: "run_started",
    run_id: runId,
    thread_id: runId,
    definition_id: "sample",
    definition_hash: "sample",
  });

  const finishedCount = clamped === order.length + 1 ? order.length : clamped - 1;
  const runningId = clamped === order.length + 1 ? null : order[clamped - 1] ?? null;

  const emitStream = (nodeId: string, text: string, seq: number) => {
    streams.push({
      event: "node_stream",
      run_id: runId,
      node_id: nodeId,
      kind: "chunk",
      delta: text,
      stream_seq: seq,
      ts: SAMPLE_TS,
      chunks_received: 1,
      chars_streamed: text.length,
    });
  };

  order.slice(0, finishedCount).forEach((nodeId, i) => {
    const info = byId.get(nodeId);
    if (!info) return;
    const base = nodeEventBase(runId, i + 1, info, specById.get(nodeId) ?? "");
    events.push({
      ...base,
      event: "node_started",
      inputs: {},
      output_kind: outputKindById.get(nodeId) ?? null,
    });
    emitStream(
      nodeId,
      "Sample output.",
      i * 2,
    );
    events.push({
      ...base,
      event: "node_completed",
      duration_ms: 1_000,
      output: {},
      output_kind: null,
      output_kind_ok: null,
      output_kind_errors: null,
      output_kind_version: null,
      output_kind_degraded: null,
      metadata: null,
      wrapper: null,
    });
  });

  if (runningId) {
    const info = byId.get(runningId);
    if (info) {
      events.push({
        ...nodeEventBase(runId, finishedCount + 1, info, specById.get(runningId) ?? ""),
        event: "node_started",
        inputs: {},
        output_kind: outputKindById.get(runningId) ?? null,
      });
      emitStream(
        runningId,
        "Sample output, streaming…",
        (finishedCount + 1) * 2,
      );
    }
  } else {
    events.push({
      ts: SAMPLE_TS,
      event: "run_completed",
      run_id: runId,
      status: "completed",
      steps_executed: order.length,
      last_outputs: {},
      channel_values: {},
    });
  }

  return { events, streams };
}
