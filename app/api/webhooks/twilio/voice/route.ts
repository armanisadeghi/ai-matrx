/** Signed production Twilio Voice webhook for the static telephony-readiness proof. */

import { NextResponse } from "next/server";

import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import { parseTwilioInboundVoiceRequest } from "@/lib/communications/providers/twilio/voice";
import { buildStaticVoiceTestTwiml } from "@/lib/communications/providers/twilio/voice-twiml";

export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/twilio/voice";

export async function POST(request: Request): Promise<NextResponse> {
  const validation = await validateTwilioWebhook(request, WEBHOOK_PATH);
  if (!validation.valid) {
    console.error("Twilio Voice webhook validation failed", {
      error: validation.error,
    });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = parseTwilioInboundVoiceRequest(validation.params);
  if (!parsed.ok) {
    console.error("Twilio Voice webhook payload rejected", { error: parsed.error });
    return new NextResponse("Bad Request", { status: 400 });
  }

  console.info("Twilio Voice static proof answered", {
    provider: "twilio",
    providerAccountId: parsed.value.accountSid,
    providerCallId: parsed.value.callSid,
    mode: "static_disclosed_test",
    recordingStarted: false,
  });

  return new NextResponse(buildStaticVoiceTestTwiml(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    webhook: "AI Matrx Inbound Voice",
    mode: "static_disclosed_test",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    recordingStarted: false,
    conversationRelayConnected: false,
    statusCallback: "https://www.aimatrx.com/api/webhooks/twilio/voice/status",
  });
}
