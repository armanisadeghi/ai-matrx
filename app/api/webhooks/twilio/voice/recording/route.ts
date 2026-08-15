/** Signed Twilio recording callback. Success means the event is durably claimed. */

import { NextResponse } from "next/server";

import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import { parseTwilioVoiceRecordingLifecycleEvent } from "@/lib/communications/providers/twilio/voice";
import {
  claimVoiceRecordingLifecycleEvent,
  getVoiceRecordingPersistenceReadiness,
  voicePersistenceHttpStatus,
} from "@/lib/communications/voice/persistence";

export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/twilio/voice/recording";

export async function POST(request: Request): Promise<NextResponse> {
  const validation = await validateTwilioWebhook(request, WEBHOOK_PATH);
  if (!validation.valid) {
    console.error("Twilio Voice recording validation failed", {
      error: validation.error,
    });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = parseTwilioVoiceRecordingLifecycleEvent(validation.params);
  if (
    !parsed.ok ||
    (parsed.value.status === "completed" && !parsed.value.providerMediaUrl)
  ) {
    console.error("Twilio Voice recording payload rejected", {
      error: parsed.ok
        ? "Completed recording callback is missing RecordingUrl"
        : parsed.error,
    });
    return new NextResponse("Bad Request", { status: 400 });
  }

  try {
    const claim = await claimVoiceRecordingLifecycleEvent(parsed.value);
    console.info("Twilio Voice recording event durably claimed", {
      provider: parsed.value.provider,
      providerAccountId: parsed.value.providerAccountId,
      providerCallId: parsed.value.providerCallId,
      providerRecordingId: parsed.value.providerRecordingId,
      status: parsed.value.status,
      disposition: claim.disposition,
      interactionId: claim.interaction_id,
      eventId: claim.event_id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Twilio Voice recording event was not durably claimed", {
      error: error instanceof Error ? error.message : "Unknown persistence error",
      providerAccountId: parsed.value.providerAccountId,
      providerCallId: parsed.value.providerCallId,
      providerRecordingId: parsed.value.providerRecordingId,
    });
    return new NextResponse("Recording callback not accepted", {
      status: voicePersistenceHttpStatus(error),
    });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const persistence = await getVoiceRecordingPersistenceReadiness();
    return NextResponse.json({
      webhook: "AI Matrx Voice Recording Lifecycle Callback",
      method: "POST",
      recordingEnabled: false,
      providerMediaUrlRole: "evidence_only",
      durablePlaybackIdentity: "canonical_file_id",
      persistence,
    });
  } catch (error) {
    console.error("Voice recording persistence readiness failed", {
      error: error instanceof Error ? error.message : "Unknown readiness error",
    });
    return NextResponse.json(
      {
        webhook: "AI Matrx Voice Recording Lifecycle Callback",
        recordingEnabled: false,
        persistence: { ready: false, available: false },
      },
      { status: 503 },
    );
  }
}
