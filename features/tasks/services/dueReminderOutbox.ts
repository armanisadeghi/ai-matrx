import "server-only";

import { createAdminClient } from "@/utils/supabase/adminClient";
import { projectsDb } from "@/utils/supabase/projectsDb";

type Admin = ReturnType<typeof createAdminClient>;
type Outcome = "queued" | "duplicate" | "skipped";

/** Queue one email for a saved task and recipient on a given UTC reminder day. */
export async function enqueueDueReminderEmail(
  admin: Admin,
  taskId: string,
  reminderDay: string,
): Promise<Outcome> {
  const { data: task, error: taskError } = await projectsDb(admin)
    .from("tasks")
    .select("id, title, created_by, assignee_id, organization_id, due_date, status")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (taskError) throw taskError;
  if (!task || !task.due_date ||
      ["completed", "cancelled", "dismissed"].includes(task.status)) return "skipped";

  const recipientId = task.assignee_id || task.created_by;
  if (!recipientId || !task.organization_id) return "skipped";
  const dueDay = task.due_date.slice(0, 10);
  const daysFromDue = Math.round(
    (Date.parse(`${dueDay}T00:00:00Z`) - Date.parse(`${reminderDay}T00:00:00Z`)) / 86_400_000,
  );
  if (!Number.isFinite(daysFromDue) || daysFromDue > 2 || daysFromDue < -30) return "skipped";

  const { data: mute, error: muteError } = await projectsDb(admin)
    .from("task_user_state")
    .select("snoozed_until, dismissed_at")
    .eq("task_id", task.id)
    .eq("user_id", recipientId)
    .maybeSingle();
  if (muteError) throw muteError;
  if (mute?.dismissed_at || (mute?.snoozed_until && Date.parse(mute.snoozed_until) > Date.now())) {
    return "skipped";
  }

  const { data: preferences, error: preferenceError } = await admin
    .schema("users").from("user_email_preferences")
    .select("task_notifications")
    .eq("user_id", recipientId)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  if (preferences?.task_notifications === false) return "skipped";

  const { data: event, error: eventError } = await admin.schema("communication")
    .from("notification_event_type")
    .select("enabled, default_channels")
    .eq("event_key", "task.due_reminder").is("deleted_at", null).maybeSingle();
  if (eventError) throw eventError;
  if (!event?.enabled) return "skipped";
  const { data: override, error: overrideError } = await admin.schema("communication")
    .from("notification_event_override")
    .select("enabled, default_channels")
    .eq("event_key", "task.due_reminder")
    .eq("organization_id", task.organization_id)
    .is("deleted_at", null).maybeSingle();
  if (overrideError) throw overrideError;
  if (override?.enabled === false) return "skipped";
  const base = override?.default_channels ?? event.default_channels;
  const baseChannels = Array.isArray(base)
    ? Object.fromEntries(base.filter((value): value is string => typeof value === "string")
        .map((value) => [value, true]))
    : base;
  const { data: channels, error: channelError } = await admin.schema("communication").rpc(
    "notification_user_channels", {
      p_event_key: "task.due_reminder",
      p_organization_id: task.organization_id,
      p_user: recipientId,
      p_base: baseChannels,
      p_mandatory: false,
    },
  );
  if (channelError) throw channelError;
  if (!channels || typeof channels !== "object" || Array.isArray(channels) ||
      (channels as Record<string, unknown>).email !== true) return "skipped";

  const { data: addressRows, error: addressError } = await admin.schema("communication").rpc(
    "resolve_channel_address", {
      p_channel: "email",
      p_organization_id: task.organization_id,
      p_recipient_kind: "user",
      p_recipient_user_id: recipientId,
      // SQL accepts NULL for unused arms; generated RPC types mark them required strings.
      p_recipient_party_id: null as never,
      p_actor_token_id: null as never,
      p_literal_address: null as never,
    },
  );
  if (addressError) throw addressError;
  const address = addressRows?.[0];
  const urgency = daysFromDue < 0 ? "overdue" : daysFromDue === 0 ? "due_today" : "upcoming";
  const urgencyLabel = urgency === "overdue" ? "Overdue" : urgency === "due_today" ? "Due today" : "Due soon";
  const urgencyWords = urgency === "overdue" ? "overdue" : urgency === "due_today" ? "due today" : "due tomorrow";
  if (!address?.address) return "skipped";

  // Recognize rows written by the earlier per-task key before the three-slot
  // admission scheme. There can be no new legacy writer after this code lands.
  const legacyKey = `task.due_reminder:${task.id}:${recipientId}:${reminderDay}:email`;
  const { data: prior, error: priorError } = await admin.schema("communication")
    .from("notification")
    .select("id, organization_id, recipient_user_id, target_id, channel, status")
    .eq("dedupe_key", legacyKey).maybeSingle();
  if (priorError) throw priorError;
  if (prior) {
    if (prior.organization_id !== task.organization_id || prior.recipient_user_id !== recipientId ||
        prior.target_id !== task.id || prior.channel !== "email") {
      throw new Error("Reminder dedupe key belongs to a different notification");
    }
    return prior.status === "skipped" ? "skipped" : "duplicate";
  }

  const { data: legacyDaily, error: dailyError } = await admin.schema("communication")
    .from("notification")
    .select("id")
    .eq("recipient_user_id", recipientId)
    .eq("event_key", "task.due_reminder")
    .eq("channel", "email")
    .neq("status", "skipped")
    .like("dedupe_key", `task.due_reminder:%:${recipientId}:${reminderDay}:email`)
    .limit(3);
  if (dailyError) throw dailyError;
  const availableSlots = Math.max(0, 3 - (legacyDaily?.length ?? 0));

  // The notification table's unique dedupe index is the atomic claim. Two
  // overlapping cron requests can never both occupy the same recipient/day
  // slot, even when their task lists differ.
  for (let slot = 1; slot <= availableSlots; slot++) {
    const dedupeKey = `task.due_reminder:${recipientId}:${reminderDay}:email:${slot}`;
    const { error: insertError } = await admin.schema("communication").from("notification").insert({
      organization_id: task.organization_id,
      event_key: "task.due_reminder",
      channel: "email",
      recipient_user_id: recipientId,
      recipient_kind: "user",
      created_by: recipientId,
      to_address: address.address,
      status: "render_pending",
      dedupe_key: dedupeKey,
      payload: { task: {
        title: task.title,
        due: dueDay,
        urgency_label: urgencyLabel,
        urgency_words: urgencyWords,
      } },
      target_kind: "task",
      target_id: task.id,
      deep_link: `/tasks?task=${task.id}`,
      visibility: "personal",
    });
    if (!insertError) return "queued";
    if (insertError.code !== "23505") throw insertError;
    const { data: existing, error: readError } = await admin.schema("communication")
      .from("notification")
      .select("id, organization_id, recipient_user_id, target_id, channel, event_key")
      .eq("dedupe_key", dedupeKey).maybeSingle();
    if (readError) throw readError;
    if (!existing || existing.recipient_user_id !== recipientId ||
        existing.channel !== "email" || existing.event_key !== "task.due_reminder") {
      throw new Error("Reminder slot was occupied by a different notification");
    }
    if (existing.target_id === task.id) {
      if (existing.organization_id !== task.organization_id) {
        throw new Error("Reminder slot replay belongs to another organization");
      }
      return "duplicate";
    }
  }
  return "skipped";
}
