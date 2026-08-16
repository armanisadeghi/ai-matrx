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
import {
  claimVoiceCallConsentEvent,
  getVoiceCallConsentPersistenceReadiness,
  getVoiceRecordingPersistenceReadiness,
  registerVoiceCallInteraction,
  resolveVoiceOwnerCallContext,
} from "@/lib/communications/voice/persistence";
import { evaluateVoiceRecordingReadiness } from "@/lib/communications/voice/recording-readiness";
import { evaluateConversationRelayReadiness } from "@/lib/communications/voice/conversation-relay-readiness";
import {
  getVoiceStorageCanaryReadiness,
  type VoiceStorageCanaryReadiness,
} from "@/lib/communications/voice/storage-canary-readiness";

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
  action.searchParams.set(
    "disclosure_version",
    OWNER_BETA_VOICE_DISCLOSURE_VERSION,
  );
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
    console.error("Twilio Voice webhook payload rejected", {
      error: parsed.error,
    });
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

  try {
    const callContext = await resolveVoiceOwnerCallContext({
      programKey: admission.programKey,
      destinationId: admission.destinationId,
      provider: "twilio",
      providerAccountId: parsed.value.accountSid,
      callerPhone: parsed.value.from,
      calledPhone: parsed.value.to,
    });
    await registerVoiceCallInteraction({
      partyId: callContext.party_id,
      contactPointId: callContext.contact_point_id,
      organizationId: callContext.organization_id,
      recordingOwnerId: callContext.recording_owner_id,
      direction: "inbound",
      provider: "twilio",
      providerAccountId: parsed.value.accountSid,
      providerCallId: parsed.value.callSid,
      programKey: admission.programKey,
      fromAddress: parsed.value.from,
      toAddress: parsed.value.to,
      occurredAt: null,
    });
  } catch {
    console.error("Twilio Voice canonical call registration unavailable", {
      provider: "twilio",
      providerAccountId: parsed.value.accountSid,
      providerCallId: parsed.value.callSid,
      programKey: admission.programKey,
      recordingStarted: false,
    });
    return twimlResponse(
      stage === CONSENT_STAGE
        ? buildOwnerBetaNoConsentTwiml()
        : buildOwnerBetaRejectedCallerTwiml(),
    );
  }

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
    const reason =
      contextValid && !decision.consented
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

  try {
    await claimVoiceCallConsentEvent(consentEvidence);
  } catch {
    console.error("Twilio Voice affirmative consent persistence failed", {
      provider: consentEvidence.provider,
      providerAccountId: consentEvidence.providerAccountId,
      providerCallId: consentEvidence.providerCallId,
      providerEventKey: consentEvidence.providerEventKey,
      programKey: consentEvidence.programKey,
      recordingStarted: false,
    });
    return twimlResponse(buildOwnerBetaNoConsentTwiml());
  }

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
  let lifecyclePersistenceReady = false;
  let callLifecyclePersistenceReady = false;
  try {
    const persistence = await getVoiceRecordingPersistenceReadiness();
    lifecyclePersistenceReady = persistence.ready;
    callLifecyclePersistenceReady =
      persistence.call_claim_ready &&
      persistence.event_idempotency_ready &&
      persistence.provider_identity_unique &&
      persistence.ambiguous_call_count === 0;
  } catch {
    lifecyclePersistenceReady = false;
    callLifecyclePersistenceReady = false;
  }
  let consentPersistenceReady = false;
  try {
    consentPersistenceReady = (await getVoiceCallConsentPersistenceReadiness())
      .ready;
  } catch {
    consentPersistenceReady = false;
  }
  let storageCanary: VoiceStorageCanaryReadiness = {
    ready: false,
    status: "missing",
    evidenceId: null,
    completedAt: null,
    validUntil: null,
  };
  try {
    storageCanary = await getVoiceStorageCanaryReadiness();
  } catch {
    storageCanary = {
      ready: false,
      status: "missing",
      evidenceId: null,
      completedAt: null,
      validUntil: null,
    };
  }
  const recordingReadiness = evaluateVoiceRecordingReadiness({
    owner_only_program_bound: ownerBeta.ready,
    disclosure_and_consent_verified: false,
    provider_email_verification_current: false,
    dedicated_storage_identity_ready: storageCanary.ready,
    external_storage_configured: false,
    external_storage_canary_passed: storageCanary.ready,
    lifecycle_persistence_ready: lifecyclePersistenceReady,
    canonical_file_ingest_ready: storageCanary.ready,
    retention_access_deletion_ready: storageCanary.ready,
  });
  const conversationRelayReadiness = evaluateConversationRelayReadiness({
    strict_wire_contract_ready: true,
    signed_admission_ready: true,
    one_time_reference_ready: true,
    canonical_runtime_ready: true,
    bounded_session_host_ready: true,
    secret_free_telemetry_ready: true,
    provider_playback_decoder_ready: false,
    canonical_call_lifecycle_ready: callLifecyclePersistenceReady,
    playback_activity_persistence_ready: true,
    public_route_mounted: false,
    owned_number_routed: false,
    code_switch_enabled: false,
    provider_switch_enabled: false,
    program_switch_enabled: false,
  });

  return NextResponse.json({
    webhook: "AI Matrx Inbound Voice",
    mode: "owner_beta_consent_gate",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    recordingStarted: false,
    conversationRelayConnected: false,
    conversationRelay: {
      enabled: false,
      mode: "disabled_unmounted",
      durableSystemOfRecord: "crm.interaction + platform.activity_log",
      readiness: conversationRelayReadiness,
    },
    ownerBeta,
    consent: {
      required: true,
      acceptedInputs: ["DTMF 1", 'speech: "I agree"'],
      disclosureVersion: OWNER_BETA_VOICE_DISCLOSURE_VERSION,
      persistence: consentPersistenceReady
        ? "durable_activity_ledger_ready"
        : "unavailable",
    },
    statusCallback: "https://www.aimatrx.com/api/webhooks/twilio/voice/status",
    recording: {
      enabled: false,
      mode: "blocked_until_all_gates_pass",
      durableSystemOfRecord: "AI Matrx canonical file storage",
      plannedStatusCallback:
        "https://www.aimatrx.com/api/webhooks/twilio/voice/recording",
      storageCanary,
      readiness: recordingReadiness,
    },
  });
}
