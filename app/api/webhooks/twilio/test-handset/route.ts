/**
 * POST /api/webhooks/twilio/test-handset
 *
 * The inbound SMS door for the two loopback TEST HANDSETS
 * (+1 949 807 2145 for admin@admin.com, +1 949 666 2578 for test@test.com).
 *
 * These numbers are a harness, never a sender program, so they deliberately do
 * NOT go through the real inbound pipeline at /api/webhooks/twilio/sms: no
 * conversation, no agent turn, no consent adjudication. Everything that lands
 * here is written to communication.test_handset_inbox and nothing else
 * happens — which is exactly what makes it safe to read the Twilio Verify
 * codes and assistant replies the battery needs.
 *
 * The signature check is unconditional (see webhook-validation.ts). A message
 * whose `To` is not a registered test handset is refused and stored nowhere.
 */

import { NextResponse } from "next/server";
import twilio from "twilio";

import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import {
  parseInboundTestHandsetPayload,
  storeInboundTestHandsetMessage,
} from "@/lib/sms/test-handset-inbox";

export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/twilio/test-handset";

function emptyTwiml(status = 200): NextResponse {
  const twiml = new twilio.twiml.MessagingResponse();
  return new NextResponse(twiml.toString(), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { valid, params, error } = await validateTwilioWebhook(
      request,
      WEBHOOK_PATH,
    );

    if (!valid) {
      console.error("Test-handset webhook validation failed:", error);
      return new NextResponse("Forbidden", { status: 403 });
    }

    const message = parseInboundTestHandsetPayload(params, WEBHOOK_PATH);
    const result = await storeInboundTestHandsetMessage(message);

    if (!result.stored && result.reason === "write_failed") {
      // Nothing silently disappears: a failed write is a 500 so Twilio retries
      // and the failure shows up in the logs with its reason.
      console.error(
        "Test-handset inbound write failed:",
        result.detail,
        message.providerMessageSid,
      );
      return emptyTwiml(500);
    }

    if (!result.stored) {
      console.warn(
        "Test-handset webhook refused a non-test-handset destination:",
        message.toNumber,
      );
    }

    // The handset never answers. An empty TwiML response is the whole reply.
    return emptyTwiml();
  } catch (err) {
    console.error("Error processing test-handset inbound webhook:", err);
    return emptyTwiml(500);
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    webhook: "AI Matrx Test Handset Inbound SMS",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    description:
      "Stores every inbound message to a registered test-handset number in " +
      "communication.test_handset_inbox. Harness only — no conversation, no " +
      "agent turn, no consent adjudication.",
  });
}
