/** @jest-environment node */

/**
 * POST /api/webhooks/twilio/sms — the inbound SMS security boundary.
 *
 * SUT: the route handler. It OWNS: refusing unsigned/forged deliveries before
 * any write, the duplicate-receipt short-circuit, refusing to process a sender
 * it cannot bind to exactly one person, honoring STOP even for unbound
 * senders, stopping opted-out senders, and the processing decision handed to
 * the persistence layer (pending vs skipped + reason).
 *
 * Real here: Twilio signature validation (signatures computed with the public
 * Twilio algorithm over a known auth token), payload parsing, policy-keyword
 * classification, and the command-candidate check. Stubbed: only the
 * functions in `@/lib/sms/receive` that read or write the database.
 */

import twilio from "twilio";
import { NextRequest } from "next/server";

import {
  claimInboundSmsReceipt,
  completeInboundSmsReceipt,
  honorUnresolvedSmsPolicyKeyword,
  isPhoneNumberOptedOut,
  processInboundSms,
  releaseInboundSmsReceipt,
  resolveSmsInboundContext,
} from "@/lib/sms/receive";
import type {
  AmbiguousSmsInboundContext,
  ClaimedSmsInboundReceipt,
  ResolvedSmsInboundContext,
  UnresolvedSmsInboundContext,
} from "@/lib/sms/identity";
import type { InboundSmsPayload } from "@/lib/sms/types";

import { POST } from "./route";

jest.mock("@/lib/sms/receive", () => ({
  ...jest.requireActual<typeof import("@/lib/sms/receive")>(
    "@/lib/sms/receive",
  ),
  // Database edges only — parsing and keyword classification stay real.
  claimInboundSmsReceipt: jest.fn(),
  completeInboundSmsReceipt: jest.fn(),
  honorUnresolvedSmsPolicyKeyword: jest.fn(),
  isPhoneNumberOptedOut: jest.fn(),
  processInboundSms: jest.fn(),
  releaseInboundSmsReceipt: jest.fn(),
  resolveSmsInboundContext: jest.fn(),
}));

const URL = "https://www.aimatrx.com/api/webhooks/twilio/sms";
const AUTH_TOKEN = "sms-route-test-auth-token";
const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

/** The form Twilio posts for one inbound text. */
function twilioForm(body: string): Record<string, string> {
  return {
    AccountSid: "AC123",
    MessageSid: "SM123",
    From: "+14155550100",
    To: "+14158059951",
    Body: body,
    NumMedia: "0",
    ApiVersion: "2010-04-01",
  };
}

/** What the route must hand to persistence for that form (literal, not derived). */
function parsedPayload(body: string): InboundSmsPayload {
  return {
    MessageSid: "SM123",
    AccountSid: "AC123",
    From: "+14155550100",
    To: "+14158059951",
    Body: body,
    NumMedia: "0",
    NumSegments: "1",
    SmsStatus: "received",
    ApiVersion: "2010-04-01",
  };
}

const receipt = {
  receiptId: "33333333-3333-4333-8333-333333333333",
  duplicate: false,
  processable: true,
  providerEventKey: "twilio:inbound:AC123:SM123",
} satisfies ClaimedSmsInboundReceipt;

const context = {
  status: "resolved",
  provider: "twilio",
  providerAccountId: "AC123",
  providerMessageId: "SM123",
  source: "+14155550100",
  destination: "+14158059951",
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
} satisfies ResolvedSmsInboundContext;

const unknownSender = {
  status: "not_found",
  provider: "twilio",
  providerAccountId: "AC123",
  providerMessageId: "SM123",
  source: "+14155550100",
  destination: "+14158059951",
  reason: "no_verified_identity",
} satisfies UnresolvedSmsInboundContext;

const ambiguousSender = {
  status: "ambiguous",
  provider: "twilio",
  providerAccountId: "AC123",
  providerMessageId: "SM123",
  source: "+14155550100",
  destination: "+14158059951",
  reason: "multiple_parties",
  candidateCount: 2,
  candidatePartyIds: [
    "99999999-9999-4999-8999-999999999991",
    "99999999-9999-4999-8999-999999999992",
  ],
} satisfies AmbiguousSmsInboundContext;

function signedRequest(
  form: Record<string, string>,
  signature: string | null = twilio.getExpectedTwilioSignature(
    AUTH_TOKEN,
    URL,
    form,
  ),
): NextRequest {
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
  });
  if (signature !== null) headers.set("x-twilio-signature", signature);
  return new NextRequest(URL, {
    method: "POST",
    headers,
    body: new URLSearchParams(form),
  });
}

describe("POST /api/webhooks/twilio/sms", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    jest.clearAllMocks();
    jest.mocked(claimInboundSmsReceipt).mockResolvedValue(receipt);
    jest.mocked(resolveSmsInboundContext).mockResolvedValue(context);
    jest.mocked(isPhoneNumberOptedOut).mockResolvedValue(false);
    jest.mocked(honorUnresolvedSmsPolicyKeyword).mockResolvedValue(true);
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

  describe("refuses deliveries Twilio did not sign", () => {
    test("refuses a forged signature before claiming any receipt", async () => {
      const response = await POST(signedRequest(twilioForm("hello"), "forged"));

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("Forbidden");
      expect(claimInboundSmsReceipt).not.toHaveBeenCalled();
      expect(processInboundSms).not.toHaveBeenCalled();
    });

    test("refuses a delivery with no signature header before claiming any receipt", async () => {
      const response = await POST(signedRequest(twilioForm("hello"), null));

      expect(response.status).toBe(403);
      expect(claimInboundSmsReceipt).not.toHaveBeenCalled();
    });

    test("refuses a body signed with a different account's auth token", async () => {
      const form = twilioForm("hello");
      const otherAccountSignature = twilio.getExpectedTwilioSignature(
        "some-other-account-token",
        URL,
        form,
      );

      const response = await POST(signedRequest(form, otherAccountSignature));

      expect(response.status).toBe(403);
      expect(claimInboundSmsReceipt).not.toHaveBeenCalled();
    });
  });

  test("queues an agent turn for a signed text from a resolved, consenting sender", async () => {
    const response = await POST(signedRequest(twilioForm("hello")));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/xml");
    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(claimInboundSmsReceipt).toHaveBeenCalledWith(parsedPayload("hello"));
    expect(isPhoneNumberOptedOut).toHaveBeenCalledWith(
      "+14155550100",
      "44444444-4444-4444-8444-444444444444",
    );
    expect(processInboundSms).toHaveBeenCalledTimes(1);
    expect(processInboundSms).toHaveBeenCalledWith(parsedPayload("hello"), {
      receipt,
      context,
      aiProcessingStatus: "pending",
      skipReason: undefined,
      commandCandidate: false,
    });
  });

  test("acknowledges a duplicate delivery without resolving or processing it again", async () => {
    jest.mocked(claimInboundSmsReceipt).mockResolvedValue({
      ...receipt,
      duplicate: true,
      processable: false,
    });

    const response = await POST(signedRequest(twilioForm("hello")));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(resolveSmsInboundContext).not.toHaveBeenCalled();
    expect(processInboundSms).not.toHaveBeenCalled();
  });

  test("never processes a text from a sender bound to more than one person", async () => {
    jest.mocked(resolveSmsInboundContext).mockResolvedValue(ambiguousSender);

    const response = await POST(signedRequest(twilioForm("hello")));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(processInboundSms).not.toHaveBeenCalled();
    expect(honorUnresolvedSmsPolicyKeyword).not.toHaveBeenCalled();
    expect(completeInboundSmsReceipt).toHaveBeenCalledWith(
      receipt.receiptId,
      null,
      "ambiguous:multiple_parties",
    );
  });

  test("honors STOP from a sender it cannot bind to a person", async () => {
    jest.mocked(resolveSmsInboundContext).mockResolvedValue(unknownSender);

    const response = await POST(signedRequest(twilioForm("STOP")));

    expect(response.status).toBe(200);
    expect(honorUnresolvedSmsPolicyKeyword).toHaveBeenCalledWith(
      parsedPayload("STOP"),
      "opt_out",
      "twilio:inbound:AC123:SM123",
    );
    expect(completeInboundSmsReceipt).toHaveBeenCalledWith(
      receipt.receiptId,
      null,
      "not_found:no_verified_identity:honored_opt_out",
    );
    expect(processInboundSms).not.toHaveBeenCalled();
  });

  test("stores START before opt-out enforcement and never offers it to the agent", async () => {
    const response = await POST(signedRequest(twilioForm("START")));

    expect(response.status).toBe(200);
    expect(isPhoneNumberOptedOut).not.toHaveBeenCalled();
    expect(processInboundSms).toHaveBeenCalledWith(parsedPayload("START"), {
      receipt,
      context,
      aiProcessingStatus: "skipped",
      skipReason: "policy_keyword_opt_in",
    });
  });

  test("never processes a text from a sender who has opted out", async () => {
    jest.mocked(isPhoneNumberOptedOut).mockResolvedValue(true);

    const response = await POST(signedRequest(twilioForm("hello")));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(processInboundSms).not.toHaveBeenCalled();
    expect(completeInboundSmsReceipt).toHaveBeenCalledWith(
      receipt.receiptId,
      null,
      "sender_opted_out",
    );
  });

  test("never queues an agent turn when the user-level assistant preference is off", async () => {
    const userPausedContext = { ...context, agentMessagesEnabled: false };
    jest.mocked(resolveSmsInboundContext).mockResolvedValue(userPausedContext);

    const response = await POST(signedRequest(twilioForm("hello")));

    expect(response.status).toBe(200);
    expect(processInboundSms).toHaveBeenCalledWith(parsedPayload("hello"), {
      receipt,
      context: userPausedContext,
      aiProcessingStatus: "skipped",
      skipReason: "assistant_not_configured_or_paused",
      commandCandidate: false,
    });
  });

  test("queues an agent turn without a transport-level agent pointer", async () => {
    const mandateResolvedLater = {
      ...context,
      agentId: null,
      agentVersionId: null,
    };
    jest
      .mocked(resolveSmsInboundContext)
      .mockResolvedValue(mandateResolvedLater);

    const response = await POST(signedRequest(twilioForm("hello")));

    expect(response.status).toBe(200);
    expect(processInboundSms).toHaveBeenCalledWith(parsedPayload("hello"), {
      receipt,
      context: mandateResolvedLater,
      aiProcessingStatus: "pending",
      skipReason: undefined,
      commandCandidate: false,
    });
  });

  test("queues exact DONE for command correlation without an assistant binding", async () => {
    const noAgentContext = {
      ...context,
      assistantEnabled: false,
      agentMessagesEnabled: false,
      agentId: null,
    };
    jest.mocked(resolveSmsInboundContext).mockResolvedValue(noAgentContext);

    const response = await POST(signedRequest(twilioForm("  done  ")));

    expect(response.status).toBe(200);
    expect(processInboundSms).toHaveBeenCalledWith(parsedPayload("  done  "), {
      receipt,
      context: noAgentContext,
      aiProcessingStatus: "skipped",
      skipReason: "sms_command_offer_unverified",
      commandCandidate: true,
    });
  });

  test("releases a claimed receipt and asks Twilio to retry after processing failure", async () => {
    jest
      .mocked(resolveSmsInboundContext)
      .mockRejectedValue(new Error("database unavailable"));

    const response = await POST(signedRequest(twilioForm("hello")));

    expect(response.status).toBe(500);
    expect(releaseInboundSmsReceipt).toHaveBeenCalledWith(
      receipt.receiptId,
      "database unavailable",
    );
    expect(completeInboundSmsReceipt).not.toHaveBeenCalled();
  });

  test("rejects a signed but malformed delivery without claiming a receipt", async () => {
    const { MessageSid: _dropped, ...withoutMessageSid } = twilioForm("hello");

    const response = await POST(signedRequest(withoutMessageSid));

    expect(response.status).toBe(400);
    expect(claimInboundSmsReceipt).not.toHaveBeenCalled();
    expect(releaseInboundSmsReceipt).not.toHaveBeenCalled();
  });
});
