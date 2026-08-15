import {
  taskSmsReminderBlockedCopy,
  taskSmsReminderFromRpc,
} from "@/features/sms/task-reminder";

describe("task SMS reminder boundary", () => {
  test("preserves the exact durable row identities", () => {
    expect(
      taskSmsReminderFromRpc({
        outcome: "queued",
        notification_id: "notification-id",
        outbound_message_id: "message-id",
        assist_id: "assist-id",
        sms_conversation_id: "conversation-id",
        blocked_reason: null,
        duplicate: false,
      }),
    ).toEqual({
      outcome: "queued",
      notificationId: "notification-id",
      outboundMessageId: "message-id",
      assistId: "assist-id",
      smsConversationId: "conversation-id",
      blockedReason: null,
      duplicate: false,
    });
  });

  test("turns setup refusals into a direct Messaging-settings recovery", () => {
    expect(taskSmsReminderBlockedCopy("task_notifications_disabled")).toEqual({
      message: "Turn on task notifications in Messaging settings first.",
      openMessagingSettings: true,
    });
  });

  test("keeps temporary policy blocks out of settings", () => {
    expect(taskSmsReminderBlockedCopy("quiet_hours")).toEqual({
      message: "This reminder is blocked by your quiet hours.",
      openMessagingSettings: false,
    });
  });
});
