/** @jest-environment node */

import twilio from "twilio";
import { NextRequest } from "next/server";

import {
  claimInboundSmsReceipt,
  classifySmsPolicyKeyword,
  completeInboundSmsReceipt,
  isPhoneNumberOptedOut,
  parseInboundSmsPayload,
  processInboundSms,
  releaseInboundSmsReceipt,
  resolveSmsInboundContext,
} from "@/lib/sms/receive";

import { POST } from "./route";

jest.mock("@/lib/sms/receive", () => ({
  claimInboundSmsReceipt: jest.fn(),
  classifySmsPolicyKeyword: jest.fn(),
  completeInboundSmsReceipt: jest.fn(),
  isPhoneNumberOptedOut: jest.fn(),
  parseInboundSmsPayload: jest.fn(),
  processInboundSms: jest.fn(),
  releaseInboundSmsReceipt: jest.fn(),
  resolveSmsInboundContext: jest.fn(),
}));

const URL = "https://www.aimatrx.com/api/webhooks/twilio/sms";
const AUTH_TOKEN = "sms-route-test-auth-token";
const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;

const payload = {
  AccountSid: "AC123",
  MessageSid: "SM123",
  From: "+14155550100",
  To: "+14158059951",
  Body: "hello",
  NumMedia: "0",
  ApiVersion: "2010-04-01",
};

const receipt = {
  receiptId: "33333333-3333-4333-8333-333333333333",
  duplicate: false,
  processable: true,
  providerEventKey: "twilio:inbound:AC123:SM123",
};

const context = {
  status: "resolved" as const,
  provider: "twilio" as const,
  providerAccountId: payload.AccountSid,
  providerMessageId: payload.MessageSid,
  source: payload.From,
  destination: payload.To,
  organizationId: "44444444-4444-4444-8444-444444444444",
  userId: "55555555-5555-4555-8555-555555555555",
  partyId: null,
  contactMediumId: null,
  contactPointId: null,
  destinationIdentityId: "66666666-6666-4666-8666-666666666666",
  programKey: "ai_matrx_owner_beta",
  smsConversationId: "22222222-2222-4222-8222-222222222222",
  chatConversationId: "77777777-7777-4777-8777-777777777777",
  chatConversationIsNew: true,
  assistantEnabled: true,
  agentMessagesEnabled: true,
  agentId: "88888888-8888-4888-8888-888888888888",
  agentVersionId: null,
};

function signedRequest(signatureOverride?: string): NextRequest {
  const signature =
    signatureOverride ??
    twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL, payload);
  return new NextRequest(URL, {
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
    jest.mocked(parseInboundSmsPayload).mockReturnValue({
      ...payload,
      NumSegments: "1",
      SmsStatus: "received",
    });
    jest.mocked(claimInboundSmsReceipt).mockResolvedValue(receipt);
    jest.mocked(resolveSmsInboundContext).mockResolvedValue(context);
    jest.mocked(classifySmsPolicyKeyword).mockReturnValue(null);
    jest.mocked(isPhoneNumberOptedOut).mockResolvedValue(false);
    jest.mocked(processInboundSms).mockResolvedValue({
      messageId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      userId: context.userId,
      isNewConversation: true,
      hasMedia: false,
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
    expect(claimInboundSmsReceipt).toHaveBeenCalled();
    expect(resolveSmsInboundContext).toHaveBeenCalled();
    expect(isPhoneNumberOptedOut).toHaveBeenCalledWith(
      context.source,
      context.organizationId,
    );
    expect(processInboundSms).toHaveBeenCalledWith(
      expect.objectContaining({ MessageSid: payload.MessageSid }),
      { receipt, context, aiProcessingStatus: "pending" },
    );
  });

  test("stores START before opt-out enforcement and never offers it to the agent", async () => {
    jest.mocked(classifySmsPolicyKeyword).mockReturnValue("opt_in");

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(isPhoneNumberOptedOut).not.toHaveBeenCalled();
    expect(processInboundSms).toHaveBeenCalledWith(
      expect.any(Object),
      {
        receipt,
        context,
        aiProcessingStatus: "skipped",
        skipReason: "policy_keyword_opt_in",
      },
    );
  });

  test("never queues an agent turn when the user-level assistant preference is off", async () => {
    const userPausedContext = { ...context, agentMessagesEnabled: false };
    jest.mocked(resolveSmsInboundContext).mockResolvedValue(userPausedContext);

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(processInboundSms).toHaveBeenCalledWith(
      expect.any(Object),
      {
        receipt,
        context: userPausedContext,
        aiProcessingStatus: "skipped",
        skipReason: "assistant_not_configured_or_paused",
      },
    );
  });

  test("acknowledges a duplicate receipt without running resolution", async () => {
    jest.mocked(claimInboundSmsReceipt).mockResolvedValue({
      ...receipt,
      duplicate: true,
      processable: false,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resolveSmsInboundContext).not.toHaveBeenCalled();
    expect(processInboundSms).not.toHaveBeenCalled();
  });

  test("fails closed before SMS processing when the signature is invalid", async () => {
    const response = await POST(signedRequest("invalid"));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    expect(isPhoneNumberOptedOut).not.toHaveBeenCalled();
    expect(processInboundSms).not.toHaveBeenCalled();
  });

  test("releases a durable receipt and asks Twilio to retry after processing failure", async () => {
    jest.mocked(resolveSmsInboundContext).mockRejectedValue(new Error("database unavailable"));

    const response = await POST(signedRequest());

    expect(response.status).toBe(500);
    expect(releaseInboundSmsReceipt).toHaveBeenCalledWith(
      receipt.receiptId,
      "database unavailable",
    );
    expect(completeInboundSmsReceipt).not.toHaveBeenCalled();
  });
});
