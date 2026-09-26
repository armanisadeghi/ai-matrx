// lib/services/scheduling-admin-service.ts
//
// Admin-side reads/writes for the sch_* spine. Uses the browser supabase
// client. Reads go through RLS's platform_admin_read (admin lane); the two
// writes go through the scheduler.admin_* doors below, because the staff
// WRITE arm is closed on these tables. Mirrors lib/services/agent-apps-admin-
// service.ts. NEVER call this from non-admin UI.

import { supabase } from "@/utils/supabase/client";
import { schedulerDb } from "@/utils/supabase/schedulerDb";
import { pgErrorToError } from "@ai-matrx/data";
import { buildSearchOr } from "@/utils/supabase-search";
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
  trigger: Pick<
    SchTriggerRow,
    "type" | "config" | "enabled" | "next_due_at"
  > | null;
  user_email: string | null;
}

// ── List all-user tasks (admin) ────────────────────────────────────────────

export async function fetchAllTasksAdmin(
  options: {
    search?: string;
    surface?: string;
    enabled?: boolean | null;
    limit?: number;
  } = {},
): Promise<AdminTaskRow[]> {
  let q = schedulerDb(supabase)
    .schema("scheduler").from("sch_task")
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
    q = q.or(buildSearchOr(options.search, ["title"]));
  }
  if (options.enabled === true || options.enabled === false) {
    q = q.eq("enabled", options.enabled);
  }
  if (options.surface) {
    q = q.contains("surfaces", [options.surface]);
  }

  const { data, error } = await q;
  if (error) throw pgErrorToError(error);

  // MATRX-EXCEPTION: PostgREST aliased-embed select (agent:sch_agent_task(...),
  // trigger:sch_trigger(...)) — supabase-js cannot infer the joined shape from
  // the select() string literal, and SchTaskRow/SchAgentTaskRow/SchTriggerRow
  // are the feature's FE-facing projection types (features/scheduling/types.ts),
  // not generated rows, so no DbRpcRow guard applies. The embed alias names and
  // selected columns are verified against the query above.
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
      return new Map(data.map((row) => [row.id, row.email]));
    }
  } catch {
    /* fall through */
  }
  return new Map();
}

// ── Admin runs ─────────────────────────────────────────────────────────────

/**
 * A run plus the TITLE of the scheduled task it belongs to.
 *
 * THE DOOR LAW: an admin table that prints `task_id` and nothing else makes the
 * operator copy a uuid and go hunting. The parent title comes free off the
 * existing `sch_run_task_id_fkey` embed, so every run names its schedule and
 * links to `/schedules/<task_id>`.
 */
export interface AdminRunRow extends SchRunRow {
  task_title: string | null;
}

/** Shared PostgREST projection: the run row + its parent task's title. */
const RUN_WITH_TASK_SELECT = "*, task:sch_task(title)";

// MATRX-EXCEPTION: PostgREST aliased-embed select (task:sch_task(title)) —
// supabase-js cannot infer the joined shape from the select() string literal,
// and SchRunRow is the feature's FE-facing projection type
// (features/scheduling/types.ts), not a generated row. The alias name and
// selected column are verified against RUN_WITH_TASK_SELECT above, and the
// embed is backed by the live `sch_run_task_id_fkey` constraint.
function toAdminRunRows(data: unknown): AdminRunRow[] {
  const rows = (data ?? []) as unknown as Array<
    SchRunRow & { task: { title: string }[] | { title: string } | null }
  >;
  return rows.map(({ task, ...run }) => ({
    ...run,
    task_title: (Array.isArray(task) ? task[0]?.title : task?.title) ?? null,
  }));
}

export async function fetchAllRunsAdmin(
  options: {
    status?: RunStatus | null;
    surface?: string | null;
    limit?: number;
    since?: string | null;
  } = {},
): Promise<AdminRunRow[]> {
  let q = schedulerDb(supabase)
    .schema("scheduler").from("sch_run")
    .select(RUN_WITH_TASK_SELECT)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.status) q = q.eq("status", options.status);
  if (options.surface) q = q.eq("surface", options.surface);
  if (options.since) q = q.gte("created_at", options.since);

  const { data, error } = await q;
  if (error) throw pgErrorToError(error);
  return toAdminRunRows(data);
}

// ── Orphan leases ──────────────────────────────────────────────────────────

export async function fetchOrphanLeases(): Promise<AdminRunRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await schedulerDb(supabase)
    .schema("scheduler").from("sch_run")
    .select(RUN_WITH_TASK_SELECT)
    .in("status", ["claimed", "running"])
    .lt("claim_expires_at", nowIso)
    .order("claim_expires_at", { ascending: true })
    .limit(200);
  if (error) throw pgErrorToError(error);
  return toAdminRunRows(data);
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

  const [tasksTotal, tasksEnabled, upcoming, runs24h, failures24h, orphans] =
    await Promise.all([
      // total tasks
      schedulerDb(supabase)
        .schema("scheduler").from("sch_task")
        .select("*", { head: true, count: "exact" })
        .then(unwrapCount),
      // enabled tasks
      schedulerDb(supabase)
        .schema("scheduler").from("sch_task")
        .select("*", { head: true, count: "exact" })
        .eq("enabled", true)
        .then(unwrapCount),
      // due in next hour
      schedulerDb(supabase)
        .schema("scheduler").from("sch_task")
        .select("*", { head: true, count: "exact" })
        .eq("enabled", true)
        .lte("next_due_at", hourFromNowIso)
        .gte("next_due_at", nowIso)
        .then(unwrapCount),
      // runs last 24h
      schedulerDb(supabase)
        .schema("scheduler").from("sch_run")
        .select("*", { head: true, count: "exact" })
        .gte("created_at", dayAgoIso)
        .then(unwrapCount),
      // failures last 24h
      schedulerDb(supabase)
        .schema("scheduler").from("sch_run")
        .select("*", { head: true, count: "exact" })
        .gte("created_at", dayAgoIso)
        .eq("status", "failed")
        .then(unwrapCount),
      // orphan leases
      schedulerDb(supabase)
        .schema("scheduler").from("sch_run")
        .select("*", { head: true, count: "exact" })
        .in("status", ["claimed", "running"])
        .lt("claim_expires_at", nowIso)
        .then(unwrapCount),
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

function unwrapCount(res: {
  count: number | null;
  error: { message: string } | null;
}): number {
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}

// ── Admin mutations ────────────────────────────────────────────────────────

// Both writes go through audited SECURITY DEFINER doors, never a direct
// update: sch_* are class `confidential` with the platform-staff write arm
// closed (suppress_platform_admin_lane), so an admin's direct update of
// another person's task or run matches 0 rows. The doors check
// public.is_super_admin() (admin lane) before any read, raise P0002 for a
// missing row, and write one admin.admin_audit_log row each
// (migrations/sch_admin_doors_close_the_staff_write_arm_2026_09_26.sql).

function assertDoorAnswer(
  data: unknown,
  idKey: "task_id" | "run_id",
  expectedId: string,
  noun: string,
): void {
  const answeredId =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)[idKey]
      : undefined;
  if (answeredId !== expectedId) {
    throw new Error(
      `The ${noun} change was not confirmed by the server (expected ${idKey} ${expectedId}). Refresh and check the ${noun} before trying again.`,
    );
  }
}

export async function disableTaskAdmin(
  taskId: string,
  reason?: string,
): Promise<void> {
  const { data, error } = await schedulerDb(supabase).rpc(
    "admin_disable_task",
    { p_task_id: taskId, ...(reason ? { p_reason: reason } : {}) },
  );
  if (error) throw pgErrorToError(error);
  assertDoorAnswer(data, "task_id", taskId, "scheduled task");
}

export async function markRunFailedAdmin(
  runId: string,
  reason: string,
): Promise<void> {
  const { data, error } = await schedulerDb(supabase).rpc(
    "admin_mark_run_failed",
    { p_run_id: runId, p_reason: reason },
  );
  if (error) throw pgErrorToError(error);
  assertDoorAnswer(data, "run_id", runId, "scheduled run");
}
