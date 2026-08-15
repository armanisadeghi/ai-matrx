/** @jest-environment node */

import twilio from "twilio";

import { POST } from "./route";

const URL = "https://aimatrx.com/api/webhooks/twilio/voice";
const AUTH_TOKEN = "voice-route-test-auth-token";
const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;

function signedRequest(
  params: Record<string, string>,
  signatureOverride?: string,
): Request {
  const signature =
    signatureOverride ??
    twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL, params);
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: new URLSearchParams(params),
  });
}

describe("POST /api/webhooks/twilio/voice", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
  });

  test("answers a signed inbound call with disclosed static TwiML", async () => {
    const response = await POST(
      signedRequest({
        AccountSid: "AC123",
        CallSid: "CA123",
        From: "+14155550100",
        To: "+14158059951",
        Direction: "inbound",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("A.I. Matrix");
    expect(body).toContain("may be recorded and reviewed");
    expect(body).not.toContain("<Record");
    expect(console.info).toHaveBeenCalledWith(
      "Twilio Voice static proof answered",
      expect.objectContaining({
        providerCallId: "CA123",
        mode: "static_disclosed_test",
        recordingStarted: false,
      }),
    );
  });

  test("refuses an invalid signature before returning TwiML", async () => {
    const response = await POST(
      signedRequest(
        { AccountSid: "AC123", CallSid: "CA123", To: "+14158059951" },
        "invalid",
      ),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  test("refuses a signed but incomplete Voice payload", async () => {
    const response = await POST(
      signedRequest({ AccountSid: "AC123", CallSid: "CA123" }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
  });
});
