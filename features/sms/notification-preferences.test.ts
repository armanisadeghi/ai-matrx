import {
  smsTaskNotificationBlockedCopy,
  smsTaskNotificationPreferenceFromRpc,
} from "@/features/sms/notification-preferences";

describe("SMS notification-family preference boundary", () => {
  test("maps the authenticated RPC row without changing family state", () => {
    expect(
      smsTaskNotificationPreferenceFromRpc({
        masked_phone: "•••3627",
        sms_enabled: true,
        task_notifications: false,
        consent_status: "opted_in",
        program_key: "ai_matrx_owner_beta",
        destination_ready: true,
        can_enable: true,
        blocked_reasons: [],
      }),
    ).toEqual({
      maskedPhone: "•••3627",
      smsEnabled: true,
      taskNotifications: false,
      consentStatus: "opted_in",
      programKey: "ai_matrx_owner_beta",
      destinationReady: true,
      canEnable: true,
      blockedReasons: [],
    });
  });

  test("explains every recoverable setup block in novice language", () => {
    expect(
      smsTaskNotificationBlockedCopy(["sms_disabled", "consent_not_opted_in"]),
    ).toBe(
      "Enable and verify Text messages above first. This mobile number is not opted in. Reply START or verify it again above.",
    );
  });

  test("keeps operator delivery health separate from the user's saved choice", () => {
    expect(smsTaskNotificationBlockedCopy(["destination_not_ready"])).toBe(
      "Your preference can be saved, but the AI Matrx texting number is temporarily unavailable.",
    );
  });
});
