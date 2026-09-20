import { notificationChannelAvailability } from "./notification-preferences";

describe("notification channel availability", () => {
  test("offers only configured renderable channels", () => {
    expect(
      notificationChannelAvailability({
        templates: {
          email: { body: "Email body" },
          in_app: { body: "In-app body" },
          sms: { body: "Text body" },
        },
      }),
    ).toEqual({ email: true, in_app: true, sms: true });
  });

  test("does not offer SMS when the catalog locks it or it has no body", () => {
    expect(
      notificationChannelAvailability({
        sms_locked: true,
        templates: {
          email: { body: "Email body" },
          in_app: { body: "In-app body" },
          sms: { body: "Text body" },
        },
      }),
    ).toEqual({ email: true, in_app: true, sms: false });
    expect(notificationChannelAvailability({ templates: { sms: {} } })).toEqual({
      email: false,
      in_app: false,
      sms: false,
    });
  });
});
