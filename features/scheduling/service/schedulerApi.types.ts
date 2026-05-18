// features/scheduling/service/schedulerApi.types.ts
//
// Wire types for the aidream /scheduler/* HTTP router (matrx-scheduler
// package). Mirrors the Pydantic models defined in
// packages/matrx-scheduler/matrx_scheduler/api/router_scheduler.py.
//
// All endpoints require a Bearer JWT and are RLS-scoped per request.

import type {
  AuthMode,
  OutputRef,
  RunStatus,
  Surface,
  TriggerType,
} from "../types";

// ── Task ───────────────────────────────────────────────────────────────────

export type TaskKind = "agent" | "tool" | "ping";

export interface TaskResponse {
  id: string;
  user_id: string;
  kind: TaskKind;
  title: string;
  description: string | null;
  queue: string;
  surfaces: Surface[];
  enabled: boolean;
  expires_at: string | null;
  tags: string[];
  next_due_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTaskFields {
  id: string;
  agent_id: string | null;
  prompt: string;
  variables: Record<string, unknown>;
  persistent_conversation_id: string | null;
  auth_mode: AuthMode;
  max_runtime_seconds: number;
  max_concurrent: number;
}

export interface TaskDetailResponse {
  task: TaskResponse;
  agent_task: AgentTaskFields | null;
  triggers: TriggerResponse[];
  recent_runs: RunResponse[];
}

export interface TaskListResponse {
  tasks: TaskResponse[];
  total: number;
}

// ── Trigger ────────────────────────────────────────────────────────────────

export interface TriggerResponse {
  id: string;
  task_id: string;
  user_id: string;
  type: TriggerType;
  config: Record<string, unknown>;
  enabled: boolean;
  next_due_at: string | null;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TriggerListResponse {
  triggers: TriggerResponse[];
}

// ── Run ────────────────────────────────────────────────────────────────────
//
// HTTP wire shape for sch_run. Mirrors the package's Pydantic
// `RunResponse` schema. The internal scanner-lease fields `claim_token`
// and `claim_expires_at` are intentionally NOT exposed here — they are
// private scheduler state, useful only for admin debugging, and the
// admin orphan-leases page reads them direct from Supabase via the
// scheduling-admin-service (where `SchRunRow` in `types.ts` does carry
// them). Keeping them off the HTTP wire prevents accidental coupling
// and keeps the user-facing surface minimal.

export interface RunResponse {
  id: string;
  task_id: string;
  trigger_id: string | null;
  user_id: string;
  status: RunStatus;
  surface: Surface | null;
  queue: string | null;
  output_ref: OutputRef | null;
  due_at: string;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  result_summary: string | null;
  error_message: string | null;
  result_metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface RunListResponse {
  runs: RunResponse[];
}

// ── Create / Patch request bodies ──────────────────────────────────────────

export interface AgentTaskCreate {
  agent_id?: string | null;
  prompt?: string;
  variables?: Record<string, unknown>;
  persistent_conversation_id?: string | null;
  auth_mode?: AuthMode;
  max_runtime_seconds?: number;
  max_concurrent?: number;
}

export interface TriggerCreate {
  type: TriggerType;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface TaskCreateRequest {
  kind: TaskKind;
  title: string;
  description?: string | null;
  queue?: string;
  surfaces?: Surface[];
  enabled?: boolean;
  expires_at?: string | null;
  tags?: string[];
  agent_task?: AgentTaskCreate | null;
  trigger?: TriggerCreate | null;
}

export interface TaskPatchRequest {
  title?: string;
  description?: string | null;
  queue?: string;
  surfaces?: Surface[];
  enabled?: boolean;
  expires_at?: string | null;
  tags?: string[];
}

export interface TriggerCreateRequest {
  task_id: string;
  type: TriggerType;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface TriggerPatchRequest {
  type?: TriggerType;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

// ── Compute / cron endpoints ───────────────────────────────────────────────

export interface ValidateCronRequest {
  expression: string;
  tz?: string;
  next_n?: number;
}

export interface ValidateCronResponse {
  valid: boolean;
  error: string | null;
  next_fires_utc: string[];
}

export interface PreviewFiresRequest {
  trigger_type: TriggerType;
  config?: Record<string, unknown>;
  n?: number;
}

export interface PreviewFiresResponse {
  next_fires_utc: string[];
  event_driven: boolean;
}

export interface ComputeNextDueRequest {
  trigger_type: TriggerType;
  config?: Record<string, unknown>;
}

export interface ComputeNextDueResponse {
  next_due_at: string | null;
  event_driven: boolean;
}

// ── Misc response shapes ───────────────────────────────────────────────────

export interface RunNowResponse {
  run_id: string;
}

export interface DeletedResponse {
  deleted: true;
  soft: boolean;
}

export interface ScannerStatusResponse {
  running: boolean;
  started_at: string | null;
  last_tick_at: string | null;
  last_tick_duration_ms: number | null;
  last_tick_claimed: number;
  last_tick_expired_sweeps: number;
  last_tick_manual_claimed: number;
  total_runs_dispatched: number;
  in_flight_count: number;
  consecutive_errors: number;
  error_message: string | null;
}

// ── List query params ──────────────────────────────────────────────────────

export interface ListTasksQuery {
  kind?: TaskKind;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListRunsQuery {
  task_id?: string;
  status?: RunStatus;
  limit?: number;
  offset?: number;
}
