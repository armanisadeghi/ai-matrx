/**
 * taskUserStateService — the ONE client for workspace.task_user_state, the
 * per-user notification/triage state on tasks (seen / acknowledged / snoozed /
 * dismissed / pinned). Rows are RLS-scoped to the current user; every write
 * is an upsert keyed on (task_id, user_id).
 *
 * Snooze semantics: a snoozed task disappears from every attention view
 * (Today, Overdue, Upcoming, Inbox) until `snoozed_until`, but stays in
 * "All tasks". Reminders (email/cron) also respect it.
 */
import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { requireUserId } from "@/utils/auth/getUserId";

export interface TaskUserState {
  task_id: string;
  user_id: string;
  seen_at: string | null;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  dismissed_at: string | null;
  pinned_at: string | null;
  updated_at: string;
}

/** All of the current user's task states (RLS returns only their rows). */
export async function listMyTaskUserStates(): Promise<TaskUserState[]> {
  const { data, error } = await workspaceDb(supabase)
    .from("task_user_state")
    .select("*");
  if (error) {
    console.error("listMyTaskUserStates failed:", error.message);
    return [];
  }
  return (data ?? []) as TaskUserState[];
}

async function upsertState(
  taskId: string,
  patch: Partial<
    Pick<
      TaskUserState,
      | "seen_at"
      | "acknowledged_at"
      | "snoozed_until"
      | "dismissed_at"
      | "pinned_at"
    >
  >,
): Promise<TaskUserState | null> {
  const userId = requireUserId();
  const { data, error } = await workspaceDb(supabase)
    .from("task_user_state")
    .upsert(
      {
        task_id: taskId,
        user_id: userId,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "task_id,user_id" },
    )
    .select()
    .single();
  if (error) {
    console.error("task_user_state upsert failed:", error.message);
    return null;
  }
  return data as TaskUserState;
}

export function snoozeTask(taskId: string, until: Date) {
  return upsertState(taskId, { snoozed_until: until.toISOString() });
}

export function unsnoozeTask(taskId: string) {
  return upsertState(taskId, { snoozed_until: null });
}

export function acknowledgeTask(taskId: string) {
  return upsertState(taskId, { acknowledged_at: new Date().toISOString() });
}

export function markTaskSeen(taskId: string) {
  return upsertState(taskId, { seen_at: new Date().toISOString() });
}

export function pinTask(taskId: string, pinned: boolean) {
  return upsertState(taskId, {
    pinned_at: pinned ? new Date().toISOString() : null,
  });
}

/** Canonical snooze presets (mirrors best-in-class reminder UX). */
export function snoozePresets(): { key: string; label: string; until: Date }[] {
  const now = new Date();
  const laterToday = new Date(now);
  laterToday.setHours(now.getHours() + 4);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  nextWeek.setHours(9, 0, 0, 0);
  return [
    { key: "later", label: "Later today", until: laterToday },
    { key: "tomorrow", label: "Tomorrow", until: tomorrow },
    { key: "nextweek", label: "Next week", until: nextWeek },
  ];
}
