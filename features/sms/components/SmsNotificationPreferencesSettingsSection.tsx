"use client";

import { ListTodo } from "lucide-react";

import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsCheckbox } from "@/components/official/settings/primitives/SettingsCheckbox";
import { SettingAnchor } from "@/features/settings/doors/SettingAnchor";
import { useSmsTaskNotifications } from "@/features/sms/hooks/useSmsTaskNotifications";
import {
  SMS_TASK_REMINDERS_SETTING_ID,
  smsTaskNotificationBlockedCopy,
} from "@/features/sms/notification-preferences";

/** Explicit notification-family choices, independent of SMS consent and the text assistant. */
export function SmsNotificationPreferencesSettingsSection() {
  const taskNotifications = useSmsTaskNotifications();
  const preference = taskNotifications.preference;
  const canChange = Boolean(
    preference &&
    (preference.taskNotifications || preference.canEnable) &&
    !taskNotifications.loading,
  );
  const blockingCopy = preference
    ? smsTaskNotificationBlockedCopy(preference.blockedReasons)
    : null;

  return (
    <>
      <SettingAnchor id={SMS_TASK_REMINDERS_SETTING_ID}>
        <SettingsSection
          title="Text notifications"
          description="Choose which AI Matrx updates may be sent to your verified mobile number. These choices do not control your text assistant."
          icon={ListTodo}
        >
          <SettingsCheckbox
            id="sms-task-reminders-checkbox"
            label="Task reminders"
            description={
              preference?.maskedPhone
                ? `Send task reminders to ${preference.maskedPhone}. You can reply DONE to complete an offered non-recurring task.`
                : taskNotifications.loading
                  ? "Checking your verified mobile number and current choice."
                  : "Verify a mobile number above before enabling task reminder texts."
            }
            checked={preference?.taskNotifications ?? false}
            onCheckedChange={(enabled) => {
              void taskNotifications.setTaskNotifications(enabled);
            }}
            disabled={!canChange}
            last
          />
        </SettingsSection>
      </SettingAnchor>

      {preference && blockingCopy ? (
        <SettingsCallout
          tone={preference.canEnable ? "warning" : "info"}
          title={
            preference.canEnable
              ? "Delivery is temporarily unavailable"
              : "Finish SMS setup"
          }
        >
          {blockingCopy}
        </SettingsCallout>
      ) : null}

      {taskNotifications.result ? (
        <SettingsCallout
          tone={taskNotifications.result.success ? "success" : "error"}
        >
          {taskNotifications.result.message}
        </SettingsCallout>
      ) : null}
    </>
  );
}
