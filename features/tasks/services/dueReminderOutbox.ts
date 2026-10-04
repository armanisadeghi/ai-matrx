import "server-only";

import type { Json } from "@/types/database.types";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { legacyEmailOptOut, notifyFromSql } from "@/lib/notifications/notifyFromSql";

type Admin = ReturnType<typeof createAdminClient>;
type Outcome = "queued" | "duplicate" | "skipped";

const URGENCY = {
  overdue: { label: "Overdue", words: "overdue" },
  due_today: { label: "Due today", words: "due today" },
  upcoming: { label: "Due soon", words: "due tomorrow" },
} as const;

/**
 * Queue ONE due-date notice for a recipient in one organization on a UTC reminder day.
 *
 * One task → `task.due_reminder` (DM carries the task chip); several → `task.due_reminder_digest`.
 * Delivery goes through THE spine (`communication.notify_from_sql`), so the email and its DM
 * come from the one pairing rule (`communication.notification_pair_channels`) — never from a
 * hand-rolled DM beside the email. The dedupe key (one per recipient/organization/day) is the
 * atomic claim: overlapping cron runs and replays queue nothing new.
 */
export async function enqueueDueReminder(
  admin: Admin,
  recipientId: string,
  organizationId: string,
  taskIds: string[],
  reminderDay: string,
): Promise<Outcome> {
  if (!taskIds.length) return "skipped";
  const { data: rows, error: taskError } = await projectsDb(admin)
    .from("tasks")
    .select("id, title, created_by, assignee_id, organization_id, due_date, status")
    .in("id", taskIds)
    .is("deleted_at", null)
    .order("due_date", { ascending: true })
    .order("id", { ascending: true });
  if (taskError) throw taskError;

  const { data: mutes, error: muteError } = await projectsDb(admin)
    .from("task_user_state")
    .select("task_id, snoozed_until, dismissed_at")
    .in("task_id", taskIds)
    .eq("user_id", recipientId);
  if (muteError) throw muteError;
  const muted = new Set((mutes ?? [])
    .filter((m) => m.dismissed_at || (m.snoozed_until && Date.parse(m.snoozed_until) > Date.now()))
    .map((m) => m.task_id));

  const tasks = (rows ?? []).flatMap((task) => {
    if (!task.due_date || ["completed", "cancelled", "dismissed"].includes(task.status)) return [];
    if (task.organization_id !== organizationId) return [];
    if ((task.assignee_id || task.created_by) !== recipientId || muted.has(task.id)) return [];
    const dueDay = task.due_date.slice(0, 10);
    const daysFromDue = Math.round(
      (Date.parse(`${dueDay}T00:00:00Z`) - Date.parse(`${reminderDay}T00:00:00Z`)) / 86_400_000,
    );
    if (!Number.isFinite(daysFromDue) || daysFromDue > 2 || daysFromDue < -30) return [];
    const urgency = daysFromDue < 0 ? "overdue" : daysFromDue === 0 ? "due_today" : "upcoming";
    return [{ ...task, dueDay, urgency } as const];
  });
  if (!tasks.length) return "skipped";

  // Any reminder email already sent to this person in this organization today — including the
  // per-task and per-slot keys the earlier writers used — means today's notice exists.
  const { data: sentToday, error: sentError } = await admin.schema("communication")
    .from("notification")
    .select("id")
    .eq("recipient_user_id", recipientId)
    .eq("organization_id", organizationId)
    .in("event_key", ["task.due_reminder", "task.due_reminder_digest"])
    .eq("channel", "email")
    .neq("status", "skipped")
    .like("dedupe_key", `task.due_reminder:%${reminderDay}:email%`)
    .limit(1);
  if (sentError) throw sentError;
  if (sentToday?.length) return "duplicate";

  const eventKey = tasks.length === 1 ? "task.due_reminder" : "task.due_reminder_digest";
  const { data: event, error: eventError } = await admin.schema("communication")
    .from("notification_event_type")
    .select("enabled, default_channels")
    .eq("event_key", eventKey).is("deleted_at", null).maybeSingle();
  if (eventError) throw eventError;
  if (!event?.enabled) return "skipped";
  const { data: override, error: overrideError } = await admin.schema("communication")
    .from("notification_event_override")
    .select("enabled, default_channels")
    .eq("event_key", eventKey)
    .eq("organization_id", organizationId)
    .is("deleted_at", null).maybeSingle();
  if (overrideError) throw overrideError;
  if (override?.enabled === false) return "skipped";
  const base = override?.default_channels ?? event.default_channels;
  const baseChannels = Array.isArray(base)
    ? Object.fromEntries(base.filter((value): value is string => typeof value === "string")
        .map((value) => [value, true]))
    : base;

  // The person's own rungs. Their "off" becomes the spine's `opted_out`: the email leg is a
  // named skip and the DM still goes; a DM turned off takes its email with it (email requires DM).
  const { data: channels, error: channelError } = await admin.schema("communication").rpc(
    "notification_user_channels", {
      p_event_key: eventKey,
      p_organization_id: organizationId,
      p_user: recipientId,
      p_base: baseChannels,
      p_mandatory: false,
    },
  );
  if (channelError) throw channelError;
  const ladder = channels && typeof channels === "object" && !Array.isArray(channels)
    ? channels as Record<string, unknown> : {};
  const optedOut = new Set(await legacyEmailOptOut(admin, recipientId, "task_notifications"));
  if (ladder.email !== true) optedOut.add("email");
  if (ladder.dm === false) optedOut.add("dm");

  const { data: addressRows, error: addressError } = await admin.schema("communication").rpc(
    "resolve_channel_address", {
      p_channel: "email",
      p_organization_id: organizationId,
      p_recipient_kind: "user",
      p_recipient_user_id: recipientId,
      // SQL accepts NULL for unused arms; generated RPC types mark them required strings.
      p_recipient_party_id: null as never,
      p_actor_token_id: null as never,
      p_literal_address: null as never,
    },
  );
  if (addressError) throw addressError;
  const address = addressRows?.[0]?.address || null;

  const [first] = tasks;
  const single = tasks.length === 1;
  const lines = [
    `You have ${tasks.length} tasks needing attention:`,
    ...tasks.slice(0, 2).map((t) => `• ${t.title} (${URGENCY[t.urgency].words})`),
    ...(tasks.length > 2 ? [`…and ${tasks.length - 2} more`] : []),
  ].join("\n");
  const payload: Record<string, Json> = single
    ? { task: {
        title: first.title,
        due: first.dueDay,
        urgency_label: URGENCY[first.urgency].label,
        urgency_words: URGENCY[first.urgency].words,
      } }
    : { digest: { count: String(tasks.length), lines } };

  const result = await notifyFromSql(admin, {
    organizationId,
    eventKey,
    recipientUserId: recipientId,
    toAddress: address,
    payload,
    deepLink: single ? `/tasks?task=${first.id}` : "/tasks",
    targetKind: single ? "task" : null,
    targetId: single ? first.id : null,
    dedupeKey: `task.due_reminder:${recipientId}:${organizationId}:${reminderDay}`,
    dm: {
      action_data: single
        ? { kind: "task_reminder",
            payload: { task_id: first.id, title: first.title, due_date: first.due_date } }
        : { kind: "open_link", payload: { href: "/tasks", label: "Open tasks" } },
    },
    optedOut: [...optedOut],
  });
  if (result.queued.length) return "queued";
  if (result.skipped.length && result.skipped.every((s) => s.why === "already_queued")) {
    return "duplicate";
  }
  return "skipped";
}
