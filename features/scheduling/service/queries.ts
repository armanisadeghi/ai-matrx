// features/scheduling/service/queries.ts
//
// Read façade over supabase-js for the sch_* tables. Mirrors the structure of
// matrx-extend's src/lib/agenda/queries.ts.
//
// Writes have moved to schedulerClient.ts (HTTP /scheduler/*). This file keeps
// only the joined reads + the row→AgendaTask reshape (used by both Supabase
// reads and the HTTP TaskDetailResponse path).
//
// NEVER access .from('sch_*') outside this file — that's the rule that keeps
// the data shape consistent across the FE.

import { supabase } from "@/utils/supabase/client";
import { schedulerDb } from "@/utils/supabase/schedulerDb";
import { pgErrorToError } from "@ai-matrx/data";
import { readAllRows } from "@ai-matrx/data/db";
import type { TaskDetailResponse } from "./schedulerApi.types";
import type {
  AgendaTask,
  AgendaTrigger,
  AutoSuspendedBlock,
  SchAgentTaskRow,
  SchTaskMetadata,
  SchRunRow,
  SchTaskRow,
  SchTriggerRow,
} from "../types";

// ── The reusable select string (per spec §8) ───────────────────────────────

const SELECT_AGENT_TASK = `
  *,
  agent:sch_agent_task!inner(agent_id, prompt, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent),
  triggers:sch_trigger(id, task_id, type, config, enabled, next_due_at, last_fired_at, created_at, updated_at)
`;

/**
 * THE RECORD READ. Identical to `SELECT_AGENT_TASK` except the agent extension
 * is a LEFT embed.
 *
 * A LIST may narrow itself however it likes — `/schedules` is a list of agent
 * schedules and says so. A read of ONE record by its id may not: whatever it
 * excludes, the surface reports as "we could not open this", and a surface that
 * cannot open a row the database handed over says the untrue thing. `!inner`
 * here is exactly such an exclusion — it silently drops any task with no
 * `sch_agent_task` row, which `kind = 'ping'` (a live value of the table's CHECK
 * constraint: `kind = ANY (ARRAY['agent','tool','ping'])`) never has.
 */
const SELECT_TASK_RECORD = `
  *,
  agent:sch_agent_task(agent_id, prompt, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent),
  triggers:sch_trigger(id, task_id, type, config, enabled, next_due_at, last_fired_at, created_at, updated_at)
`;

// ── Joined row shape returned by Supabase ──────────────────────────────────

interface JoinedAgentTaskRow extends SchTaskRow {
  /** Null for a task with no agent extension row (`kind = 'ping'`). */
  agent: Pick<
    SchAgentTaskRow,
    | "agent_id"
    | "prompt"
    | "variables"
    | "persistent_conversation_id"
    | "auth_mode"
    | "max_runtime_seconds"
    | "max_concurrent"
  > | null;
  triggers: Array<
    Pick<
      SchTriggerRow,
      | "id"
      | "task_id"
      | "type"
      | "config"
      | "enabled"
      | "next_due_at"
      | "last_fired_at"
      | "created_at"
      | "updated_at"
    >
  >;
}

// ── Row → AgendaTask reshape (Supabase joined-read path) ───────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAutoSuspended(value: unknown): AutoSuspendedBlock | undefined {
  if (!isRecord(value)) return undefined;
  const restored = isRecord(value.restored) ? value.restored : undefined;
  return {
    source: typeof value.source === "string" ? value.source : undefined,
    at: typeof value.at === "string" ? value.at : undefined,
    run_id: typeof value.run_id === "string" ? value.run_id : undefined,
    failure_signature:
      typeof value.failure_signature === "string" ? value.failure_signature : undefined,
    consecutive_failures:
      typeof value.consecutive_failures === "number" ? value.consecutive_failures : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
    overriding_approval:
      typeof value.overriding_approval === "string" ? value.overriding_approval : undefined,
    override_notice:
      typeof value.override_notice === "string" ? value.override_notice : undefined,
    restored: restored
      ? {
          at: typeof restored.at === "string" ? restored.at : undefined,
          by: typeof restored.by === "string" ? restored.by : null,
          restored_approval:
            typeof restored.restored_approval === "string" ? restored.restored_approval : null,
        }
      : undefined,
  };
}

/**
 * The typed view of `sch_task.metadata`. Unknown keys are dropped, malformed
 * known keys read as absent — a missing suspension record renders as "not
 * suspended", which is the honest reading of a row that carries no record.
 */
export function parseTaskMetadata(raw: unknown): SchTaskMetadata {
  if (!isRecord(raw)) return {};
  const history = Array.isArray(raw.auto_suspended_history)
    ? raw.auto_suspended_history
        .map(parseAutoSuspended)
        .filter((b): b is AutoSuspendedBlock => b !== undefined)
    : undefined;
  return {
    auto_suspended: parseAutoSuspended(raw.auto_suspended),
    auto_suspended_history: history && history.length > 0 ? history : undefined,
    approval: typeof raw.approval === "string" ? raw.approval : undefined,
    approved_by: typeof raw.approved_by === "string" ? raw.approved_by : undefined,
    approved_at: typeof raw.approved_at === "string" ? raw.approved_at : undefined,
    approved_interval:
      typeof raw.approved_interval === "string" ? raw.approved_interval : undefined,
    handler_gate_pending: raw.handler_gate_pending,
  };
}

export function rowToAgendaTask(row: JoinedAgentTaskRow): AgendaTask {
  const triggers: AgendaTrigger[] = (row.triggers ?? []).map((t) => ({
    id: t.id,
    taskId: t.task_id,
    type: t.type,
    config: (t.config ?? {}) as Record<string, unknown>,
    enabled: t.enabled,
    nextDueAt: t.next_due_at,
    lastFiredAt: t.last_fired_at,
  }));

  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    metadata: parseTaskMetadata(row.metadata),
    title: row.title,
    description: row.description,
    queue: row.queue,
    surfaces: row.surfaces,
    enabled: row.enabled,
    expiresAt: row.expires_at,
    tags: row.tags,
    nextDueAt: row.next_due_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    // A task with no `sch_agent_task` row (`kind = 'ping'`) has no agent
    // extension. These are ABSENT, not defaulted-away: `agentId` is null and
    // `prompt` is empty, which is what every consumer already branches on for
    // a non-agent task. The alternative — dropping the row via `!inner` — is
    // what told an admin they had no access to a schedule they own.
    agentId: row.agent?.agent_id ?? null,
    prompt: row.agent?.prompt ?? "",
    variables: (row.agent?.variables ?? {}) as Record<string, unknown>,
    persistentConversationId: row.agent?.persistent_conversation_id ?? null,
    // The table's own defaults, so a ping task reads as the platform sees it.
    authMode: row.agent?.auth_mode ?? "ask",
    maxRuntimeSeconds: row.agent?.max_runtime_seconds ?? 600,
    maxConcurrent: row.agent?.max_concurrent ?? 1,

    triggers,
  };
}

// ── TaskDetailResponse → AgendaTask reshape (HTTP path) ────────────────────

export function taskDetailToAgendaTask(detail: TaskDetailResponse): AgendaTask {
  const t = detail.task;
  const agent = detail.agent_task;
  const triggers: AgendaTrigger[] = (detail.triggers ?? []).map((tr) => ({
    id: tr.id,
    taskId: tr.task_id,
    type: tr.type,
    config: (tr.config ?? {}) as Record<string, unknown>,
    enabled: tr.enabled,
    nextDueAt: tr.next_due_at,
    lastFiredAt: tr.last_fired_at,
  }));

  return {
    id: t.id,
    userId: t.user_id,
    kind: t.kind === "tool" ? "tool" : "agent",
    // The HTTP TaskResponse carries no metadata column. This reshape is used
    // for a freshly CREATED task only (createScheduledTask); every update path
    // re-reads the row through getAgentTask, which carries the real metadata.
    metadata: {},
    title: t.title,
    description: t.description,
    queue: t.queue,
    surfaces: t.surfaces,
    enabled: t.enabled,
    expiresAt: t.expires_at,
    tags: t.tags,
    nextDueAt: t.next_due_at,
    lastRunAt: t.last_run_at,
    createdAt: t.created_at,
    updatedAt: t.updated_at,

    agentId: agent?.agent_id ?? null,
    prompt: agent?.prompt ?? "",
    variables: (agent?.variables ?? {}) as Record<string, unknown>,
    persistentConversationId: agent?.persistent_conversation_id ?? null,
    authMode: agent?.auth_mode ?? "ask",
    maxRuntimeSeconds: agent?.max_runtime_seconds ?? 600,
    maxConcurrent: agent?.max_concurrent ?? 1,

    triggers,
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listAgentTasks(): Promise<AgendaTask[]> {
  // Excludes soft-deleted rows (deleted_at IS NOT NULL). Paused tasks
  // (enabled=false but deleted_at=NULL) remain visible -- pause is a
  // reversible UI state, delete is gone-from-user-view. Matches the
  // aidream /scheduler/tasks router and the partial index
  // sch_task_user_id_active_idx.
  // VIEW LAW: container-scoped via RLS (sch_task rows are user-scoped by policy)
  const rows = await readAllRows<JoinedAgentTaskRow>(
    ({ from, to }) =>
      schedulerDb(supabase)
        .schema("scheduler")
        .from("sch_task")
        .select(SELECT_AGENT_TASK, { count: "exact" })
        .eq("kind", "agent")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<JoinedAgentTaskRow[]>(),
    { label: "scheduler.sch_task user schedule roster" },
  );

  return rows.map(rowToAgendaTask);
}

export async function getAgentTask(id: string): Promise<AgendaTask | null> {
  // Returns null on soft-deleted rows so the edit/detail pages render
  // their "not found" branch instead of letting users re-edit a row
  // they've already deleted.
  //
  // THE DOOR LAW (2026-09-11, completed 2026-09-12): this read answers
  // `/schedules/<id>` for EVERY schedule, and carries NO predicate but the id
  // and the soft-delete boundary. RLS is the ceiling; nobody gains a row here
  // they could not already SELECT.
  //
  // It filtered `kind = 'agent'` once, so every platform `tool` system job the
  // alarm banner and the scanner-health page named came back as zero rows and
  // the page said "you don't have access" — a lie, since `platform_admin_all`
  // had admitted the admin and the CLIENT threw the row away. The first repair
  // widened that filter to `kind IN ('agent','tool')` and kept the
  // `sch_agent_task!inner` join, which left the same defect standing for
  // `kind = 'ping'` — a live value of the table's CHECK constraint, and one
  // with no agent extension row for the inner join to match. A widened filter
  // is still a filter. Both are gone.
  //
  // The rule this leaves behind: a read that backs a RECORD page narrows by
  // the id and nothing else. Anything else it excludes gets reported to a
  // person as an access failure it is not.
  const { data, error } = await schedulerDb(supabase)
    .schema("scheduler").from("sch_task")
    .select(SELECT_TASK_RECORD)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
    .returns<JoinedAgentTaskRow | null>();

  if (error) throw pgErrorToError(error);
  if (!data) return null;
  return rowToAgendaTask(data);
}

// ── Writes that the HTTP /scheduler/* surface doesn't cover yet ────────────
//
// /scheduler/tasks/{id} PATCH only patches task fields (title, description,
// queue, surfaces, enabled, expires_at, tags). Agent-extension fields
// (prompt, variables, agent_id, persistent_conversation_id, auth_mode,
// max_runtime_seconds, max_concurrent) live on sch_agent_task and have no
// HTTP equivalent today. Until aidream exposes a PATCH for those, we keep
// this one focused Supabase write here.

export interface AgentTaskFieldsPatch {
  agent_id?: string | null;
  prompt?: string;
  variables?: Record<string, unknown>;
  persistent_conversation_id?: string | null;
  auth_mode?: SchAgentTaskRow["auth_mode"];
  max_runtime_seconds?: number;
  max_concurrent?: number;
}

export async function updateAgentTaskFields(
  id: string,
  patch: AgentTaskFieldsPatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await schedulerDb(supabase)
    .schema("scheduler").from("sch_agent_task")
    .update(patch)
    .eq("id", id);
  if (error) throw pgErrorToError(error);
}

// ── Run history ────────────────────────────────────────────────────────────

export async function listRunsForTask(
  taskId: string,
  limit = 20,
): Promise<SchRunRow[]> {
  const { data, error } = await schedulerDb(supabase)
    .schema("scheduler").from("sch_run")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw pgErrorToError(error);
  return (data ?? []) as SchRunRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function stripTriggerType(
  trigger: { type: string } & Record<string, unknown>,
): Record<string, unknown> {
  const { type: _type, ...rest } = trigger;
  return rest;
}

/**
 * SYSTEM SCHEDULE ALARMS — the schedules that need a human.
 *
 * `scheduler.sch_task` carries only the canonical std_* policies (D140), so a
 * console read shows the VIEWER'S OWN schedules and a service-owned system
 * schedule is invisible. On 2026-08-23 that let an APPROVED nightly be
 * repeat-guard-suspended and sit unread for a day. This is the super-admin
 * SECURITY DEFINER read that makes it visible without touching RLS —
 * `scheduler.system_schedule_alarms` returns ONLY rows needing a human
 * (suspended / overdue past grace / last run failed), so it can never become
 * wallpaper. A non-super-admin caller is refused by the function itself.
 */
export interface SystemScheduleAlarm {
  task_id: string;
  title: string;
  alarm: "suspended" | "overdue" | "failing";
  severity: "critical" | "warning";
  detail: string;
  enabled: boolean;
  next_due_at: string | null;
  last_run_at: string | null;
  suspended_at: string | null;
  consecutive_failures: number | null;
}

export async function fetchSystemScheduleAlarms(
  overdueGraceMinutes = 90,
): Promise<SystemScheduleAlarm[]> {
  const { data, error } = await schedulerDb(supabase).rpc("system_schedule_alarms", {
    p_overdue_grace_minutes: overdueGraceMinutes,
  });
  if (error) throw pgErrorToError(error);
  return (data ?? []) as SystemScheduleAlarm[];
}
