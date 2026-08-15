/** @jest-environment node */

import twilio from "twilio";

import {
  buildTwilioWebhookUrl,
  validateTwilioWebhook,
} from "@/lib/communications/providers/twilio/webhook-validation";

const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;

describe("shared Twilio webhook validation", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = "test-twilio-auth-token";
  });

  afterAll(() => {
    process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
  });

  test("reconstructs the public Vercel URL and preserves its query", () => {
    const request = new Request(
      "http://internal-vercel-host/api/webhooks/twilio/voice?region=us1",
      {
        headers: {
          host: "internal-vercel-host",
          "x-forwarded-host": "www.aimatrx.com",
          "x-forwarded-proto": "https",
        },
      },
    );

    expect(
      buildTwilioWebhookUrl(request, "/api/webhooks/twilio/voice"),
    ).toBe("https://www.aimatrx.com/api/webhooks/twilio/voice?region=us1");
  });

  test("accepts a correctly signed form webhook", async () => {
    const url = "https://www.aimatrx.com/api/webhooks/twilio/voice";
    const params = {
      AccountSid: "AC123",
      CallSid: "CA123",
      From: "+14155550100",
      To: "+14158059951",
    };
    const signature = twilio.getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN ?? "",
      url,
      params,
    );
    const request = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signature,
      },
      body: new URLSearchParams(params),
    });

    await expect(
      validateTwilioWebhook(request, "/api/webhooks/twilio/voice"),
    ).resolves.toMatchObject({ valid: true, params, signedUrl: url });
  });

  test("fails safely for missing and malformed signatures", async () => {
    const url = "https://www.aimatrx.com/api/webhooks/twilio/voice";
    const unsigned = new Request(url, {
      method: "POST",
      body: new URLSearchParams({ CallSid: "CA123" }),
    });
    const malformed = new Request(url, {
      method: "POST",
      headers: { "x-twilio-signature": "not-a-valid-signature" },
      body: new URLSearchParams({ CallSid: "CA123" }),
    });

    await expect(
      validateTwilioWebhook(unsigned, "/api/webhooks/twilio/voice"),
    ).resolves.toMatchObject({ valid: false, error: "Missing X-Twilio-Signature header" });
    await expect(
      validateTwilioWebhook(malformed, "/api/webhooks/twilio/voice"),
    ).resolves.toMatchObject({ valid: false, error: "Invalid webhook signature" });
  });
});
