/**
 * Runtime reconnect wire types — mirrors aidream's canonical reconnect surface
 * (`aidream/services/runtime/reconnect.py`, mounted at `/runtime`, public
 * `/api/runtime`). Hand-mirrored like the chat stream-event types because the
 * generated `types/python-generated/api-types.ts` predates the server ship;
 * when the OpenAPI types are next regenerated these can be swapped for the
 * generated shapes.
 *
 * The contract: identify (`GET /runtime/operations/by-link/conversation/{id}`)
 * → recover durable progress (`GET /runtime/executions/{id}/events?after_seq=`)
 * → follow live (`GET /runtime/executions/{id}/events/stream`, SSE,
 * `Last-Event-ID` = seq) → re-query the final result from the feature's own
 * tables (for chat: `loadConversation`). Token text is deliberately never
 * replayed — reconnect is status/progress until terminal, then a DB refetch.
 */

export type RuntimeExecutionStatus =
  | "pending"
  | "running"
  | "paused"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled";

export const TERMINAL_RUNTIME_STATUSES: ReadonlySet<RuntimeExecutionStatus> =
  new Set(["completed", "failed", "cancelled"]);

/** One root execution as the reconnecting client sees it (`OperationView`). */
export interface RuntimeOperationView {
  execution_id: string;
  type: string;
  status: RuntimeExecutionStatus;
  is_terminal: boolean;
  waiting_input: boolean;
  /** Decimal on the wire — may arrive as number or string; display-only. */
  cost: number | string;
  meters: Record<string, number | string>;
  link_kind: string | null;
  link_id: string | null;
  error: Record<string, unknown> | null;
  created_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_event_seq: number;
  events_path: string;
  stream_path: string;
}

export interface RuntimeOperationsByLinkResponse {
  link_kind: string;
  link_id: string;
  operation_count: number;
  operations: RuntimeOperationView[];
}

/**
 * One durable spine event on the SSE wire (`OperationEvent`). `kind` is the
 * lifecycle vocabulary: created | started | paused | resumed | waiting_input |
 * completed | failed | cancelled | checkpoint_saved | note.
 */
export interface RuntimeOperationEvent {
  seq: number | null;
  kind: string;
  execution_id: string;
  root_execution_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string | null;
}

/**
 * What the conversation record stores about a live server-side operation —
 * SERVER truth (from `/runtime`), so the "still working" indicator survives a
 * page refresh. `null`/absent means no known non-terminal operation.
 */
export interface ServerOperationState {
  executionId: string;
  status: RuntimeExecutionStatus;
  waitingInput: boolean;
  startedAt: string | null;
  /** ISO timestamp of the status fetch that produced this record. */
  checkedAt: string;
}
