import { SMS_ASSISTANT_OWNER_BETA_PROGRAM } from "@/features/sms/assistant-program";
import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";

export const SMS_TASK_REMINDERS_SETTING_ID = "sms.task-reminders";

type TaskNotificationPreferenceRpcRow =
  Database["communication"]["Functions"]["get_my_sms_task_notification_preference"]["Returns"][number];

export interface SmsTaskNotificationPreference {
  maskedPhone: TaskNotificationPreferenceRpcRow["masked_phone"];
  smsEnabled: TaskNotificationPreferenceRpcRow["sms_enabled"];
  taskNotifications: TaskNotificationPreferenceRpcRow["task_notifications"];
  consentStatus: TaskNotificationPreferenceRpcRow["consent_status"];
  programKey: TaskNotificationPreferenceRpcRow["program_key"];
  destinationReady: TaskNotificationPreferenceRpcRow["destination_ready"];
  canEnable: TaskNotificationPreferenceRpcRow["can_enable"];
  blockedReasons: TaskNotificationPreferenceRpcRow["blocked_reasons"];
}

export function smsTaskNotificationPreferenceFromRpc(
  row: TaskNotificationPreferenceRpcRow,
): SmsTaskNotificationPreference {
  return {
    maskedPhone: row.masked_phone,
    smsEnabled: row.sms_enabled,
    taskNotifications: row.task_notifications,
    consentStatus: row.consent_status,
    programKey: row.program_key,
    destinationReady: row.destination_ready,
    canEnable: row.can_enable,
    blockedReasons: row.blocked_reasons,
  };
}

async function requireOnePreference(
  rows: TaskNotificationPreferenceRpcRow[] | null,
): Promise<SmsTaskNotificationPreference> {
  if (!rows || rows.length !== 1) {
    throw new Error(
      "Verify a mobile number before choosing text notification types.",
    );
  }
  return smsTaskNotificationPreferenceFromRpc(rows[0]);
}

/** Read the caller's family-scoped SMS preference through the authenticated DB contract. */
export async function getMySmsTaskNotificationPreference(): Promise<SmsTaskNotificationPreference> {
  const { data, error } = await supabase
    .schema("communication")
    .rpc("get_my_sms_task_notification_preference", {
      p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
    });
  if (error) throw error;
  return requireOnePreference(data);
}

/** Explicitly opt the caller in or out of SMS task reminders only. */
export async function configureMySmsTaskNotifications(
  enabled: boolean,
): Promise<SmsTaskNotificationPreference> {
  const { data, error } = await supabase
    .schema("communication")
    .rpc("configure_my_sms_task_notifications", {
      p_enabled: enabled,
      p_program_key: SMS_ASSISTANT_OWNER_BETA_PROGRAM,
    });
  if (error) throw error;
  return requireOnePreference(data);
}

const BLOCKED_REASON_COPY: Record<string, string> = {
  sms_disabled: "Enable and verify Text messages above first.",
  verified_phone_missing: "Verify a mobile number above first.",
  sms_program_not_enrolled:
    "This account is not connected to the task-reminder texting program.",
  consent_not_opted_in:
    "This mobile number is not opted in. Reply START or verify it again above.",
  destination_not_ready:
    "Your preference can be saved, but the AI Matrx texting number is temporarily unavailable.",
};

export function smsTaskNotificationBlockedCopy(reasons: string[]): string {
  return reasons
    .map(
      (reason) =>
        BLOCKED_REASON_COPY[reason] ??
        "Task reminder texts are not available for this account yet.",
    )
    .join(" ");
}
