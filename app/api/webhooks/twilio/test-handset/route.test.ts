/** @jest-environment node */

/**
 * The test-handset door is the harness the whole staff text battery reads
 * through, so its two safety properties are asserted here against REAL
 * signatures (never a mocked validator):
 *
 *   1. An unsigned, forged, or wrong-token request is 403 AND writes nothing.
 *   2. A signed request for a number that is not a registered test handset
 *      writes nothing — the filter is what keeps a real person's message from
 *      ever being readable out of this table.
 */

import twilio from "twilio";
import { NextRequest } from "next/server";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/sms/test-handset-inbox", () => {
  const actual = jest.requireActual("@/lib/sms/test-handset-inbox");
  return {
    ...actual,
    storeInboundTestHandsetMessage: jest.fn(),
  };
});

import { storeInboundTestHandsetMessage } from "@/lib/sms/test-handset-inbox";
import { POST } from "./route";

const URL = "https://www.aimatrx.com/api/webhooks/twilio/test-handset";
const AUTH_TOKEN = "test-handset-route-auth-token";
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

const storeMock = storeInboundTestHandsetMessage as jest.MockedFunction<
  typeof storeInboundTestHandsetMessage
>;

const ORIGINAL_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    MessageSid: "SM00000000000000000000000000000001",
    AccountSid: "AC00000000000000000000000000000001",
    From: "+19496662578",
    To: "+19498072145",
    Body: "Your AI Matrx verification code is: 123456",
    NumMedia: "0",
    NumSegments: "1",
    ...overrides,
  };
}

function signedRequest(
  fields: Record<string, string>,
  signature: string | null = twilio.getExpectedTwilioSignature(
    AUTH_TOKEN,
    URL,
    fields,
  ),
): NextRequest {
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
  });
  if (signature !== null) headers.set("x-twilio-signature", signature);
  return new NextRequest(URL, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
}

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  storeMock.mockReset();
  storeMock.mockResolvedValue({ stored: true, id: "row-1", duplicate: false });
});

afterAll(() => {
  process.env.TWILIO_AUTH_TOKEN = ORIGINAL_AUTH_TOKEN;
});

describe("POST /api/webhooks/twilio/test-handset", () => {
  it("stores a correctly signed inbound message and answers empty TwiML", async () => {
    const response = await POST(signedRequest(form()));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(storeMock).toHaveBeenCalledTimes(1);

    const stored = storeMock.mock.calls[0][0];
    expect(stored.providerMessageSid).toBe(
      "SM00000000000000000000000000000001",
    );
    expect(stored.toNumber).toBe("+19498072145");
    expect(stored.fromNumber).toBe("+19496662578");
    // The REAL verification code must survive into the row — this is the whole
    // reason the door exists, since the Twilio API redacts it.
    expect(stored.body).toBe("Your AI Matrx verification code is: 123456");
    expect(stored.webhookPath).toBe("/api/webhooks/twilio/test-handset");
  });

  it("refuses a forged signature and writes nothing", async () => {
    const response = await POST(signedRequest(form(), "not-a-real-signature"));

    expect(response.status).toBe(403);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("refuses a request with no signature header and writes nothing", async () => {
    const response = await POST(signedRequest(form(), null));

    expect(response.status).toBe(403);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("refuses a signature made with a different auth token", async () => {
    const fields = form();
    const otherToken = twilio.getExpectedTwilioSignature(
      "a-different-auth-token",
      URL,
      fields,
    );

    const response = await POST(signedRequest(fields, otherToken));

    expect(response.status).toBe(403);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("answers 500 when the durable write fails, so Twilio retries", async () => {
    storeMock.mockResolvedValue({
      stored: false,
      reason: "write_failed",
      detail: "boom",
    });

    const response = await POST(signedRequest(form()));

    expect(response.status).toBe(500);
  });

  it("answers empty TwiML without failing when the destination is not a test handset", async () => {
    storeMock.mockResolvedValue({ stored: false, reason: "not_a_test_handset" });

    const response = await POST(
      signedRequest(form({ To: "+19496773627" })),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EMPTY_TWIML);
  });
});
