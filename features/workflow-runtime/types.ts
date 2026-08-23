/**
 * Workflow runtime types — the runtime UI's entry point.
 *
 * The event vocabulary is GENERATED from the Python source of truth
 * (`matrx-graph`'s `types/events.py` + aidream's
 * `services/runtime/workflow_events.py`) and delivered here by
 * `pnpm sync-types` as `types/python-generated/workflow-events.ts`. It is the
 * same artifact workflow-studio consumes — do NOT hand-maintain event shapes.
 * This file used to be a manual mirror alongside the studio's, and drift
 * between the two (and the Python models) was the risk that pipeline removes.
 *
 * What stays hand-written here: the REST projections this UI reads
 * (`RunEventRecord`, `RunRow`) and the FE-only helpers — `invocationKeyOf`,
 * `parseSignalDelta`, `readHeartbeatTails`.
 */

export type {
  // Durable scheduler events
  RunStartedEvent,
  NodeStartedEvent,
  NodeCompletedEvent,
  NodeSkippedEvent,
  NodeFailedEvent,
  NodeRetryScheduledEvent,
  NodeProgressEvent,
  CheckpointSavedEvent,
  RunInterruptedEvent,
  RunCompletedEvent,
  RunFailedEvent,
  RunCancelledEvent,
  RunPausedEvent,
  RunResumedEvent,
  RunErroredEvent,
  NodeEmittedEvent,
  NodeCostEvent,
  WorkSetProgressEvent,
  SubgraphRunLinkedEvent,
  WorkflowRunEvent,
  // Ephemeral / router / announcement frames
  NodeStreamEvent,
  WorkflowRunStartedEvent,
  WorkflowRunResumedEvent,
  WorkflowRunDetachedEvent,
  WorkflowRouterEvent,
  WorkflowStreamEvent,
  RunAnnounceEvent,
  // Status vocabulary
  WorkflowRunStatus,
} from "@/types/python-generated/workflow-events";

export {
  TERMINAL_RUN_STATUSES,
  ACTIVE_RUN_STATUSES,
  isWorkflowRunEvent,
  isNodeStreamEvent,
  isRunAnnounceEvent,
} from "@/types/python-generated/workflow-events";

import type { WorkflowRunStatus } from "@/types/python-generated/workflow-events";

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
/**
 * A parsed refetch signal from a `record_update` / `resource_changed`
 * node_stream frame (Phase 3 — the signal→refetch pump). The wire delta is a
 * compact JSON summary emitted by aidream's ProgressTrackingEmitter; parsing
 * is tolerant — a malformed delta still yields a generic signal (revision
 * bump with no table), never a crash and never a silent drop.
 */
export interface RunRecordSignal {
  signalKind: "record_update" | "resource_changed";
  /** record_update: the matrx-orm table that changed. */
  table: string | null;
  recordId: string | null;
  status: string | null;
  /** resource_changed: namespaced resource kind (e.g. "fs.file"). */
  resourceKind: string | null;
  action: string | null;
  resourceId: string | null;
  /** Node that emitted it; null for the run-level emitter. */
  nodeId: string | null;
  receivedAt: number;
}

/** Parse a record_update / resource_changed delta into a RunRecordSignal.
 * NEVER throws — an unparseable delta is still a signal (all-null fields). */
export function parseSignalDelta(
  signalKind: "record_update" | "resource_changed",
  delta: string,
  nodeId: string | null,
  receivedAt: number,
): RunRecordSignal {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(delta);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // Tolerant by contract — the revision bump is the signal floor.
  }
  const str = (key: string): string | null => {
    const v = data[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  return {
    signalKind,
    table: signalKind === "record_update" ? str("table") : null,
    recordId: str("record_id"),
    status: str("status"),
    resourceKind: signalKind === "resource_changed" ? str("kind") : null,
    action: str("action"),
    resourceId: str("resource_id"),
    nodeId,
    receivedAt,
  };
}

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
  /**
   * The `run_result` runtime wrapper — additive, and absent on a server that
   * predates it. Rehydrated (and typed) at the ingest gate; see
   * `@ai-matrx/content-ir` (`wire/runtime-wrapper`).
   */
  result?: Record<string, unknown> | null;
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
