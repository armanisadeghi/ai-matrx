// features/scheduling/service/queries.ts
//
// Façade over supabase-js for the sch_* tables. Mirrors the structure of
// matrx-extend's src/lib/agenda/queries.ts (cited 8× in docs/SCHEDULING.md).
//
// NEVER access .from('sch_*') outside this file — that's the rule that keeps
// the data shape consistent across the FE.

import { supabase } from "@/utils/supabase/client";
import type {
  AgendaTask,
  AgendaTrigger,
  CreateAgentTaskInput,
  SchAgentTaskRow,
  SchRunRow,
  SchTaskRow,
  SchTriggerRow,
  TriggerConfig,
  UpdateAgentTaskInput,
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

// ── Row → AgendaTask reshape ───────────────────────────────────────────────

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

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listAgentTasks(): Promise<AgendaTask[]> {
  const { data, error } = await supabase
    .from("sch_task")
    .select(SELECT_AGENT_TASK)
    .eq("kind", "agent")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as JoinedAgentTaskRow[]).map(rowToAgendaTask);
}

export async function getAgentTask(id: string): Promise<AgendaTask | null> {
  const { data, error } = await supabase
    .from("sch_task")
    .select(SELECT_AGENT_TASK)
    .eq("kind", "agent")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToAgendaTask(data as unknown as JoinedAgentTaskRow);
}

// ── Writes ─────────────────────────────────────────────────────────────────

/**
 * Atomic create via the create_agent_task RPC (migrations/sch_create_agent_task.sql).
 * Returns the new task id; caller can then re-fetch via getAgentTask.
 *
 * The Python authoritative `next_due_at` computer will eventually move
 * server-side. Until then, callers pass a precomputed value (see
 * features/scheduling/utils/nextFireTime.ts).
 */
export async function createAgentTask(
  input: CreateAgentTaskInput,
  nextDueAt: string | null,
): Promise<string> {
  const triggerConfig = stripTriggerType(input.trigger);

  const { data, error } = await supabase.rpc("create_agent_task", {
    p_title: input.title,
    p_prompt: input.prompt,
    p_trigger_type: input.trigger.type,
    p_trigger_config: triggerConfig,
    p_description: input.description ?? null,
    p_surfaces: input.surfaces ?? ["any"],
    p_tags: input.tags ?? [],
    p_queue: input.queue ?? "default",
    p_expires_at: input.expiresAt ?? null,
    p_next_due_at: nextDueAt,
    p_agent_id: input.agentId ?? null,
    p_variables: input.variables ?? {},
    p_persistent_conversation_id: input.persistentConversationId ?? null,
    p_auth_mode: input.authMode ?? "ask",
    p_max_runtime_seconds: input.maxRuntimeSeconds ?? 600,
    p_max_concurrent: input.maxConcurrent ?? 1,
  });

  if (error) throw error;
  if (typeof data !== "string") {
    throw new Error("create_agent_task did not return a task id");
  }
  return data;
}

export async function updateAgentTask(
  id: string,
  patch: UpdateAgentTaskInput,
  nextDueAt?: string | null,
): Promise<void> {
  if (patch.taskPatch && Object.keys(patch.taskPatch).length > 0) {
    const { error } = await supabase
      .from("sch_task")
      .update(patch.taskPatch)
      .eq("id", id);
    if (error) throw error;
  }

  if (patch.agentPatch && Object.keys(patch.agentPatch).length > 0) {
    const { error } = await supabase
      .from("sch_agent_task")
      .update(patch.agentPatch)
      .eq("id", id);
    if (error) throw error;
  }

  if (patch.trigger !== undefined && patch.trigger !== null) {
    // v0 = at most one trigger per task. Look up the existing one; update if
    // it exists, insert if not.
    const { data: existing, error: selErr } = await supabase
      .from("sch_trigger")
      .select("id")
      .eq("task_id", id)
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;

    const config = stripTriggerType(patch.trigger);
    if (existing) {
      const { error } = await supabase
        .from("sch_trigger")
        .update({
          type: patch.trigger.type,
          config,
          next_due_at: nextDueAt ?? null,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("sch_trigger").insert({
        task_id: id,
        type: patch.trigger.type,
        config,
        enabled: true,
        next_due_at: nextDueAt ?? null,
      });
      if (error) throw error;
    }
  }
}

export async function deleteAgentTask(id: string): Promise<void> {
  // FK CASCADE drops sch_agent_task / sch_trigger / sch_run rows.
  const { error } = await supabase.from("sch_task").delete().eq("id", id);
  if (error) throw error;
}

export async function setTaskEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("sch_task")
    .update({ enabled })
    .eq("id", id);
  if (error) throw error;
}

// ── Manual fire ────────────────────────────────────────────────────────────

/**
 * Enqueue a manual run via the sch_enqueue_manual_run RPC. The RPC:
 *  - validates task ownership (or super_admin)
 *  - stamps user_id from the task row (not the caller)
 *  - sets status='queued', surface=NULL (claiming scanner stamps its own)
 *
 * The matrx-scheduler picks up queued runs every tick (~5s) on whichever
 * surface the task targets ('any' / 'server' / 'chrome-extension-chat'…).
 */
export async function runTaskNow(taskId: string): Promise<string> {
  const { data, error } = await supabase.rpc("sch_enqueue_manual_run", {
    p_task_id: taskId,
  });
  if (error) throw error;
  if (!data) throw new Error("enqueue_manual_run returned no id");
  return String(data);
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

  if (error) throw error;
  return (data ?? []) as SchRunRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripTriggerType(trigger: TriggerConfig): Record<string, unknown> {
  // Drop the `type` discriminator before storing in jsonb config column.
  const { type: _type, ...rest } = trigger as TriggerConfig & {
    type: string;
  };
  return rest as Record<string, unknown>;
}
