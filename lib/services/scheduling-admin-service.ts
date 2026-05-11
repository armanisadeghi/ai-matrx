// lib/services/scheduling-admin-service.ts
//
// Admin-side reads/writes for the sch_* spine. Uses the browser supabase
// client — admin escape hatch is in the RLS policies via is_platform_admin()
// (see migrations/sch_admin_rls.sql). Mirrors lib/services/agent-apps-admin-
// service.ts. NEVER call this from non-admin UI.

import { supabase } from "@/utils/supabase/client";
import type {
  RunStatus,
  SchAgentTaskRow,
  SchRunRow,
  SchTaskRow,
  SchTriggerRow,
} from "@/features/scheduling/types";

export interface AdminTaskRow extends SchTaskRow {
  agent: Pick<
    SchAgentTaskRow,
    | "agent_id"
    | "prompt"
    | "auth_mode"
    | "max_runtime_seconds"
    | "max_concurrent"
  > | null;
  trigger: Pick<SchTriggerRow, "type" | "config" | "enabled" | "next_due_at"> | null;
  user_email: string | null;
}

// ── List all-user tasks (admin) ────────────────────────────────────────────

export async function fetchAllTasksAdmin(options: {
  search?: string;
  surface?: string;
  enabled?: boolean | null;
  limit?: number;
} = {}): Promise<AdminTaskRow[]> {
  let q = supabase
    .from("sch_task")
    .select(
      `
      *,
      agent:sch_agent_task(agent_id, prompt, auth_mode, max_runtime_seconds, max_concurrent),
      trigger:sch_trigger(type, config, enabled, next_due_at)
      `,
    )
    .eq("kind", "agent")
    .order("updated_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.search) {
    q = q.ilike("title", `%${options.search}%`);
  }
  if (options.enabled === true || options.enabled === false) {
    q = q.eq("enabled", options.enabled);
  }
  if (options.surface) {
    q = q.contains("surfaces", [options.surface]);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<
    SchTaskRow & {
      agent: SchAgentTaskRow[] | null;
      trigger: SchTriggerRow[] | null;
    }
  >;

  // Best-effort email lookup. Falls back to user_id when the RPC isn't allowed.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const emailMap = await emailsForUserIds(userIds);

  return rows.map((r) => ({
    ...r,
    agent: r.agent?.[0] ?? null,
    trigger: r.trigger?.[0] ?? null,
    user_email: emailMap.get(r.user_id) ?? null,
  }));
}

async function emailsForUserIds(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  try {
    const { data } = await supabase.rpc("get_user_emails_by_ids", {
      user_ids: userIds,
    });
    if (Array.isArray(data)) {
      return new Map(
        (data as { id: string; email: string }[]).map((row) => [
          row.id,
          row.email,
        ]),
      );
    }
  } catch {
    /* fall through */
  }
  return new Map();
}

// ── Admin runs ─────────────────────────────────────────────────────────────

export async function fetchAllRunsAdmin(options: {
  status?: RunStatus | null;
  surface?: string | null;
  limit?: number;
  since?: string | null;
} = {}): Promise<SchRunRow[]> {
  let q = supabase
    .from("sch_run")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.status) q = q.eq("status", options.status);
  if (options.surface) q = q.eq("surface", options.surface);
  if (options.since) q = q.gte("created_at", options.since);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SchRunRow[];
}

// ── Orphan leases ──────────────────────────────────────────────────────────

export async function fetchOrphanLeases(): Promise<SchRunRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("sch_run")
    .select("*")
    .in("status", ["claimed", "running"])
    .lt("claim_expires_at", nowIso)
    .order("claim_expires_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as SchRunRow[];
}

// ── System health ──────────────────────────────────────────────────────────

export interface SchedulingHealthSummary {
  taskCount: number;
  enabledCount: number;
  upcomingNextHour: number;
  runsLast24h: number;
  failuresLast24h: number;
  orphanLeases: number;
}

export async function fetchHealthSummary(): Promise<SchedulingHealthSummary> {
  const nowIso = new Date().toISOString();
  const dayAgoIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const hourFromNowIso = new Date(Date.now() + 3600 * 1000).toISOString();

  const [
    tasksTotal,
    tasksEnabled,
    upcoming,
    runs24h,
    failures24h,
    orphans,
  ] = await Promise.all([
    countTable("sch_task"),
    countTable("sch_task", (q) => q.eq("enabled", true)),
    countTable("sch_task", (q) =>
      q
        .eq("enabled", true)
        .lte("next_due_at", hourFromNowIso)
        .gte("next_due_at", nowIso),
    ),
    countTable("sch_run", (q) => q.gte("created_at", dayAgoIso)),
    countTable("sch_run", (q) =>
      q.gte("created_at", dayAgoIso).eq("status", "failed"),
    ),
    countTable("sch_run", (q) =>
      q.in("status", ["claimed", "running"]).lt("claim_expires_at", nowIso),
    ),
  ]);

  return {
    taskCount: tasksTotal,
    enabledCount: tasksEnabled,
    upcomingNextHour: upcoming,
    runsLast24h: runs24h,
    failuresLast24h: failures24h,
    orphanLeases: orphans,
  };
}

async function countTable(
  table: "sch_task" | "sch_run",
  modify?: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<number> {
  // We use a head + count query, which Supabase counts server-side.
  const baseQ = supabase.from(table).select("*", { head: true, count: "exact" });
  const finalQ = (modify ? (modify(baseQ) as typeof baseQ) : baseQ) as typeof baseQ;
  const { count, error } = await finalQ;
  if (error) throw error;
  return count ?? 0;
}

// ── Admin mutations ────────────────────────────────────────────────────────

export async function disableTaskAdmin(taskId: string): Promise<void> {
  const { error } = await supabase
    .from("sch_task")
    .update({ enabled: false })
    .eq("id", taskId);
  if (error) throw error;
}

export async function markRunFailedAdmin(
  runId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from("sch_run")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: reason,
      claim_token: null,
    })
    .eq("id", runId);
  if (error) throw error;
}
