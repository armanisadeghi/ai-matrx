/** Signed Twilio Voice webhook for the disclosed, non-recording owner beta. */

import { NextResponse } from "next/server";

import { validateTwilioWebhook } from "@/lib/communications/providers/twilio/webhook-validation";
import {
  parseTwilioInboundVoiceRequest,
  parseTwilioVoiceConsentDecision,
  twilioVoiceConsentEventKey,
} from "@/lib/communications/providers/twilio/voice";
import {
  buildOwnerBetaConsentAcceptedTwiml,
  buildOwnerBetaConsentPromptTwiml,
  buildOwnerBetaNoConsentTwiml,
  buildOwnerBetaRejectedCallerTwiml,
  OWNER_BETA_VOICE_DISCLOSURE,
  OWNER_BETA_VOICE_DISCLOSURE_VERSION,
} from "@/lib/communications/providers/twilio/voice-twiml";
import {
  authorizeVoiceOwnerBetaCall,
  inspectVoiceOwnerBetaProgram,
} from "@/lib/communications/voice/owner-beta-program";
import {
  createCallConsentEvidence,
  isFreshCallDisclosure,
} from "@/lib/communications/voice/consent";
import { evaluateVoiceRecordingReadiness } from "@/lib/communications/voice/recording-readiness";

export const runtime = "nodejs";

const WEBHOOK_PATH = "/api/webhooks/twilio/voice";
const CONSENT_STAGE = "owner-beta-consent";
const CONSENT_WINDOW_MS = 5 * 60 * 1000;

function twimlResponse(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

function buildConsentActionUrl(input: {
  signedUrl: string;
  callSid: string;
  disclosedAt: string;
}): string {
  const action = new URL(input.signedUrl);
  action.search = "";
  action.searchParams.set("stage", CONSENT_STAGE);
  action.searchParams.set("call", input.callSid);
  action.searchParams.set("disclosed_at", input.disclosedAt);
  action.searchParams.set("disclosure_version", OWNER_BETA_VOICE_DISCLOSURE_VERSION);
  return action.toString();
}

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

  let admission;
  try {
    admission = await authorizeVoiceOwnerBetaCall({
      provider: "twilio",
      providerAccountId: parsed.value.accountSid,
      providerCallId: parsed.value.callSid,
      callerNumber: parsed.value.from,
      calledNumber: parsed.value.to,
      direction: parsed.value.direction,
    });
  } catch {
    console.error("Twilio Voice owner beta admission unavailable", {
      provider: "twilio",
      providerAccountId: parsed.value.accountSid,
      providerCallId: parsed.value.callSid,
      recordingStarted: false,
    });
    return twimlResponse(buildOwnerBetaRejectedCallerTwiml());
  }

  if (admission.status !== "authorized") {
    console.info("Twilio Voice owner beta call rejected", {
      provider: "twilio",
      providerAccountId: parsed.value.accountSid,
      providerCallId: parsed.value.callSid,
      reason: admission.reason,
      recordingStarted: false,
    });
    return twimlResponse(buildOwnerBetaRejectedCallerTwiml());
  }

  const signedUrl = validation.signedUrl;
  if (!signedUrl) {
    return twimlResponse(buildOwnerBetaNoConsentTwiml());
  }
  const url = new URL(signedUrl);
  const stage = url.searchParams.get("stage");
  if (stage === null && url.search === "") {
    const disclosedAt = new Date().toISOString();
    console.info("Twilio Voice owner beta consent offered", {
      provider: "twilio",
      providerAccountId: parsed.value.accountSid,
      providerCallId: parsed.value.callSid,
      programKey: admission.programKey,
      disclosureVersion: OWNER_BETA_VOICE_DISCLOSURE_VERSION,
      disclosedAt,
      recordingStarted: false,
    });
    return twimlResponse(
      buildOwnerBetaConsentPromptTwiml(
        buildConsentActionUrl({
          signedUrl,
          callSid: parsed.value.callSid,
          disclosedAt,
        }),
      ),
    );
  }

  const disclosedAt = url.searchParams.get("disclosed_at");
  const contextValid =
    stage === CONSENT_STAGE &&
    url.searchParams.get("call") === parsed.value.callSid &&
    url.searchParams.get("disclosure_version") ===
      OWNER_BETA_VOICE_DISCLOSURE_VERSION &&
    disclosedAt !== null &&
    isFreshCallDisclosure({
      disclosedAt,
      now: new Date().toISOString(),
      maxAgeMs: CONSENT_WINDOW_MS,
    });
  const decision = parseTwilioVoiceConsentDecision(validation.params);
  if (!contextValid || !decision.consented) {
    const reason = contextValid && !decision.consented
      ? decision.reason
      : "invalid_consent_context";
    console.info("Twilio Voice owner beta consent not received", {
      provider: "twilio",
      providerAccountId: parsed.value.accountSid,
      providerCallId: parsed.value.callSid,
      reason,
      recordingStarted: false,
    });
    return twimlResponse(buildOwnerBetaNoConsentTwiml());
  }
  if (disclosedAt === null) {
    return twimlResponse(buildOwnerBetaNoConsentTwiml());
  }

  const consentedAt = new Date().toISOString();
  const consentEvidence = createCallConsentEvidence({
    provider: "twilio",
    providerAccountId: parsed.value.accountSid,
    providerCallId: parsed.value.callSid,
    providerEventKey: twilioVoiceConsentEventKey({
      accountSid: parsed.value.accountSid,
      callSid: parsed.value.callSid,
      disclosureVersion: OWNER_BETA_VOICE_DISCLOSURE_VERSION,
    }),
    programKey: admission.programKey,
    disclosureVersion: OWNER_BETA_VOICE_DISCLOSURE_VERSION,
    disclosureText: OWNER_BETA_VOICE_DISCLOSURE,
    disclosedAt,
    responseKind: decision.responseKind,
    responseValue: decision.responseValue,
    consentedAt,
    source: "twiml",
  });

  console.info("Twilio Voice owner beta consent accepted", {
    ...consentEvidence,
    recordingStarted: false,
  });
  return twimlResponse(buildOwnerBetaConsentAcceptedTwiml());
}

export async function GET(): Promise<NextResponse> {
  let ownerBeta:
    | {
        status: "available";
        ready: boolean;
        programKey: string;
        destinationBinding: "missing" | "ambiguous" | "exact";
        verifiedCallerBinding: "missing" | "ambiguous" | "exact";
      }
    | { status: "unavailable"; ready: false };
  try {
    ownerBeta = {
      status: "available",
      ...(await inspectVoiceOwnerBetaProgram()),
    };
  } catch {
    ownerBeta = { status: "unavailable", ready: false };
  }
  const recordingReadiness = evaluateVoiceRecordingReadiness({
    owner_only_program_bound: ownerBeta.ready,
    disclosure_and_consent_verified: false,
    provider_email_verification_current: false,
    dedicated_storage_identity_ready: false,
    external_storage_configured: false,
    external_storage_canary_passed: false,
    lifecycle_persistence_ready: false,
    canonical_file_ingest_ready: false,
    retention_access_deletion_ready: false,
  });

  return NextResponse.json({
    webhook: "AI Matrx Inbound Voice",
    mode: "owner_beta_consent_gate",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    recordingStarted: false,
    conversationRelayConnected: false,
    ownerBeta,
    consent: {
      required: true,
      acceptedInputs: ["DTMF 1", 'speech: "I agree"'],
      disclosureVersion: OWNER_BETA_VOICE_DISCLOSURE_VERSION,
      persistence: "pending_lifecycle_integration",
    },
    statusCallback: "https://www.aimatrx.com/api/webhooks/twilio/voice/status",
    recording: {
      enabled: false,
      mode: "blocked_until_all_gates_pass",
      durableSystemOfRecord: "AI Matrx canonical file storage",
      plannedStatusCallback:
        "https://www.aimatrx.com/api/webhooks/twilio/voice/recording",
      readiness: recordingReadiness,
    },
  });
}
