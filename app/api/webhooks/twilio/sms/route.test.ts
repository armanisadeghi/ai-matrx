/** @jest-environment node */

import twilio from "twilio";

import {
  isPhoneNumberOptedOut,
  processInboundSms,
} from "@/lib/sms/receive";

import { POST } from "./route";

jest.mock("@/lib/sms/receive", () => ({
  isPhoneNumberOptedOut: jest.fn(),
  processInboundSms: jest.fn(),
}));

const URL = "https://aimatrx.com/api/webhooks/twilio/sms";
const AUTH_TOKEN = "sms-route-test-auth-token";
const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;

const payload = {
  AccountSid: "AC123",
  MessageSid: "SM123",
  From: "+14155550100",
  To: "+14158059951",
  Body: "hello",
  NumMedia: "0",
};

function signedRequest(signatureOverride?: string): Request {
  const signature =
    signatureOverride ??
    twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL, payload);
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: new URLSearchParams(payload),
  });
}

describe("POST /api/webhooks/twilio/sms with shared Twilio validation", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    jest.clearAllMocks();
    jest.mocked(isPhoneNumberOptedOut).mockResolvedValue(false);
    jest.mocked(processInboundSms).mockResolvedValue({
      success: true,
      messageId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
    });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
  });

  test("accepts a signed SMS and reaches the existing inbound processor", async () => {
    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/xml");
    expect(await response.text()).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>");
    expect(isPhoneNumberOptedOut).toHaveBeenCalledWith(payload.From);
    expect(processInboundSms).toHaveBeenCalledWith(payload);
  });

  test("fails closed before SMS processing when the signature is invalid", async () => {
    const response = await POST(signedRequest("invalid"));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    expect(isPhoneNumberOptedOut).not.toHaveBeenCalled();
    expect(processInboundSms).not.toHaveBeenCalled();
  });
});
