/**
 * Workflow run event vocabulary — hand-maintained mirror of
 * `packages/matrx-graph/matrx_graph/types/events.py` (the Pydantic truth),
 * same as workflow-studio's `src/types/events.ts`.
 *
 * The backend emits each durable event as `{event: "data", data: {event:
 * "<one_of>", ...}}` on the NDJSON stream, and as `data:` JSON frames on the
 * per-run SSE feed (`GET /runs/{id}/events/stream`). The ephemeral
 * `node_stream` frame comes from aidream's
 * `aidream/services/runtime/workflow_events.py::NodeStreamEvent` (never
 * persisted, no SSE id, never replayed).
 *
 * A generated shared package (OpenAPI / codegen) is the tracked follow-up;
 * until then, when the backend contract changes, update this file by hand
 * against the Python models.
 */

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "cancelling"
  | "pausing"
  | "paused"
  | "interrupted"
  | "errored"
  | "completed"
  | "failed"
  | "cancelled";

/** Statuses that mean the run is finished forever — no resume, no recovery. */
export const TERMINAL_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set<WorkflowRunStatus>([
  "completed",
  "failed",
  "cancelled",
]);

/** Statuses that mean the scheduler is (or is about to be) making progress. */
export const ACTIVE_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set<WorkflowRunStatus>([
  "pending",
  "running",
  "pausing",
  "cancelling",
]);

interface EventBase {
  /** ISO-8601 emission timestamp. */
  ts: string;
  run_id: string;
}

export interface RunStartedEvent extends EventBase {
  event: "run_started";
  thread_id: string;
  definition_id: string;
  definition_hash: string;
}

export interface NodeStartedEvent extends EventBase {
  event: "node_started";
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  /** Fan-out identity — "" / 0 / 1 defaults on the wire for non-fan-out nodes. */
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  inputs: Record<string, unknown>;
}

export interface NodeCompletedEvent extends EventBase {
  event: "node_completed";
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  duration_ms: number;
  output: Record<string, unknown>;
  /**
   * Shape system: the platform kind slug (content_ir.kind_definition) the
   * node's output is declared as. null = inline anonymous shape.
   */
  output_kind: string | null;
  /**
   * Server-side kind check verdict. true = structure verified; false = drift
   * (see output_kind_errors); null = NEUTRAL — no kind declared or the check
   * loud-skipped. NEVER render null as a pass.
   */
  output_kind_ok: boolean | null;
  /** Per-field drift list when output_kind_ok === false. */
  output_kind_errors: string[] | null;
  /** Registry kind version the verdict was computed against. */
  output_kind_version: number | null;
  /**
   * Named degraded mode when the kind check loud-skipped
   * (kind_not_registered | kind_inactive | schema_unavailable |
   * schema_invalid | catalog_unreachable). A skipped check is NEVER a pass.
   */
  output_kind_degraded: string | null;
  /**
   * Content-IR envelope hand-off: when the kind check ran and PASSED,
   * `metadata.__ir` carries the canonical envelope for the trusted
   * zero-reparse render path. Absent/null = classify locally.
   */
  metadata: Record<string, unknown> | null;
}

export interface NodeSkippedEvent extends EventBase {
  event: "node_skipped";
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  output: Record<string, unknown>;
}

export interface NodeFailedEvent extends EventBase {
  event: "node_failed";
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  error_type: string;
  error_message: string;
  /** Structured superset `{type, message, code, details?}` (same dict persisted to workflow.node_outcome.error). */
  error?: Record<string, unknown> | null;
}

export interface NodeRetryScheduledEvent extends EventBase {
  event: "node_retry_scheduled";
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  next_attempt: number;
  delay_ms: number;
  error_type: string;
  error_message: string;
}

export interface NodeProgressEvent extends EventBase {
  event: "node_progress";
  step: number;
  node_id: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  /** Human progress line, e.g. "analyzing example.com". */
  message: string;
  /** 0.0–1.0 when a total is known. */
  fraction: number | null;
  current: number | null;
  total: number | null;
}

export interface CheckpointSavedEvent extends EventBase {
  event: "checkpoint_saved";
  checkpoint_id: string;
  step: number;
  parent_checkpoint_id: string | null;
}

export interface RunInterruptedEvent extends EventBase {
  event: "run_interrupted";
  node_id: string;
  payload: Record<string, unknown>;
  checkpoint_id: string | null;
}

export interface RunCompletedEvent extends EventBase {
  event: "run_completed";
  status: WorkflowRunStatus;
  steps_executed: number;
  last_outputs: Record<string, Record<string, unknown>>;
  channel_values: Record<string, unknown>;
}

export interface RunFailedEvent extends EventBase {
  event: "run_failed";
  status: WorkflowRunStatus;
  steps_executed: number;
  error_type: string;
  error_message: string;
}

export interface RunCancelledEvent extends EventBase {
  event: "run_cancelled";
  status: WorkflowRunStatus;
  steps_executed: number;
  reason: "graceful" | "immediate";
}

export interface RunPausedEvent extends EventBase {
  event: "run_paused";
  status: WorkflowRunStatus;
  steps_executed: number;
  checkpoint_id: string | null;
}

export interface RunResumedEvent extends EventBase {
  event: "run_resumed";
  from_checkpoint_id: string;
  mode: "pause" | "interrupt" | "user_skip" | "user_manual" | "retry";
}

/** A node raised but the run is PARKED (recoverable) — not terminal. */
export interface RunErroredEvent extends EventBase {
  event: "run_errored";
  status: WorkflowRunStatus;
  steps_executed: number;
  node_id: string;
  step: number;
  attempt: number;
  error_type: string;
  error_message: string;
  checkpoint_id: string | null;
}

/** Mid-run "show this on screen" side-channel from the output.to_frontend node. */
export interface NodeEmittedEvent extends EventBase {
  event: "node_emitted";
  step: number;
  node_id: string;
  attempt: number;
  mode: "confirmation" | "summary" | "full" | "restructured";
  /** Already-transformed content (non-dict results wrapped as `{ value }`). */
  payload: Record<string, unknown>;
  /** `tool_ui.tool_name` naming a custom render component on `surface`, or null for the generic renderer. */
  component_ref: string | null;
  surface: string;
  title: string | null;
}

/** Cost/usage settlement for one node invocation (the live spend ticker). */
export interface NodeCostEvent extends EventBase {
  event: "node_cost";
  step: number;
  node_id: string;
  spec_type: string | null;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  /** Primary (highest-cost) model, plus every model that billed. */
  model: string | null;
  models: string[];
  conversation_id: string | null;
  request_id: string | null;
}

/** Live progress of a run's durable work set (matrx_graph.workset), one per wave. */
export interface WorkSetProgressEvent extends EventBase {
  event: "work_set_progress";
  step: number;
  node_id: string;
  set_name: string;
  wave: number;
  dispatched: number;
  pending: number;
  in_progress: number;
  succeeded: number;
  failed: number;
  dead_letter: number;
  discovered: number;
  done: boolean;
}

/** A Run-Another-Workflow step started (or reattached to) a DURABLE child run. */
export interface SubgraphRunLinkedEvent extends EventBase {
  event: "subgraph_run_linked";
  step: number;
  node_id: string;
  dispatch_id?: string;
  item_index?: number;
  child_run_id: string;
  child_definition_id: string;
  child_definition_name: string | null;
  reattached: boolean;
  child_status: string;
}

/** The 19 durable scheduler events (recorded in wf_node_events, replayed on reconnect). */
export type WorkflowRunEvent =
  | RunStartedEvent
  | NodeStartedEvent
  | NodeCompletedEvent
  | NodeSkippedEvent
  | NodeFailedEvent
  | NodeRetryScheduledEvent
  | NodeProgressEvent
  | CheckpointSavedEvent
  | RunInterruptedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCancelledEvent
  | RunPausedEvent
  | RunResumedEvent
  | RunErroredEvent
  | NodeEmittedEvent
  | NodeCostEvent
  | WorkSetProgressEvent
  | SubgraphRunLinkedEvent;

/**
 * EPHEMERAL live-token frame (aidream workflow_events.py::NodeStreamEvent).
 * Pushed on the same SSE feed as the durable events but NEVER persisted:
 * frames carry no SSE id (the Last-Event-ID cursor stays pinned to the
 * durable seq stream) and are NOT replayed on reconnect — the reconnect
 * snapshot is the wf_run heartbeat (see readHeartbeatTails).
 */
export interface NodeStreamEvent {
  event: "node_stream";
  run_id: string;
  /** Null for the run-level emitter (pre-node or non-node streaming). */
  node_id: string | null;
  kind:
    | "chunk"
    | "reasoning"
    | "phase"
    | "tool"
    | "warning"
    | "record_update"
    | "resource_changed";
  /**
   * chunk/reasoning: new streamed text. phase/tool/warning: the label.
   * record_update/resource_changed: compact summary — treat as a refetch hint.
   */
  delta: string;
  /** Per-emitter monotonic counter — orders deltas within one node's stream. */
  stream_seq: number;
  ts: string;
  chunks_received: number;
  chars_streamed: number;
}

const WORKFLOW_RUN_EVENT_TYPES: ReadonlySet<string> = new Set([
  "run_started",
  "node_started",
  "node_completed",
  "node_skipped",
  "node_failed",
  "node_retry_scheduled",
  "node_progress",
  "checkpoint_saved",
  "run_interrupted",
  "run_completed",
  "run_failed",
  "run_cancelled",
  "run_paused",
  "run_resumed",
  "run_errored",
  "node_emitted",
  "node_cost",
  "work_set_progress",
  "subgraph_run_linked",
]);

export function isWorkflowRunEvent(value: unknown): value is WorkflowRunEvent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { event?: unknown; run_id?: unknown };
  return (
    typeof candidate.event === "string" &&
    WORKFLOW_RUN_EVENT_TYPES.has(candidate.event) &&
    typeof candidate.run_id === "string"
  );
}

export function isNodeStreamEvent(value: unknown): value is NodeStreamEvent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { event?: unknown; run_id?: unknown; delta?: unknown };
  return (
    candidate.event === "node_stream" &&
    typeof candidate.run_id === "string" &&
    typeof candidate.delta === "string"
  );
}

/** One row from `GET /runs/{id}/events` (durable wf_node_events projection). */
export interface RunEventRecord {
  event_type: string;
  /** Per-run gap-proof cursor — THE delta cursor (never page by event_ts). */
  seq: number | null;
  node_id: string | null;
  spec_type: string | null;
  step: number | null;
  attempt: number | null;
  duration_ms: number | null;
  checkpoint_id: string | null;
  error_type: string | null;
  error_message: string | null;
  /** Full original event payload (parse through isWorkflowRunEvent). */
  payload: Record<string, unknown>;
  event_ts: string;
}

/** The run row from `GET /runs/{id}`. */
export interface RunRow {
  id: string;
  definition_id: string;
  status: WorkflowRunStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  conversation_id: string | null;
}

export interface HeartbeatStreamTail {
  live_text_tail?: string;
  chunks_received?: number;
  chars_streamed?: number;
  last_phase?: string | null;
}

/**
 * Safely read `metadata._heartbeat._streaming_by_node` — the durable
 * reconnect snapshot for streamed text (node_stream frames are never
 * replayed; this is how a late-attaching client rebuilds the live tails).
 * Defensive by contract: any malformed shape yields `{}`.
 */
export function readHeartbeatTails(row: RunRow): Record<string, HeartbeatStreamTail> {
  const metadata = row.metadata;
  if (typeof metadata !== "object" || metadata === null) return {};
  const heartbeat = (metadata as Record<string, unknown>)._heartbeat;
  if (typeof heartbeat !== "object" || heartbeat === null) return {};
  const byNode = (heartbeat as Record<string, unknown>)._streaming_by_node;
  if (typeof byNode !== "object" || byNode === null || Array.isArray(byNode)) return {};

  const out: Record<string, HeartbeatStreamTail> = {};
  for (const [nodeId, raw] of Object.entries(byNode as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const snapshot = raw as Record<string, unknown>;
    const tail: HeartbeatStreamTail = {};
    if (typeof snapshot.live_text_tail === "string") tail.live_text_tail = snapshot.live_text_tail;
    if (typeof snapshot.chunks_received === "number") tail.chunks_received = snapshot.chunks_received;
    if (typeof snapshot.chars_streamed === "number") tail.chars_streamed = snapshot.chars_streamed;
    if (typeof snapshot.last_phase === "string" || snapshot.last_phase === null) {
      tail.last_phase = snapshot.last_phase;
    }
    out[nodeId] = tail;
  }
  return out;
}

/**
 * THE one lane-identity function for fan-out invocations. `node_id` alone is
 * NEVER a valid completion/cost key — parallel siblings share it. The studio
 * proved this live: a node stays Working until all siblings settle, keyed by
 * `dispatch_id` + `item_index`.
 */
export function invocationKeyOf(
  nodeId: string,
  dispatchId: string | null | undefined,
  itemIndex: number | null | undefined,
): string {
  // The wire's non-fan-out default is the EMPTY STRING (`dispatch_id=""` in
  // the Pydantic models), while client-side callers pass null — both mean
  // "the root invocation" and MUST produce the same key, or durable lanes
  // and token lanes split for every ordinary node.
  const dispatch =
    dispatchId === null || dispatchId === undefined || dispatchId === ""
      ? "root"
      : dispatchId;
  return `${nodeId}::${dispatch}:${itemIndex ?? 0}`;
}
