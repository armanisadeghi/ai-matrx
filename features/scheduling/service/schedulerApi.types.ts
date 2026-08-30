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
  taxonomy_node_id: string | null;
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
  /**
   * True when a create returned an EXISTING identical schedule instead of
   * inserting a new one (THE SCHEDULER DUPLICATE GUARD). The request SUCCEEDED
   * and `task` is the schedule that was already there — never tell the user
   * something new was created when this is true.
   */
  deduplicated?: boolean;
}

// ── Duplicates (THE SCHEDULER DUPLICATE GUARD) ─────────────────────────────

export interface DuplicateScheduleMember {
  id: string;
  title: string | null;
  enabled: boolean;
  created_at: string | null;
  /** True for the OLDEST schedule in the group — the one that is not redundant. */
  is_original: boolean;
}

export interface DuplicateScheduleGroup {
  fingerprint: string;
  members: DuplicateScheduleMember[];
  /** How many schedules in this group pay for work already being done. */
  redundant_count: number;
  /**
   * How many are still enabled. A group whose extras are all paused is
   * resolved — it costs nothing — and must not be shown as a live problem.
   */
  enabled_count: number;
}

export interface DuplicateScheduleResponse {
  groups: DuplicateScheduleGroup[];
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
  /** Canonical Feature Registry identity; required by the API for tool jobs. */
  taxonomy_node_id?: string | null;
  agent_task?: AgentTaskCreate | null;
  trigger?: TriggerCreate | null;
  /**
   * Create even when an identical live schedule already exists. Default false:
   * an identical create returns the EXISTING schedule (`deduplicated: true`)
   * rather than inserting a twin, so a double-click or a retried call cannot
   * produce two always-on schedules doing one job. Set true only when a second
   * schedule is genuinely wanted.
   */
  force?: boolean;
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

// ── System jobs (admin) ────────────────────────────────────────────────────
//
// Wire types for the aidream `/scheduling/admin/system-tasks` admin surface —
// recurring SERVER jobs (kind=tool) controllable from the admin console.
// The contract is deliberately defensive: aidream may return nulls for any
// nested field, so consumers must not assume `trigger` / `last_run` exist.

export interface SystemTaskTrigger {
  id: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  next_due_at: string | null;
}

export interface SystemTaskLastRun {
  id: string;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
}

export interface SystemTaskTaxonomyNode {
  id: string;
  slug: string;
  name: string;
  level: string;
  parent_id?: string | null;
}

export interface SystemTaskResponse {
  id: string;
  title: string;
  description?: string | null;
  tool_name?: string | null;
  enabled: boolean;
  handler_gate_pending: boolean;
  handler_registered: boolean;
  taxonomy_node_id: string;
  taxonomy_path: SystemTaskTaxonomyNode[];
  variables_args?: Record<string, unknown>;
  trigger?: SystemTaskTrigger | null;
  last_run?: SystemTaskLastRun | null;
}

export interface SystemTaskListResponse {
  tasks: SystemTaskResponse[];
  taxonomy_nodes: SystemTaskTaxonomyNode[];
}

export interface SystemTaskPatchRequest {
  enabled?: boolean | null;
  taxonomy_node_id?: string | null;
  trigger?: {
    type?: string | null;
    config?: Record<string, unknown> | null;
  } | null;
  variables_args?: Record<string, unknown> | null;
}

// ── DB jobs (admin, pg_cron) ───────────────────────────────────────────────
//
// Wire types for `/scheduling/admin/db-jobs` — the database's own scheduled
// jobs (`cron.job`, SQL running inside Postgres), on the same console per
// Arman's 2026-08-29 extension of the schedules ruling. Hand-written mirrors
// of aidream's DbJob* Pydantic models (aidream/api/routers/scheduling.py):
// the generated api-types contract gains them on the next live sync, at
// which point these become aliases.

export interface DbJobLastRun {
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  return_message: string | null;
}

export interface DbJobResponse {
  jobid: number;
  jobname: string | null;
  schedule: string;
  command: string;
  active: boolean;
  taxonomy_node_id: string;
  taxonomy_path: SystemTaskTaxonomyNode[];
  last_run: DbJobLastRun | null;
}

export interface DbJobListResponse {
  jobs: DbJobResponse[];
  taxonomy_nodes: SystemTaskTaxonomyNode[];
}

export interface DbJobPatchRequest {
  schedule?: string;
  active?: boolean;
  taxonomy_node_id?: string;
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
