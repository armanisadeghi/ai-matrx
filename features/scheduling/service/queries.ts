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
import { mergeJsonColumn, readAllRows } from "@ai-matrx/data/db";
import type { Database, Json } from "@/types/database.types";
import type { TaskDetailResponse } from "./schedulerApi.types";
import type {
  AgendaTask,
  AgendaTrigger,
  AlarmMuteBlock,
  AutoSuspendedBlock,
  SchAgentTaskRow,
  SchTaskMetadata,
  SchRunRow,
  SchTaskRow,
  SchTriggerRow,
} from "../types";
import {
  createScheduleLoadTimeout,
  createScheduleRosterLoadTimeout,
  SCHEDULE_DETAIL_LOAD_TIMEOUT_MESSAGE,
  SCHEDULE_ROSTER_LOAD_TIMEOUT_MESSAGE,
  SCHEDULE_RUNS_LOAD_TIMEOUT_MESSAGE,
} from "./schedule-roster-timeout";

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
      typeof value.failure_signature === "string"
        ? value.failure_signature
        : undefined,
    consecutive_failures:
      typeof value.consecutive_failures === "number"
        ? value.consecutive_failures
        : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
    verdict: typeof value.verdict === "string" ? value.verdict : undefined,
    overriding_approval:
      typeof value.overriding_approval === "string"
        ? value.overriding_approval
        : undefined,
    override_notice:
      typeof value.override_notice === "string"
        ? value.override_notice
        : undefined,
    restored: restored
      ? {
          at: typeof restored.at === "string" ? restored.at : undefined,
          by: typeof restored.by === "string" ? restored.by : null,
          restored_approval:
            typeof restored.restored_approval === "string"
              ? restored.restored_approval
              : null,
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
    approved_by:
      typeof raw.approved_by === "string" ? raw.approved_by : undefined,
    approved_at:
      typeof raw.approved_at === "string" ? raw.approved_at : undefined,
    approved_interval:
      typeof raw.approved_interval === "string"
        ? raw.approved_interval
        : undefined,
    handler_gate_pending: raw.handler_gate_pending,
    alarm_mute: parseAlarmMute(raw.alarm_mute),
    impact: parseImpact(raw.impact) ?? undefined,
  };
}

function parseAlarmMute(value: unknown): AlarmMuteBlock | undefined {
  if (!isRecord(value) || typeof value.until !== "string") return undefined;
  return {
    until: value.until,
    reason: typeof value.reason === "string" ? value.reason : undefined,
    by: typeof value.by === "string" ? value.by : undefined,
    at: typeof value.at === "string" ? value.at : undefined,
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
    organizationId: row.organization_id ?? null,
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
    // The HTTP TaskResponse does not carry organization_id; the record read
    // (getAgentTask → rowToAgendaTask) does, and every write path re-reads it.
    organizationId: null,
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
  const { controller, dispose } = createScheduleRosterLoadTimeout();
  let rows: JoinedAgentTaskRow[];
  try {
    rows = await readAllRows<JoinedAgentTaskRow>(
      ({ from, to }) =>
        schedulerDb(supabase)
          .schema("scheduler")
          // VIEW LAW: the roster is the signed-in user's own schedules; RLS
          // (sch_task owner policy) is the ceiling, and this list does not
          // take an org filter because a schedule is owned by its user.
          .from("sch_task")
          .select(SELECT_AGENT_TASK, { count: "exact" })
          .eq("kind", "agent")
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(controller.signal)
          .returns<JoinedAgentTaskRow[]>(),
      { label: "scheduler.sch_task user schedule roster" },
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(SCHEDULE_ROSTER_LOAD_TIMEOUT_MESSAGE, { cause: error });
    }
    throw error;
  } finally {
    dispose();
  }

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
  const { controller, dispose } = createScheduleLoadTimeout();
  let data: JoinedAgentTaskRow | null;
  let error: unknown;
  try {
    ({ data, error } = await schedulerDb(supabase)
      .schema("scheduler")
      .from("sch_task")
      .select(SELECT_TASK_RECORD)
      .eq("id", id)
      .is("deleted_at", null)
      .abortSignal(controller.signal)
      .maybeSingle()
      .returns<JoinedAgentTaskRow | null>());
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error(SCHEDULE_DETAIL_LOAD_TIMEOUT_MESSAGE, { cause });
    }
    throw cause;
  } finally {
    dispose();
  }

  if (controller.signal.aborted) {
    throw new Error(SCHEDULE_DETAIL_LOAD_TIMEOUT_MESSAGE, { cause: error });
  }
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
    .schema("scheduler")
    .from("sch_agent_task")
    .update(patch)
    .eq("id", id);
  if (error) throw pgErrorToError(error);
}

// ── Run history ────────────────────────────────────────────────────────────

export async function listRunsForTask(
  taskId: string,
  limit = 20,
  requiredRunIds: readonly string[] = [],
): Promise<SchRunRow[]> {
  const { controller, dispose } = createScheduleLoadTimeout();
  try {
    const { data, error } = await schedulerDb(supabase)
      .schema("scheduler")
      .from("sch_run")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .abortSignal(controller.signal)
      .returns<SchRunRow[]>();
    if (controller.signal.aborted) {
      throw new Error(SCHEDULE_RUNS_LOAD_TIMEOUT_MESSAGE, { cause: error });
    }
    if (error) throw pgErrorToError(error);

    const recentRuns = data ?? [];
    const missingRequiredIds = Array.from(new Set(requiredRunIds)).filter(
      (id) => !recentRuns.some((run) => run.id === id),
    );
    if (missingRequiredIds.length === 0) return recentRuns;

    // Both reads share one operation-level deadline. Historical enrichment
    // must fit inside the run history's 20-second terminal boundary, not add a
    // second full timeout after the recent-page query.
    const { data: requiredData, error: requiredError } = await schedulerDb(
      supabase,
    )
      .schema("scheduler")
      .from("sch_run")
      .select("*")
      .eq("task_id", taskId)
      .in("id", missingRequiredIds)
      .abortSignal(controller.signal)
      .returns<SchRunRow[]>();
    if (controller.signal.aborted) {
      throw new Error(SCHEDULE_RUNS_LOAD_TIMEOUT_MESSAGE, {
        cause: requiredError,
      });
    }
    if (requiredError) throw pgErrorToError(requiredError);

    return [...recentRuns, ...(requiredData ?? [])].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error(SCHEDULE_RUNS_LOAD_TIMEOUT_MESSAGE, { cause });
    }
    throw cause;
  } finally {
    dispose();
  }
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
 * (suspended / overdue past the grace knob / a failure streak), so it can
 * never become wallpaper. A non-super-admin caller is refused by the function.
 *
 * v2 (2026-09-14): every row is a DECISION, not a title — it carries the
 * failed run, the declared impact (the product pages this job feeds), the
 * approval, whether a run has succeeded since the guard switched it off, and
 * the row's own mute (`metadata.alarm_mute`). Muted rows ARE returned: the
 * global attention dock hides them until `muted_until`; the review page lists
 * them and un-mutes. Thresholds are the `scheduler.alarms.*` knobs, read by
 * the function itself.
 */
export interface SystemScheduleAlarm {
  task_id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  kind: string;
  alarm: "suspended" | "overdue" | "failing";
  severity: "critical" | "warning";
  detail: string;
  enabled: boolean;
  next_due_at: string | null;
  last_run_at: string | null;
  suspended_at: string | null;
  consecutive_failures: number | null;
  succeeded_since_suspension: boolean;
  last_run_id: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  last_run_finished_at: string | null;
  failed_streak: number;
  approval: string | null;
  impact: SystemTaskImpact[] | null;
  muted_until: string | null;
  mute_reason: string | null;
  mute_by: string | null;
  mute_at: string | null;
}

/**
 * One product page a system task feeds, declared by the job's registration
 * in aidream (`register_system_task(..., impact=[...])`) and reconciled onto
 * `sch_task.metadata.impact` at worker boot.
 */
export interface SystemTaskImpact {
  href: string;
  label: string;
  what: string;
}

function parseImpact(raw: unknown): SystemTaskImpact[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SystemTaskImpact[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    if (typeof entry.href !== "string" || typeof entry.label !== "string")
      continue;
    out.push({
      href: entry.href,
      label: entry.label,
      what: typeof entry.what === "string" ? entry.what : "",
    });
  }
  return out.length > 0 ? out : null;
}

export async function fetchSystemScheduleAlarms(): Promise<
  SystemScheduleAlarm[]
> {
  // `p_overdue_grace_minutes: null` = the scheduler.alarms.overdue_grace_minutes
  // knob. The argument survives only so the function identity stays put.
  const { data, error } = await schedulerDb(supabase).rpc(
    "system_schedule_alarms",
    {
      p_overdue_grace_minutes: undefined,
    },
  );
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((row) => ({
    ...row,
    alarm: row.alarm as SystemScheduleAlarm["alarm"],
    severity: row.severity as SystemScheduleAlarm["severity"],
    impact: parseImpact(row.impact),
  }));
}

/**
 * THE WAY OUT (Arman, 2026-09-14): a super-admin can say "this one is
 * supposed to be off" — for a while. The mute lives ON THE ROW
 * (`metadata.alarm_mute`), not in a browser, because it is a fact about the
 * schedule that every super-admin and every device must see: "the commerce
 * ticks are off because commerce is unbuilt" is not a personal preference.
 *
 * Written through RLS (`platform_admin_all` admits a super-admin to every
 * system schedule) with `mergeJsonColumn`, the canonical guarded jsonb merge —
 * never a whole-metadata overwrite, which would race the repeat guard's own
 * writes to the same column. No new SECURITY DEFINER door.
 *
 * A mute ALWAYS carries an `until`: silence that never ends is how the next
 * real outage gets missed. Only un-muting or the clock clears it.
 */
type SchTaskMuteRow = Pick<
  Database["scheduler"]["Tables"]["sch_task"]["Row"],
  "id" | "version" | "metadata"
>;

async function writeAlarmMute(
  taskId: string,
  next: {
    until: string;
    reason: string | null;
    by: string | null;
    at: string;
  } | null,
): Promise<void> {
  const db = schedulerDb(supabase);
  const result = await mergeJsonColumn<SchTaskMuteRow>({
    fetchCurrent: () =>
      db
        .from("sch_task")
        .select("id, version, metadata")
        .eq("id", taskId)
        .maybeSingle(),
    readColumn: (row) => row.metadata,
    merge: (current) => {
      const { alarm_mute: _dropped, ...rest } = current;
      return next ? { ...rest, alarm_mute: { ...next } satisfies Json } : rest;
    },
    applyUpdate: ({ value, expectedVersion, nextVersion }) =>
      db
        .from("sch_task")
        .update({ metadata: value, version: nextVersion })
        .eq("id", taskId)
        .eq("version", expectedVersion)
        .select("id, version, metadata")
        .maybeSingle(),
  });
  if (result.status === "saved") return;
  if (result.status === "not_found") {
    throw new Error(
      "This schedule no longer exists, so its alarm cannot be muted.",
    );
  }
  if (result.status === "conflict") {
    throw new Error(
      "Something else was editing this schedule at the same moment — try again.",
    );
  }
  throw result.error instanceof Error
    ? result.error
    : new Error(`The mute could not be saved: ${String(result.error)}`);
}

export async function muteSystemScheduleAlarm(args: {
  taskId: string;
  untilIso: string;
  reason: string | null;
  by: string | null;
}): Promise<void> {
  await writeAlarmMute(args.taskId, {
    until: args.untilIso,
    reason: args.reason,
    by: args.by,
    at: new Date().toISOString(),
  });
}

export async function clearSystemScheduleAlarmMute(
  taskId: string,
): Promise<void> {
  await writeAlarmMute(taskId, null);
}
