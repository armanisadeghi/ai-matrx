// features/scheduling/types.ts
//
// Wire shapes for the sch_* tables and the flattened AgendaTask the UI consumes.
// Mirrors the structure documented in docs/SCHEDULING.md.
//
// The Supabase rows are stored as `Sch*Row` (snake_case, mirrors the DB).
// The hydrated, FE-friendly view is `AgendaTask` (joined + camelCased).

// ── Trigger types ──────────────────────────────────────────────────────────

export type TriggerType =
  | "one-shot"
  | "interval"
  | "cron"
  | "heartbeat"
  | "context-match"
  | "event"
  | "manual"
  | "dependency";

export type OneShotConfig = { at: string };
export type IntervalConfig = { every_seconds: number };
export type CronConfig = { expression: string; tz: string };
export type HeartbeatConfig = { every_seconds: number };
export type ContextMatchConfig = {
  kind?: string;
  url_pattern?: string;
  hostname?: string;
};

export type TriggerConfig =
  | ({ type: "one-shot" } & OneShotConfig)
  | ({ type: "interval" } & IntervalConfig)
  | ({ type: "cron" } & CronConfig)
  | ({ type: "heartbeat" } & HeartbeatConfig)
  | ({ type: "context-match" } & ContextMatchConfig);

// ── Surfaces ───────────────────────────────────────────────────────────────

export type Surface =
  | "any"
  | "chrome-extension-chat"
  | "desktop"
  | "web"
  | "mobile"
  | "sandbox"
  | "server";

// ── Run status ─────────────────────────────────────────────────────────────

export type RunStatus =
  | "queued"
  | "claimed"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "skipped";

export type AuthMode = "ask" | "auto";

// ── DB row shapes (snake_case, matches Supabase) ───────────────────────────

/**
 * What the repeat guard writes under `sch_task.metadata.auto_suspended` when
 * it switches a schedule off (aidream `matrx_scheduler/repeat_guard.py`), and
 * what the admin restore adds under `restored` when a person puts it back
 * (aidream `services/scheduling/admin.py`). Every field is optional because
 * the block is written by a server the client does not version-lock with.
 */
export interface AutoSuspendedBlock {
  source?: string;
  at?: string;
  run_id?: string;
  failure_signature?: string;
  consecutive_failures?: number;
  reason?: string;
  /** Present when the guard overrode a human approval — in those words. */
  overriding_approval?: string;
  override_notice?: string;
  /** Present only on history entries: who re-enabled it and what that restored. */
  restored?: {
    at?: string;
    by?: string | null;
    restored_approval?: string | null;
  };
}

/**
 * The parts of `sch_task.metadata` the UI reads. `approval` / `approved_*`
 * are the recorded human approval of a system schedule
 * (common-docs/policies/no-unapproved-schedules.md); the rest is the guard's
 * suspension record and its history.
 */
export interface SchTaskMetadata {
  auto_suspended?: AutoSuspendedBlock;
  auto_suspended_history?: AutoSuspendedBlock[];
  approval?: string;
  approved_by?: string;
  approved_at?: string;
  approved_interval?: string;
  handler_gate_pending?: unknown;
}

/**
 * `agent` = a user's scheduled agent run (editable at /schedules/[id]/edit).
 * `tool` = a registered platform system job (cadence/args/enablement are
 * controlled from the System jobs console; enabling goes through the admin
 * PATCH, never the user PATCH, which refuses non-agent kinds).
 */
export type SchedulableKind = "agent" | "tool";

export interface SchTaskRow {
  id: string;
  user_id: string;
  kind: SchedulableKind;
  metadata: Record<string, unknown> | null;
  title: string;
  description: string | null;
  queue: string;
  surfaces: Surface[];
  enabled: boolean;
  expires_at: string | null;
  tags: string[];
  next_due_at: string | null;
  last_run_at: string | null;
  /**
   * Non-null when the user soft-deleted this task. All user-facing read
   * paths (`listAgentTasks`, `getAgentTask`, the aidream `/scheduler/*`
   * router) filter `deleted_at IS NULL`. The column is kept on the row
   * shape so admin tooling (which goes direct to Supabase) can observe
   * the tombstone.
   */
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchAgentTaskRow {
  id: string;
  agent_id: string | null;
  prompt: string;
  variables: Record<string, unknown>;
  persistent_conversation_id: string | null;
  auth_mode: AuthMode;
  max_runtime_seconds: number;
  max_concurrent: number;
}

export interface SchTriggerRow {
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

export interface SchRunRow {
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
  claim_token: string | null;
  claim_expires_at: string | null;
  result_summary: string | null;
  error_message: string | null;
  result_metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── output_ref polymorphic pointer (spec §6) ───────────────────────────────

export type OutputRefKind = "conversation" | "capture" | "workflow_run";

export type OutputRef = {
  /** Known kinds switch via type narrowing; unknown kinds fall through to the default branch in renderers. */
  kind: OutputRefKind | (string & {});
  id: string;
};

// ── Flattened FE-friendly shape ────────────────────────────────────────────

export interface AgendaTask {
  id: string;
  userId: string;
  kind: SchedulableKind;
  /** Parsed `sch_task.metadata` — suspension record + recorded approval. */
  metadata: SchTaskMetadata;
  title: string;
  description: string | null;
  queue: string;
  surfaces: Surface[];
  enabled: boolean;
  expiresAt: string | null;
  tags: string[];
  nextDueAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;

  // agent extension
  agentId: string | null;
  prompt: string;
  variables: Record<string, unknown>;
  persistentConversationId: string | null;
  authMode: AuthMode;
  maxRuntimeSeconds: number;
  maxConcurrent: number;

  // triggers (v0 = at most 1)
  triggers: AgendaTrigger[];
}

export interface AgendaTrigger {
  id: string;
  taskId: string;
  type: TriggerType;
  config: Record<string, unknown>;
  enabled: boolean;
  nextDueAt: string | null;
  lastFiredAt: string | null;
}

// ── Create / Update payloads (what callers pass to the service) ────────────

export interface CreateAgentTaskInput {
  title: string;
  description?: string | null;
  surfaces?: Surface[];
  tags?: string[];
  queue?: string;
  expiresAt?: string | null;

  agentId?: string | null;
  prompt: string;
  variables?: Record<string, unknown>;
  persistentConversationId?: string | null;
  authMode?: AuthMode;
  maxRuntimeSeconds?: number;
  maxConcurrent?: number;

  trigger: TriggerConfig;
}

export interface UpdateAgentTaskInput {
  taskPatch?: Partial<
    Pick<
      SchTaskRow,
      | "title"
      | "description"
      | "surfaces"
      | "tags"
      | "queue"
      | "enabled"
      | "expires_at"
    >
  >;
  agentPatch?: Partial<
    Pick<
      SchAgentTaskRow,
      | "agent_id"
      | "prompt"
      | "variables"
      | "persistent_conversation_id"
      | "auth_mode"
      | "max_runtime_seconds"
      | "max_concurrent"
    >
  >;
  trigger?: TriggerConfig | null;
}
