/**
 * Workflow Runs — tree-aware Redux fold over the 19 durable workflow run
 * events (plus the ephemeral node-stream bookkeeping tier). Ported from the
 * workflow-studio Zustand reducer (`apps/workflow-studio/src/features/canvas/
 * store.ts::applyRunEvent` + its invocation aggregation helpers).
 *
 * THE INVOCATION LAW (ported verbatim): fan-out truth is invocation-aware.
 * Parallel siblings are keyed by `invocationKeyOf(nodeId, dispatchId,
 * itemIndex)`; a node remains working until every expected invocation has
 * settled (`invocations.length >= expectedCount`). `node_id` alone is NEVER a
 * completion, cost, or stream key.
 *
 * Replay note: `replay: true` on applyRunEvent bypasses the seq dedup so a
 * history refold applies cleanly. The reducer itself is replay-neutral —
 * live-only side effects (auto-opening panels/windows, toasts) live OUTSIDE
 * this reducer, keyed off the same `replay` flag by the caller.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  invocationKeyOf,
  readHeartbeatTails,
  type NodeStreamEvent,
  type RunRow,
  type WorkflowRunEvent,
  type WorkflowRunStatus,
} from "@/features/workflow-runtime/types";

export type NodeRunPhase =
  | "running"
  | "settled"
  | "failed"
  | "skipped"
  | "retrying";

export interface NodeInvocationState {
  invocationKey: string;
  nodeId: string;
  specType: string | null;
  dispatchId: string | null;
  itemIndex: number;
  attempt: number;
  phase: NodeRunPhase;
  startedAt: string | null;
  durationMs: number | null;
  /** From node_completed — REPLACED wholesale per attempt, never merged. */
  output: Record<string, unknown> | null;
  outputKind: string | null;
  outputKindOk: boolean | null;
  /** node_completed `metadata.__ir` when present. */
  irEnvelope: unknown | null;
  error: { type: string | null; message: string | null } | null;
  progress: {
    message: string | null;
    fraction: number | null;
    current: number | null;
    total: number | null;
  } | null;
  /** From `inputs.iteration` on node_started when it is a number. */
  iteration: number | null;
  /** Content-lane adoption — set via registerLane, cleared via releaseLane. */
  laneRequestId: string | null;
  /** Capped tail for tracked-not-streamed lanes (END-keeping, 4000 chars). */
  textTail: string;
  chunksReceived: number;
  lastStreamKind: string | null;
}

export interface NodeAggregateState {
  nodeId: string;
  specType: string | null;
  /** Insertion order. */
  invocationKeys: string[];
  /** Max invocation_count seen — the fan-out completion denominator. */
  expectedCount: number;
  // Aggregate phase is derived on read (selectNodeAggregate), never stored.
}

export interface WorkflowRunEmission {
  nodeId: string;
  mode: string;
  payload: unknown;
  componentRef: string | null;
  title: string | null;
  ts: string;
}

export interface WorkflowRunWorkSet {
  setName: string;
  wave: number;
  done: boolean;
  dispatched: number;
  succeeded: number;
  failed: number;
  pending: number;
  inProgress: number;
  deadLetter: number;
  discovered: number;
}

export interface WorkflowRunState {
  runId: string;
  parentRunId: string | null;
  definitionId: string | null;
  status: WorkflowRunStatus;
  statusTs: string | null;
  error: Record<string, unknown> | null;
  interrupt: {
    nodeId: string;
    payload: Record<string, unknown>;
    checkpointId: string;
  } | null;
  /** By invocationKey. */
  nodes: Record<string, NodeInvocationState>;
  /** By nodeId. */
  nodeAggregates: Record<string, NodeAggregateState>;
  /** nodeIds in first-seen order. */
  nodeOrder: string[];
  costTotalUsd: number;
  /** Keyed `${node_id}:${step}:${attempt}` so redelivery overwrites, never
   * double-counts (total is recomputed from the map). */
  costsByNode: Record<string, number>;
  /** Cap EMISSIONS_MAX, oldest dropped. */
  emissions: WorkflowRunEmission[];
  /** By node_id; latest wave wins. */
  workSets: Record<string, WorkflowRunWorkSet>;
  childRunIds: string[];
  lastEventSeq: number | null;
  transportMode: "sse" | "polling" | "idle";
  attachedAt: number | null;
  /** Max step seen across node events. */
  stepsExecuted: number;
}

export interface WorkflowRunsState {
  byRunId: Record<string, WorkflowRunState>;
}

/** END-keeping tail cap — mirrors the backend heartbeat tail
 * (ProgressTrackingEmitter._LIVE_TEXT_TAIL_CHARS) and the studio's
 * LIVE_TEXT_TAIL_CHARS so all tails are the same size. */
export const TEXT_TAIL_CAP = 4_000;

/** Emission ring cap — beyond this the oldest entries are dropped. */
export const EMISSIONS_MAX = 100;

const initialState: WorkflowRunsState = { byRunId: {} };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function appendTail(tail: string, delta: string): string {
  const next = tail + delta;
  return next.length > TEXT_TAIL_CAP
    ? next.slice(next.length - TEXT_TAIL_CAP)
    : next;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readField(value: unknown, key: string): unknown {
  const record = asRecord(value);
  return record ? record[key] : undefined;
}

function readStringField(value: unknown, key: string): string | null {
  const raw = readField(value, key);
  return typeof raw === "string" ? raw : null;
}

function makeRunState(
  runId: string,
  parentRunId: string | null,
  definitionId: string | null,
): WorkflowRunState {
  return {
    runId,
    parentRunId,
    definitionId,
    status: "pending",
    statusTs: null,
    error: null,
    interrupt: null,
    nodes: {},
    nodeAggregates: {},
    nodeOrder: [],
    costTotalUsd: 0,
    costsByNode: {},
    emissions: [],
    workSets: {},
    childRunIds: [],
    lastEventSeq: null,
    transportMode: "idle",
    attachedAt: null,
    stepsExecuted: 0,
  };
}

/** Idempotent attach shared by the attachRun reducer and the
 * subgraph_run_linked auto-attach — existing run state always survives. */
function ensureRun(
  state: WorkflowRunsState,
  runId: string,
  parentRunId: string | null,
  definitionId: string | null,
): WorkflowRunState {
  const existing = state.byRunId[runId];
  if (existing) {
    if (parentRunId !== null && existing.parentRunId === null) {
      existing.parentRunId = parentRunId;
    }
    if (definitionId !== null && existing.definitionId === null) {
      existing.definitionId = definitionId;
    }
    if (existing.attachedAt === null) {
      existing.attachedAt = Date.now();
    }
    return existing;
  }
  const created = makeRunState(runId, parentRunId, definitionId);
  created.attachedAt = Date.now();
  state.byRunId[runId] = created;
  return created;
}

/** The common field set every node event carries (structural — works whether
 * the union member declares them optional, nullable, or required). */
interface NodeEventFields {
  node_id: string;
  step: number;
  attempt: number;
  dispatch_id?: string | null;
  item_index?: number | null;
  invocation_count?: number | null;
  ts: string;
}

function keyOf(event: NodeEventFields): string {
  return invocationKeyOf(
    event.node_id,
    event.dispatch_id ?? null,
    event.item_index ?? 0,
  );
}

function makeInvocation(
  key: string,
  event: NodeEventFields,
  specType: string | null,
): NodeInvocationState {
  return {
    invocationKey: key,
    nodeId: event.node_id,
    specType,
    dispatchId: event.dispatch_id ?? null,
    itemIndex: event.item_index ?? 0,
    attempt: event.attempt,
    phase: "running",
    startedAt: null,
    durationMs: null,
    output: null,
    outputKind: null,
    outputKindOk: null,
    irEnvelope: null,
    error: null,
    progress: null,
    iteration: null,
    laneRequestId: null,
    textTail: "",
    chunksReceived: 0,
    lastStreamKind: null,
  };
}

/** Upsert the invocation for a node event AND register its node in the
 * aggregate map + first-seen order. Returns the (draft) invocation. */
function upsertInvocation(
  run: WorkflowRunState,
  event: NodeEventFields,
  rawEvent: unknown,
): NodeInvocationState {
  const key = keyOf(event);
  const specType = readStringField(rawEvent, "spec_type");
  let invocation = run.nodes[key];
  if (!invocation) {
    invocation = makeInvocation(key, event, specType);
    run.nodes[key] = invocation;
  } else if (specType !== null) {
    invocation.specType = specType;
  }
  let aggregate = run.nodeAggregates[event.node_id];
  if (!aggregate) {
    aggregate = {
      nodeId: event.node_id,
      specType,
      invocationKeys: [],
      expectedCount: 1,
    };
    run.nodeAggregates[event.node_id] = aggregate;
    run.nodeOrder.push(event.node_id);
  } else if (specType !== null && aggregate.specType === null) {
    aggregate.specType = specType;
  }
  if (!aggregate.invocationKeys.includes(key)) {
    aggregate.invocationKeys.push(key);
  }
  aggregate.expectedCount = Math.max(
    aggregate.expectedCount,
    event.invocation_count ?? 1,
  );
  run.stepsExecuted = Math.max(run.stepsExecuted, event.step);
  return invocation;
}

function stampStatus(
  run: WorkflowRunState,
  status: WorkflowRunStatus,
  ts: string,
): void {
  run.status = status;
  run.statusTs = ts;
}

// ---------------------------------------------------------------------------
// The event fold — one case per durable event type (ported from the studio's
// applyRunEvent; see the module docstring for the invocation law).
// ---------------------------------------------------------------------------

function applyEvent(
  state: WorkflowRunsState,
  run: WorkflowRunState,
  event: WorkflowRunEvent,
): void {
  switch (event.event) {
    case "run_started":
      stampStatus(run, "running", event.ts);
      run.error = null;
      run.interrupt = null;
      break;
    case "run_completed":
      stampStatus(run, "completed", event.ts);
      break;
    case "run_failed": {
      stampStatus(run, "failed", event.ts);
      const error = asRecord(readField(event, "error"));
      if (error) run.error = error;
      break;
    }
    case "run_cancelled":
      stampStatus(run, "cancelled", event.ts);
      break;
    case "run_paused":
      stampStatus(run, "paused", event.ts);
      break;
    case "run_resumed":
      stampStatus(run, "running", event.ts);
      run.interrupt = null;
      break;
    case "run_errored": {
      stampStatus(run, "errored", event.ts);
      const error = asRecord(readField(event, "error"));
      if (error) run.error = error;
      break;
    }
    case "run_interrupted":
      stampStatus(run, "interrupted", event.ts);
      run.interrupt = {
        nodeId: event.node_id,
        payload: asRecord(event.payload) ?? {},
        checkpointId: event.checkpoint_id ?? "",
      };
      break;
    case "node_started": {
      const key = keyOf(event);
      const existing = run.nodes[key];
      // Regress guard (studio P1-8): an out-of-order/late node_started must
      // not flip an invocation that already settled at the same-or-newer
      // attempt back to running. A genuine retry carries a higher attempt.
      if (
        existing &&
        (existing.phase === "settled" ||
          existing.phase === "failed" ||
          existing.phase === "skipped") &&
        event.attempt <= existing.attempt
      ) {
        run.stepsExecuted = Math.max(run.stepsExecuted, event.step);
        break;
      }
      const invocation = upsertInvocation(run, event, event);
      invocation.phase = "running";
      invocation.attempt = event.attempt;
      invocation.startedAt = event.ts;
      invocation.error = null;
      invocation.progress = null;
      const iteration = readField(readField(event, "inputs"), "iteration");
      if (typeof iteration === "number") invocation.iteration = iteration;
      break;
    }
    case "node_completed": {
      const invocation = upsertInvocation(run, event, event);
      invocation.phase = "settled";
      invocation.attempt = event.attempt;
      // Output is REPLACED per attempt — never merged.
      invocation.output = asRecord(event.output);
      invocation.durationMs =
        typeof event.duration_ms === "number" ? event.duration_ms : null;
      invocation.outputKind =
        typeof event.output_kind === "string" && event.output_kind
          ? event.output_kind
          : null;
      invocation.outputKindOk =
        typeof event.output_kind_ok === "boolean" ? event.output_kind_ok : null;
      const metadata = asRecord(event.metadata);
      invocation.irEnvelope =
        metadata && "__ir" in metadata ? metadata["__ir"] : null;
      // A retry that succeeded makes prior diagnostics stale.
      invocation.error = null;
      invocation.progress = null;
      break;
    }
    case "node_failed": {
      const invocation = upsertInvocation(run, event, event);
      invocation.phase = "failed";
      invocation.attempt = event.attempt;
      invocation.error = {
        type: typeof event.error_type === "string" ? event.error_type : null,
        message:
          typeof event.error_message === "string" ? event.error_message : null,
      };
      invocation.progress = null;
      break;
    }
    case "node_skipped": {
      const invocation = upsertInvocation(run, event, event);
      invocation.phase = "skipped";
      break;
    }
    case "node_retry_scheduled": {
      const invocation = upsertInvocation(run, event, event);
      invocation.phase = "retrying";
      invocation.attempt = Math.max(invocation.attempt, event.attempt);
      break;
    }
    case "node_progress": {
      const invocation = upsertInvocation(run, event, event);
      invocation.progress = {
        message: typeof event.message === "string" ? event.message : null,
        fraction: typeof event.fraction === "number" ? event.fraction : null,
        current: typeof event.current === "number" ? event.current : null,
        total: typeof event.total === "number" ? event.total : null,
      };
      break;
    }
    case "node_cost": {
      // Keyed by invocation identity so durable-replay / cross-transport
      // duplicates overwrite the same entry; the total is recomputed from the
      // map so it can never double-count.
      const key = `${event.node_id}:${event.step}:${event.attempt}`;
      run.costsByNode[key] =
        typeof event.cost_usd === "number" ? event.cost_usd : 0;
      run.costTotalUsd = Object.values(run.costsByNode).reduce(
        (sum, cost) => sum + cost,
        0,
      );
      run.stepsExecuted = Math.max(run.stepsExecuted, event.step);
      break;
    }
    case "node_emitted": {
      run.emissions.push({
        nodeId: event.node_id,
        mode: typeof event.mode === "string" ? event.mode : "full",
        payload: event.payload,
        componentRef:
          typeof event.component_ref === "string" ? event.component_ref : null,
        title: typeof event.title === "string" ? event.title : null,
        ts: event.ts,
      });
      if (run.emissions.length > EMISSIONS_MAX) {
        run.emissions.splice(0, run.emissions.length - EMISSIONS_MAX);
      }
      break;
    }
    case "work_set_progress": {
      // Latest wave wins; a stale redelivery must never roll a wave back.
      const previous = run.workSets[event.node_id];
      if (previous && previous.wave > event.wave) break;
      run.workSets[event.node_id] = {
        setName: typeof event.set_name === "string" ? event.set_name : "",
        wave: event.wave,
        done: event.done === true,
        dispatched: typeof event.dispatched === "number" ? event.dispatched : 0,
        succeeded: typeof event.succeeded === "number" ? event.succeeded : 0,
        failed: typeof event.failed === "number" ? event.failed : 0,
        pending: typeof event.pending === "number" ? event.pending : 0,
        inProgress:
          typeof event.in_progress === "number" ? event.in_progress : 0,
        deadLetter:
          typeof event.dead_letter === "number" ? event.dead_letter : 0,
        discovered: typeof event.discovered === "number" ? event.discovered : 0,
      };
      break;
    }
    case "subgraph_run_linked": {
      if (!run.childRunIds.includes(event.child_run_id)) {
        run.childRunIds.push(event.child_run_id);
      }
      // Auto-attach the child through the SAME helper attachRun uses, so a
      // nested run's own events have a home the moment the link lands. The
      // parent pointer makes detachRun's cascade reach it.
      ensureRun(
        state,
        event.child_run_id,
        run.runId,
        typeof event.child_definition_id === "string"
          ? event.child_definition_id
          : null,
      );
      break;
    }
    case "checkpoint_saved":
      // Bookkeeping only — checkpoints are read through their own endpoints.
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const workflowRunsSlice = createSlice({
  name: "workflowRuns",
  initialState,
  reducers: {
    /** Idempotent — re-attaching an already-tracked run keeps its state. */
    attachRun(
      state,
      action: PayloadAction<{
        runId: string;
        parentRunId?: string | null;
        definitionId?: string | null;
      }>,
    ) {
      const { runId, parentRunId, definitionId } = action.payload;
      ensureRun(state, runId, parentRunId ?? null, definitionId ?? null);
    },

    /** Detaches the run AND its children, recursively. */
    detachRun(state, action: PayloadAction<{ runId: string }>) {
      const toRemove = new Set<string>([action.payload.runId]);
      // Children may nest arbitrarily deep — expand until stable.
      let grew = true;
      while (grew) {
        grew = false;
        for (const run of Object.values(state.byRunId)) {
          if (
            run.parentRunId !== null &&
            toRemove.has(run.parentRunId) &&
            !toRemove.has(run.runId)
          ) {
            toRemove.add(run.runId);
            grew = true;
          }
        }
      }
      for (const runId of toRemove) {
        delete state.byRunId[runId];
      }
    },

    /** Seed durable row state (status, error, heartbeat text tails) into an
     * attached run — a reconnect baseline, never an overwrite: a node that
     * already has live streamed textTail keeps it. */
    seedRunRow(
      state,
      action: PayloadAction<{ runId: string; row: RunRow }>,
    ) {
      const run = state.byRunId[action.payload.runId];
      if (!run) return;
      const row = action.payload.row;
      run.status = row.status;
      if (row.error) run.error = row.error;
      // Durable reconnect snapshot for streamed text — node_stream frames are
      // never replayed; the heartbeat is how a late-attaching client rebuilds
      // the tails. Canonical reader lives beside the wire types.
      const tails = readHeartbeatTails(row);
      for (const [nodeId, snapshot] of Object.entries(tails)) {
        const tail = snapshot.live_text_tail;
        if (!tail) continue;
        const aggregate = run.nodeAggregates[nodeId];
        if (!aggregate) continue;
        for (const key of aggregate.invocationKeys) {
          const invocation = run.nodes[key];
          if (invocation && invocation.textTail === "") {
            invocation.textTail =
              tail.length > TEXT_TAIL_CAP
                ? tail.slice(tail.length - TEXT_TAIL_CAP)
                : tail;
          }
        }
      }
    },

    /** Fold one durable run event. `seq` (when non-null) dedups + advances
     * the cursor; `replay` bypasses the dedup so a history refold applies. */
    applyRunEvent(
      state,
      action: PayloadAction<{
        runId: string;
        event: WorkflowRunEvent;
        seq: number | null;
        replay: boolean;
      }>,
    ) {
      const { runId, event, seq, replay } = action.payload;
      const run = state.byRunId[runId];
      if (!run) return;
      if (
        seq !== null &&
        run.lastEventSeq !== null &&
        seq <= run.lastEventSeq &&
        !replay
      ) {
        return;
      }
      if (seq !== null && (run.lastEventSeq === null || seq > run.lastEventSeq)) {
        run.lastEventSeq = seq;
      }
      applyEvent(state, run, event);
    },

    /** Tracked-tier stream bookkeeping (phase/tool/warning markers + chunk
     * counts + END-keeping textTail append). Content lanes — streams adopted
     * into activeRequests via registerLane — render elsewhere; this is the
     * cheap record for lanes that are tracked but not streamed on screen. */
    applyNodeStreamMeta(
      state,
      action: PayloadAction<{ runId: string; event: NodeStreamEvent }>,
    ) {
      const { runId, event } = action.payload;
      const run = state.byRunId[runId];
      if (!run) return;
      const nodeId = event.node_id;
      if (!nodeId) return;
      const aggregate = run.nodeAggregates[nodeId];
      if (!aggregate) return;
      for (const key of aggregate.invocationKeys) {
        const invocation = run.nodes[key];
        if (!invocation) continue;
        invocation.lastStreamKind = event.kind;
        if (event.kind === "chunk") {
          invocation.chunksReceived += 1;
          if (typeof event.delta === "string" && event.delta) {
            invocation.textTail = appendTail(invocation.textTail, event.delta);
          }
        }
      }
    },

    registerLane(
      state,
      action: PayloadAction<{
        runId: string;
        invocationKey: string;
        requestId: string;
      }>,
    ) {
      const run = state.byRunId[action.payload.runId];
      const invocation = run?.nodes[action.payload.invocationKey];
      if (invocation) invocation.laneRequestId = action.payload.requestId;
    },

    releaseLane(
      state,
      action: PayloadAction<{ runId: string; invocationKey: string }>,
    ) {
      const run = state.byRunId[action.payload.runId];
      const invocation = run?.nodes[action.payload.invocationKey];
      if (invocation) invocation.laneRequestId = null;
    },

    setTransportMode(
      state,
      action: PayloadAction<{ runId: string; mode: "sse" | "polling" | "idle" }>,
    ) {
      const run = state.byRunId[action.payload.runId];
      if (run) run.transportMode = action.payload.mode;
    },

    /** Monotonic — a lower/equal seq never rolls the cursor back. */
    setLastEventSeq(
      state,
      action: PayloadAction<{ runId: string; seq: number }>,
    ) {
      const run = state.byRunId[action.payload.runId];
      if (!run) return;
      if (run.lastEventSeq === null || action.payload.seq > run.lastEventSeq) {
        run.lastEventSeq = action.payload.seq;
      }
    },
  },
});

export const {
  attachRun,
  detachRun,
  seedRunRow,
  applyRunEvent,
  applyNodeStreamMeta,
  registerLane,
  releaseLane,
  setTransportMode,
  setLastEventSeq,
} = workflowRunsSlice.actions;

export default workflowRunsSlice.reducer;
