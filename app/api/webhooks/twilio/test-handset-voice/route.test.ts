/** @jest-environment node */

import twilio from "twilio";

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

const URL = "https://www.aimatrx.com/api/webhooks/twilio/test-handset-voice";
const AUTH_TOKEN = "test-handset-voice-route-auth-token";

const storeMock = storeInboundTestHandsetMessage as jest.MockedFunction<
  typeof storeInboundTestHandsetMessage
>;

const ORIGINAL_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    CallSid: "CA00000000000000000000000000000001",
    AccountSid: "AC00000000000000000000000000000001",
    From: "+19496662578",
    To: "+19498072145",
    CallStatus: "ringing",
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
): Request {
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
  });
  if (signature !== null) headers.set("x-twilio-signature", signature);
  return new Request(URL, {
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

describe("POST /api/webhooks/twilio/test-handset-voice", () => {
  it("records a signed inbound call and hangs up", async () => {
    const response = await POST(signedRequest(form()));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/xml");
    expect(body).toContain("<Say");
    expect(body).toContain("<Hangup/>");
    expect(storeMock).toHaveBeenCalledTimes(1);

    const stored = storeMock.mock.calls[0][0];
    expect(stored.providerMessageSid).toBe(
      "CA00000000000000000000000000000001",
    );
    expect(stored.body).toContain("voice call");
    expect(stored.webhookPath).toBe("/api/webhooks/twilio/test-handset-voice");
  });

  it("refuses a forged signature and writes nothing", async () => {
    const response = await POST(signedRequest(form(), "forged"));

    expect(response.status).toBe(403);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("refuses a request with no signature header and writes nothing", async () => {
    const response = await POST(signedRequest(form(), null));

    expect(response.status).toBe(403);
    expect(storeMock).not.toHaveBeenCalled();
  });
});
