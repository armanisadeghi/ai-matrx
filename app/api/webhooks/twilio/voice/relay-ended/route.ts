/** Continue the caller-facing call lifecycle after ConversationRelay disconnects. */
import { NextResponse } from "next/server";
import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import {
  buildVoiceRelayEndedTwiml,
  VOICE_RELAY_ENDED_PATH,
  requestsHumanTransfer,
} from "@/lib/communications/providers/twilio/voice-twiml";

import { resolveVoiceOwnerBetaTransfer } from "@/lib/communications/voice/owner-beta-program";
import { outboundSuppression } from "@/lib/communications/outbound-guard";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const validation = await validateTwilioWebhook(
    request,
    VOICE_RELAY_ENDED_PATH,
  );
  if (!validation.valid) return new NextResponse("Forbidden", { status: 403 });
  let transferNumber: string | null = null;
  const params = validation.params;
  if (
    params.CallStatus !== "completed" &&
    params.SessionStatus === "ended" &&
    requestsHumanTransfer(params.HandoffData)
  ) {
    try {
      transferNumber = await resolveVoiceOwnerBetaTransfer({
        provider: "twilio",
        providerAccountId: params.AccountSid,
        providerCallId: params.CallSid,
        callerNumber: params.From,
        calledNumber: params.To,
        direction: params.Direction,
      });
      if (transferNumber && outboundSuppression("voice", transferNumber))
        transferNumber = null;
    } catch {
      // A routing read failure must not strand the caller or guess a destination.
      transferNumber = null;
    }
  }
  return new NextResponse(buildVoiceRelayEndedTwiml(params, transferNumber), {
    headers: { "Content-Type": "text/xml" },
  });
}
