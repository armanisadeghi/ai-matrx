/** Receiver-only introduction before Twilio bridges the transferred call. */
import { NextResponse } from "next/server";
import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import {
  buildVoiceTransferBriefTwiml,
  readVoiceTransferBrief,
  VOICE_TRANSFER_BRIEF_PATH,
} from "@/lib/communications/providers/twilio/voice-twiml";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<NextResponse> {
  const validation = await validateTwilioWebhook(
    request,
    VOICE_TRANSFER_BRIEF_PATH,
  );
  if (!validation.valid) return new NextResponse("Forbidden", { status: 403 });
  const query = new URL(request.url).searchParams;
  const requests = query.get("agentRequests");
  const interruptions = query.get("interruptions");
  const exactInteger = (raw: string | null) =>
    raw !== null && /^(0|[1-9]\d{0,2})$/.test(raw);
  const brief =
    exactInteger(requests) && exactInteger(interruptions)
      ? readVoiceTransferBrief(
          JSON.stringify({
            reasonCode: "live-agent-handoff",
            brief: {
              schemaVersion: 1,
              agentRequests: Number(requests),
              interruptions: Number(interruptions),
            },
          }),
        )
      : null;
  return new NextResponse(buildVoiceTransferBriefTwiml(brief), {
    headers: { "Content-Type": "text/xml" },
  });
}
