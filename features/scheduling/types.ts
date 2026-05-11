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

export interface SchTaskRow {
  id: string;
  user_id: string;
  kind: "agent";
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

export type OutputRef =
  | { kind: "conversation"; id: string }
  | { kind: "capture"; id: string }
  | { kind: "workflow_run"; id: string }
  | { kind: string; id: string };

// ── Flattened FE-friendly shape ────────────────────────────────────────────

export interface AgendaTask {
  id: string;
  userId: string;
  kind: "agent";
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
