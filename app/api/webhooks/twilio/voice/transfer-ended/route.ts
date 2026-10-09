/** Caller continuation after an attempted human transfer. */
import { NextResponse } from "next/server";
import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import {
  buildVoiceTransferEndedTwiml,
  VOICE_TRANSFER_ENDED_PATH,
} from "@/lib/communications/providers/twilio/voice-twiml";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const validation = await validateTwilioWebhook(
    request,
    VOICE_TRANSFER_ENDED_PATH,
  );
  if (!validation.valid) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(buildVoiceTransferEndedTwiml(validation.params), {
    headers: { "Content-Type": "text/xml" },
  });
}
