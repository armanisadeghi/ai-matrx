/** @jest-environment node */
import twilio from "twilio";
import { POST } from "./route";
import { resolveVoiceOwnerBetaTransfer } from "@/lib/communications/voice/owner-beta-program";
import { outboundSuppression } from "@/lib/communications/outbound-guard";
jest.mock("@/lib/communications/voice/owner-beta-program", () => ({
  resolveVoiceOwnerBetaTransfer: jest.fn(),
}));
jest.mock("@/lib/communications/outbound-guard", () => ({
  outboundSuppression: jest.fn(),
}));

const callbackUrl =
  "https://www.aimatrx.com/api/webhooks/twilio/voice/relay-ended";
const token = "relay-ended-test-token";
const originalToken = process.env.TWILIO_AUTH_TOKEN;

function callback(params: Record<string, string>, signature?: string): Request {
  return new Request(callbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature":
        signature ??
        twilio.getExpectedTwilioSignature(token, callbackUrl, params),
    },
    body: new URLSearchParams(params),
  });
}

describe("caller fallback after a relay closes", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = token;
    jest
      .mocked(resolveVoiceOwnerBetaTransfer)
      .mockReset()
      .mockResolvedValue(null);
    jest.mocked(outboundSuppression).mockReset().mockReturnValue(null);
  });
  afterAll(() => {
    process.env.TWILIO_AUTH_TOKEN = originalToken;
  });

  test.each(["failed", "unknown", ""])(
    "explains a %s session without exposing provider content",
    async (status) => {
      const response = await POST(
        callback({
          CallStatus: "in-progress",
          SessionStatus: status,
          ErrorMessage: "private provider content",
          HandoffData: "private caller summary",
        }),
      );
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/xml");
      expect(body).toContain("connection has ended");
      expect(body).toContain("Please call again");
      expect(body.indexOf("<Say")).toBeLessThan(body.indexOf("<Hangup/>"));
      expect(body).not.toContain("private");
      expect(body).not.toContain("<Connect");
    },
  );

  test.each<Record<string, string>>([
    {},
    {
      HandoffData: "private caller summary",
      ErrorMessage: "private provider content",
    },
  ])("ends a deliberate app completion with a farewell", async (details) => {
    const body = await (
      await POST(
        callback({
          CallStatus: "in-progress",
          SessionStatus: "ended",
          ...details,
        }),
      )
    ).text();
    expect(body).toContain("Thank you for calling");
    expect(body).toContain("<Hangup/>");
    expect(body).not.toContain("call again");
    expect(body).not.toContain("private");
  });

  test.each([
    { CallStatus: "completed", SessionStatus: "failed" },
    { CallStatus: "in-progress", SessionStatus: "completed" },
  ])("keeps an already hung-up call silent", async (params) => {
    const body = await (await POST(callback(params))).text();
    expect(body).toContain("<Hangup/>");
    expect(body).not.toContain("<Say");
  });

  test("uses the existing provider signature boundary", async () => {
    expect(
      (await POST(callback({ SessionStatus: "failed" }, "forged"))).status,
    ).toBe(403);
  });
});

test("signed handoff composes admitted routing and clone suppression before Dial", async () => {
  process.env.TWILIO_AUTH_TOKEN = token;
  jest.mocked(resolveVoiceOwnerBetaTransfer).mockResolvedValue("+19498072145");
  jest.mocked(outboundSuppression).mockReturnValue(null);
  const params = {
    AccountSid: "fixture",
    CallSid: "fixture",
    From: "+19497027626",
    To: "+18005550101",
    Direction: "inbound",
    CallStatus: "in-progress",
    SessionStatus: "ended",
    HandoffData: '{"reasonCode":"live-agent-handoff"}',
  };
  const xml = await (await POST(callback(params))).text();
  expect(resolveVoiceOwnerBetaTransfer).toHaveBeenCalledWith({
    provider: "twilio",
    providerAccountId: params.AccountSid,
    providerCallId: params.CallSid,
    callerNumber: params.From,
    calledNumber: params.To,
    direction: params.Direction,
  });
  expect(outboundSuppression).toHaveBeenCalledWith("voice", "+19498072145");
  expect(xml).toContain("<Dial");
  jest.mocked(outboundSuppression).mockReturnValue({
    code: "suppressed_on_clone",
    database: { host: "clone.invalid", ref: null, isProduction: false },
    channel: "voice",
    message: "test",
  });
  const suppressed = await (await POST(callback(params))).text();
  expect(suppressed).not.toContain("<Dial");
  expect(suppressed).toContain("not available for transfer");
  jest
    .mocked(resolveVoiceOwnerBetaTransfer)
    .mockRejectedValue(new Error("private failure"));
  const failed = await (await POST(callback(params))).text();
  expect(failed).not.toContain("private failure");
  expect(failed).toContain("not available for transfer");
});
