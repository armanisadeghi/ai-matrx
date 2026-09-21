/**
 * POST /api/webhooks/twilio/test-handset-voice
 *
 * The inbound VOICE door for the two loopback TEST HANDSETS. A handset is a
 * receiver, not a program: when something calls one, we record the fact and
 * hang up politely. Nothing is transcribed, nothing is recorded, no consent
 * flow runs — the real voice program lives at /api/webhooks/twilio/voice.
 *
 * The row is written to the same communication.test_handset_inbox table with
 * direction 'inbound' and webhook_path set to this route, so the battery can
 * prove a call reached a handset the same way it proves a text did.
 */

import { NextResponse } from "next/server";
import twilio from "twilio";

import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import {
  parseInboundTestHandsetPayload,
  storeInboundTestHandsetMessage,
} from "@/lib/sms/test-handset-inbox";

export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/twilio/test-handset-voice";

const HANGUP_LINE =
  "This is an automated A I Matrix test handset. It does not take calls. Goodbye.";

function twimlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

function buildTestHandsetHangupTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "Polly.Joanna-Neural" }, HANGUP_LINE);
  response.hangup();
  return response.toString();
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { valid, params, error } = await validateTwilioWebhook(
      request,
      WEBHOOK_PATH,
    );

    if (!valid) {
      console.error("Test-handset voice webhook validation failed:", error);
      return new NextResponse("Forbidden", { status: 403 });
    }

    const message = parseInboundTestHandsetPayload(params, WEBHOOK_PATH);
    // A voice call has no Body; record what the call WAS so the row is legible.
    message.body = `[voice call ${params.CallSid ?? "unknown"} status=${
      params.CallStatus ?? "unknown"
    }]`;

    const result = await storeInboundTestHandsetMessage(message);
    if (!result.stored && result.reason === "write_failed") {
      console.error(
        "Test-handset voice write failed:",
        result.detail,
        message.providerMessageSid,
      );
    } else if (!result.stored) {
      console.warn(
        "Test-handset voice webhook refused a non-test-handset destination:",
        message.toNumber,
      );
    }

    // The caller always gets the same honest answer, stored or not.
    return twimlResponse(buildTestHandsetHangupTwiml());
  } catch (err) {
    console.error("Error processing test-handset voice webhook:", err);
    return twimlResponse(buildTestHandsetHangupTwiml());
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    webhook: "AI Matrx Test Handset Inbound Voice",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    description:
      "Records inbound calls to a registered test-handset number in " +
      "communication.test_handset_inbox and hangs up. Harness only.",
  });
}
