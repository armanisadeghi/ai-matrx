/** Signed Twilio Voice lifecycle callback boundary. Durable persistence lands in P6 phase 2. */

import { NextResponse } from "next/server";

import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import { parseTwilioVoiceLifecycleEvent } from "@/lib/communications/providers/twilio/voice";

export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/twilio/voice/status";

export async function POST(request: Request): Promise<NextResponse> {
  const validation = await validateTwilioWebhook(request, WEBHOOK_PATH);
  if (!validation.valid) {
    console.error("Twilio Voice status validation failed", {
      error: validation.error,
    });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = parseTwilioVoiceLifecycleEvent(validation.params);
  if (!parsed.ok) {
    console.error("Twilio Voice status payload rejected", { error: parsed.error });
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Structured operator evidence only. P0 owns the schema and will persist this exact event
  // contract under a unique providerEventKey; do not misuse SMS logs as a call ledger.
  console.info("Twilio Voice lifecycle event received", parsed.value);
  return new NextResponse(null, { status: 204 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    webhook: "AI Matrx Voice Lifecycle Callback",
    method: "POST",
    persistence: "pending_p0_call_lifecycle_contract",
    idempotency: "providerEventKey",
  });
}
