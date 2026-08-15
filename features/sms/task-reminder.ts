import { SMS_ASSISTANT_OWNER_BETA_PROGRAM } from "@/features/sms/assistant-program";
import type { Database } from "@/types/database.types";
import { createClient } from "@/utils/supabase/client";

type TaskSmsReminderRpcRow =
  Database["communication"]["Functions"]["enqueue_my_task_sms_reminder"]["Returns"][number];
type NullableTaskSmsReminderKey =
  | "notification_id"
  | "outbound_message_id"
  | "assist_id"
  | "sms_conversation_id"
  | "blocked_reason";
type TaskSmsReminderRpcBoundary = Omit<
  TaskSmsReminderRpcRow,
  NullableTaskSmsReminderKey
> & {
  [Key in NullableTaskSmsReminderKey]: TaskSmsReminderRpcRow[Key] | null;
};

export interface TaskSmsReminderResult {
  outcome: string;
  notificationId: string | null;
  outboundMessageId: string | null;
  assistId: string | null;
  smsConversationId: string | null;
  blockedReason: string | null;
  duplicate: boolean;
}

export interface TaskSmsReminderBlockedCopy {
  message: string;
  openMessagingSettings: boolean;
}

const SETTINGS_BLOCKS = new Set([
  "sms_program_not_enrolled",
  "sms_disabled",
  "task_notifications_disabled",
  "verified_phone_missing",
  "destination_not_ready",
  "consent_not_opted_in",
  "invalid_notification_timezone",
]);

const BLOCKED_COPY: Record<string, string> = {
  recurring_task_unsupported: "Recurring task reminders are not available yet.",
  task_not_actionable: "This task is already closed and cannot receive a reminder.",
  sms_program_not_enrolled: "Connect your phone in Messaging settings first.",
  sms_disabled: "Turn on SMS in Messaging settings first.",
  task_notifications_disabled: "Turn on task notifications in Messaging settings first.",
  verified_phone_missing: "Verify your phone in Messaging settings first.",
  destination_not_ready: "The AI Matrx texting number is not ready right now.",
  consent_not_opted_in: "This phone is opted out. Reply START, then try again.",
  notification_source_suppressed: "Task text reminders are currently muted.",
  invalid_notification_timezone: "Fix your notification timezone in Messaging settings.",
  quiet_hours: "This reminder is blocked by your quiet hours.",
  hourly_rate_limit: "You reached the hourly text limit. Try again later.",
  daily_rate_limit: "You reached the daily text limit. Try again tomorrow.",
};

function nullableText(value: string | null): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function taskSmsReminderFromRpc(
  row: TaskSmsReminderRpcBoundary,
): TaskSmsReminderResult {
  return {
    outcome: row.outcome,
    notificationId: nullableText(row.notification_id),
    outboundMessageId: nullableText(row.outbound_message_id),
    assistId: nullableText(row.assist_id),
    smsConversationId: nullableText(row.sms_conversation_id),
    blockedReason: nullableText(row.blocked_reason),
    duplicate: row.duplicate,
  };
}

export function taskSmsReminderBlockedCopy(
  reason: string | null,
): TaskSmsReminderBlockedCopy {
  const key = reason ?? "unknown";
  return {
    message: BLOCKED_COPY[key] ?? "AI Matrx could not queue this text reminder.",
    openMessagingSettings: SETTINGS_BLOCKS.has(key),
  };
}

/** Queue one durable, policy-gated reminder through the authenticated DB contract. */
export async function enqueueMyTaskSmsReminder(
  taskId: string,
): Promise<TaskSmsReminderResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("communication")
    .rpc("enqueue_my_task_sms_reminder", {
      p_task_id: taskId,
      p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
    });

  if (error) {
    throw new Error(`Could not queue task text reminder: ${error.message}`);
  }
  if (!data || data.length !== 1) {
    throw new Error("Task text reminder returned an invalid result");
  }
  return taskSmsReminderFromRpc(data[0]);
}
