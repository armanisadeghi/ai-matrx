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
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { TaskDetailResponse } from "./schedulerApi.types";
import type {
  AgendaTask,
  AgendaTrigger,
  SchAgentTaskRow,
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

// ── Joined row shape returned by Supabase ──────────────────────────────────

interface JoinedAgentTaskRow extends SchTaskRow {
  agent: Pick<
    SchAgentTaskRow,
    | "agent_id"
    | "prompt"
    | "variables"
    | "persistent_conversation_id"
    | "auth_mode"
    | "max_runtime_seconds"
    | "max_concurrent"
  >;
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

    agentId: row.agent.agent_id,
    prompt: row.agent.prompt,
    variables: (row.agent.variables ?? {}) as Record<string, unknown>,
    persistentConversationId: row.agent.persistent_conversation_id,
    authMode: row.agent.auth_mode,
    maxRuntimeSeconds: row.agent.max_runtime_seconds,
    maxConcurrent: row.agent.max_concurrent,

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
    kind: t.kind as "agent",
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
  const { data, error } = await supabase
    .from("sch_task")
    .select(SELECT_AGENT_TASK)
    .eq("kind", "agent")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw pgErrorToError(error);
  return ((data ?? []) as unknown as JoinedAgentTaskRow[]).map(rowToAgendaTask);
}

export async function getAgentTask(id: string): Promise<AgendaTask | null> {
  // Returns null on soft-deleted rows so the edit/detail pages render
  // their "not found" branch instead of letting users re-edit a row
  // they've already deleted.
  const { data, error } = await supabase
    .from("sch_task")
    .select(SELECT_AGENT_TASK)
    .eq("kind", "agent")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw pgErrorToError(error);
  if (!data) return null;
  return rowToAgendaTask(data as unknown as JoinedAgentTaskRow);
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
  const { error } = await supabase
    .from("sch_agent_task")
    .update(patch)
    .eq("id", id);
  if (error) throw pgErrorToError(error);
}

// ── Run history ────────────────────────────────────────────────────────────

export async function listRunsForTask(
  taskId: string,
  limit = 20,
): Promise<SchRunRow[]> {
  const { data, error } = await supabase
    .from("sch_run")
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
