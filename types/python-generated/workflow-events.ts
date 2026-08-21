// AUTO-GENERATED — do not edit manually.
// Sources:
//   matrx_graph.types.events                  — the durable workflow run events
//   matrx_graph.types.primitives              — run status vocabulary
//   aidream.services.runtime.workflow_events  — ephemeral node_stream,
//                                               router handshake, run_announce
// Run: uv run python scripts/generate_types.py workflow-events
//   or fetch via `pnpm sync-types` (pulls /schema/bundle/workflow-events-ts).
//
// The backend emits each durable event as `{event: "data", data: {event:
// "<one_of>", ...}}` on the NDJSON run stream, and as `data:` JSON frames on
// the per-run SSE feed (`GET /runs/{id}/events/stream`).

// --- Run status vocabulary ---

/** Every value `workflow.run.status` can hold — scheduler outcomes plus the
 *  transitional control states (`pausing` / `cancelling`). */
export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "paused"
  | "interrupted"
  | "errored"
  | "completed"
  | "failed"
  | "cancelled"
  | "pausing"
  | "cancelling";

/** Finished forever — no resume, no recovery. */
export const TERMINAL_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set<WorkflowRunStatus>(["completed", "failed", "cancelled"]);

/** The scheduler is (or is about to be) making progress. */
export const ACTIVE_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set<WorkflowRunStatus>(["pending", "running", "pausing", "cancelling"]);

// --- Durable scheduler events (recorded in wf_node_events, replayed) ---

export interface RunStartedEvent {
  ts: string;
  event: "run_started";
  run_id: string;
  thread_id: string;
  definition_id: string;
  definition_hash: string;
}

export interface NodeStartedEvent {
  ts: string;
  event: "node_started";
  run_id: string;
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  inputs: Record<string, unknown>;
}

export interface NodeCompletedEvent {
  ts: string;
  event: "node_completed";
  run_id: string;
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  duration_ms: number;
  output: Record<string, unknown>;
  output_kind: string | null;
  output_kind_ok: boolean | null;
  output_kind_errors: string[] | null;
  output_kind_version: number | null;
  output_kind_degraded: string | null;
  metadata: Record<string, unknown> | null;
}

export interface NodeSkippedEvent {
  ts: string;
  event: "node_skipped";
  run_id: string;
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  output: Record<string, unknown>;
}

export interface NodeFailedEvent {
  ts: string;
  event: "node_failed";
  run_id: string;
  step: number;
  node_id: string;
  spec_type: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  invocation_count?: number;
  error_type: string;
  error_message: string;
  error: Record<string, unknown> | null;
}

export interface NodeRetryScheduledEvent {
  ts: string;
  event: "node_retry_scheduled";
  run_id: string;
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

export interface NodeProgressEvent {
  ts: string;
  event: "node_progress";
  run_id: string;
  step: number;
  node_id: string;
  attempt: number;
  dispatch_id?: string;
  item_index?: number;
  message: string;
  fraction: number | null;
  current: number | null;
  total: number | null;
}

export interface CheckpointSavedEvent {
  ts: string;
  event: "checkpoint_saved";
  run_id: string;
  checkpoint_id: string;
  step: number;
  parent_checkpoint_id: string | null;
}

export interface RunInterruptedEvent {
  ts: string;
  event: "run_interrupted";
  run_id: string;
  node_id: string;
  payload: Record<string, unknown>;
  checkpoint_id: string | null;
}

export type RunStatus = "pending" | "running" | "paused" | "interrupted" | "errored" | "completed" | "failed" | "cancelled";

export interface RunCompletedEvent {
  ts: string;
  event: "run_completed";
  run_id: string;
  status: RunStatus;
  steps_executed: number;
  last_outputs: Record<string, unknown>;
  channel_values: Record<string, unknown>;
}

export interface RunFailedEvent {
  ts: string;
  event: "run_failed";
  run_id: string;
  status: RunStatus;
  steps_executed: number;
  error_type: string;
  error_message: string;
}

export interface RunCancelledEvent {
  ts: string;
  event: "run_cancelled";
  run_id: string;
  status: RunStatus;
  steps_executed: number;
  reason: "graceful" | "immediate";
}

export interface RunPausedEvent {
  ts: string;
  event: "run_paused";
  run_id: string;
  status: RunStatus;
  steps_executed: number;
  checkpoint_id: string | null;
}

export interface RunResumedEvent {
  ts: string;
  event: "run_resumed";
  run_id: string;
  from_checkpoint_id: string;
  mode: "pause" | "interrupt" | "user_skip" | "user_manual" | "retry";
}

export interface RunErroredEvent {
  ts: string;
  event: "run_errored";
  run_id: string;
  status: RunStatus;
  steps_executed: number;
  node_id: string;
  step: number;
  attempt: number;
  error_type: string;
  error_message: string;
  checkpoint_id: string | null;
}

export interface NodeEmittedEvent {
  ts: string;
  event: "node_emitted";
  run_id: string;
  step: number;
  node_id: string;
  attempt: number;
  mode: "confirmation" | "summary" | "full" | "restructured";
  payload: Record<string, unknown>;
  component_ref: string | null;
  surface: string;
  title: string | null;
}

export interface NodeCostEvent {
  ts: string;
  event: "node_cost";
  run_id: string;
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
  model: string | null;
  models: string[];
  conversation_id: string | null;
  request_id: string | null;
}

export interface WorkSetProgressEvent {
  ts: string;
  event: "work_set_progress";
  run_id: string;
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

export interface SubgraphRunLinkedEvent {
  ts: string;
  event: "subgraph_run_linked";
  run_id: string;
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

/** The durable scheduler events — recorded in wf_node_events and replayed
 *  on reconnect via the per-run `seq` cursor. */
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

// --- Ephemeral live-token frame (never persisted, never replayed) ---

export interface NodeStreamEvent {
  event: "node_stream";
  run_id: string;
  node_id: string | null;
  kind: "chunk" | "reasoning" | "phase" | "tool" | "warning" | "record_update" | "resource_changed";
  delta: string;
  stream_seq: number;
  ts: string;
  chunks_received: number;
  chars_streamed: number;
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

// --- Router handshake frames ---
// Emitted on the synchronous POST /workflows/{id}/runs response BEFORE the
// run detaches to wf_node_events. They only carry the run_id (plus a note) so
// the client can adopt it and hand off to the live event feed.

export interface WorkflowRunStartedEvent {
  [key: string]: unknown;
  event: "workflow_run_started";
  run_id: string;
}

export interface WorkflowRunResumedEvent {
  [key: string]: unknown;
  event: "workflow_run_resumed";
  run_id: string;
  checkpoint_id: string;
}

export interface WorkflowRunDetachedEvent {
  [key: string]: unknown;
  event: "workflow_run_detached";
  run_id: string;
  message: string;
}

export type WorkflowRouterEvent =
  | WorkflowRunStartedEvent
  | WorkflowRunResumedEvent
  | WorkflowRunDetachedEvent;

/** Every frame a client can see on a run's stream. */
export type WorkflowStreamEvent =
  | WorkflowRunEvent
  | NodeStreamEvent
  | WorkflowRouterEvent;

// --- User-scoped run announcements (GET /runs/stream) ---
// Deliberately OUTSIDE WorkflowStreamEvent: fired by a Postgres trigger on
// every workflow.run INSERT + real status transition owned by the caller.
// EPHEMERAL — no SSE id, no replay; the runs-list fetch is the snapshot.

export interface RunAnnounceEvent {
  event: "run_announce";
  run_id: string;
  workflow_id: string;
  status: string;
  kind: "inserted" | "status";
  ts: string;
}

export function isRunAnnounceEvent(value: unknown): value is RunAnnounceEvent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { event?: unknown; run_id?: unknown };
  return (
    candidate.event === "run_announce" &&
    typeof candidate.run_id === "string"
  );
}
