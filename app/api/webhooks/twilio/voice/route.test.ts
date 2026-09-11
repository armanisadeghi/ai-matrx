/** @jest-environment node */

import twilio from "twilio";

jest.mock("server-only", () => ({}));

import {
  authorizeVoiceOwnerBetaCall,
  inspectVoiceOwnerBetaProgram,
} from "@/lib/communications/voice/owner-beta-program";
import {
  claimVoiceCallConsentEvent,
  getVoiceCallConsentPersistenceReadiness,
  getVoiceRecordingPersistenceReadiness,
  registerVoiceCallInteraction,
  resolveVoiceOwnerCallContext,
} from "@/lib/communications/voice/persistence";
import { getVoiceProviderConfigurationReadiness } from "@/lib/communications/voice/provider-configuration-readiness";
import { getVoiceStorageCanaryReadiness } from "@/lib/communications/voice/storage-canary-readiness";
import {
  prepareConversationRelaySession,
  recordConversationRelayPreparationFailure,
} from "@/lib/communications/voice/conversation-relay-preparation";
import { getConversationRelayRuntimeReadiness } from "@/lib/communications/voice/conversation-relay-runtime-readiness";
import { OWNER_BETA_VOICE_DISCLOSURE_VERSION } from "@/lib/communications/providers/twilio/voice-twiml";

import { GET, POST } from "./route";

jest.mock("@/lib/communications/voice/owner-beta-program", () => ({
  authorizeVoiceOwnerBetaCall: jest.fn(),
  inspectVoiceOwnerBetaProgram: jest.fn(),
}));
jest.mock("@/lib/communications/voice/persistence", () => ({
  claimVoiceCallConsentEvent: jest.fn(),
  getVoiceCallConsentPersistenceReadiness: jest.fn(),
  getVoiceRecordingPersistenceReadiness: jest.fn(),
  registerVoiceCallInteraction: jest.fn(),
  resolveVoiceOwnerCallContext: jest.fn(),
}));
jest.mock("@/lib/communications/voice/storage-canary-readiness", () => ({
  getVoiceStorageCanaryReadiness: jest.fn(),
}));
jest.mock("@/lib/communications/voice/conversation-relay-preparation", () => ({
  CONVERSATION_RELAY_PUBLIC_URL:
    "wss://server.app.matrxserver.com/communications/voice/conversation-relay",
  prepareConversationRelaySession: jest.fn(),
  recordConversationRelayPreparationFailure: jest.fn(),
}));
jest.mock(
  "@/lib/communications/voice/conversation-relay-runtime-readiness",
  () => ({
    getConversationRelayRuntimeReadiness: jest.fn(),
  }),
);
jest.mock(
  "@/lib/communications/voice/provider-configuration-readiness",
  () => ({
    getVoiceProviderConfigurationReadiness: jest.fn(),
  }),
);

const WEBHOOK_URL = "https://www.aimatrx.com/api/webhooks/twilio/voice";
const AUTH_TOKEN = "voice-route-test-auth-token";
const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;

function signedRequest(
  params: Record<string, string>,
  signatureOverride?: string,
  url = WEBHOOK_URL,
): Request {
  const signature =
    signatureOverride ??
    twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, params);
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: new URLSearchParams(params),
  });
}

describe("POST /api/webhooks/twilio/voice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    jest.mocked(authorizeVoiceOwnerBetaCall).mockResolvedValue({
      status: "authorized",
      programKey: "ai_matrx_owner_beta",
      destinationId: "destination-1",
    });
    jest.mocked(inspectVoiceOwnerBetaProgram).mockResolvedValue({
      ready: true,
      programKey: "ai_matrx_owner_beta",
      destinationBinding: "exact",
      verifiedCallerBinding: "exact",
    });
    jest.mocked(getVoiceRecordingPersistenceReadiness).mockResolvedValue({
      ambiguous_call_count: 0,
      call_claim_ready: true,
      event_idempotency_ready: true,
      file_binding_ready: true,
      provider_identity_unique: true,
      provider_url_violation_count: 0,
      ready: true,
      recording_claim_ready: true,
      schema_ready: true,
    });
    jest.mocked(getVoiceCallConsentPersistenceReadiness).mockResolvedValue({
      canonical_identity_binding_count: 1,
      consent_claim_ready: true,
      event_idempotency_ready: true,
      ready: true,
      registration_ready: true,
      resolver_ready: true,
    });
    jest.mocked(getVoiceStorageCanaryReadiness).mockResolvedValue({
      ready: false,
      status: "missing",
      evidenceId: null,
      completedAt: null,
    });
    jest.mocked(getVoiceProviderConfigurationReadiness).mockResolvedValue({
      ready: false,
      status: "missing",
      evidenceId: null,
      verifiedAt: null,
      providerAccountVerified: false,
      externalStorageConfigured: false,
    });
    jest.mocked(getConversationRelayRuntimeReadiness).mockResolvedValue({
      public_route_mounted: true,
      code_switch_enabled: true,
      provider_switch_enabled: true,
      program_switch_enabled: true,
      owned_number_routed: true,
      routing_configuration_ready: true,
      owner_beta_ready: true,
    });
    jest.mocked(resolveVoiceOwnerCallContext).mockResolvedValue({
      party_id: "party-1",
      contact_point_id: "contact-point-1",
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      recording_owner_id: "owner-1",
    });
    jest.mocked(registerVoiceCallInteraction).mockResolvedValue({
      interaction_id: "interaction-1",
      disposition: "created",
    });
    jest.mocked(claimVoiceCallConsentEvent).mockResolvedValue({
      interaction_id: "interaction-1",
      event_id: 123,
      disposition: "created",
    });
    jest
      .mocked(prepareConversationRelaySession)
      .mockRejectedValue(new Error("relay disabled"));
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
  });

  test("answers an authorized signed call with a disclosed consent gate", async () => {
    const response = await POST(
      signedRequest({
        AccountSid: "AC123",
        CallSid: "CA123",
        From: "+14155550100",
        To: "+14158059951",
        Direction: "inbound",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/xml; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("A.I. Matrix");
    expect(body).toContain("not being recorded yet");
    expect(body).toContain("Twilio will record the call");
    expect(body).toContain("retained for up to 30 days");
    expect(body).toContain("press 1 or say, I agree");
    expect(body).toContain("<Gather");
    expect(body).not.toContain("<Record");
    expect(resolveVoiceOwnerCallContext).toHaveBeenCalledWith({
      programKey: "ai_matrx_owner_beta",
      destinationId: "destination-1",
      provider: "twilio",
      providerAccountId: "AC123",
      callerPhone: "+14155550100",
      calledPhone: "+14158059951",
    });
    expect(registerVoiceCallInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        partyId: "party-1",
        contactPointId: "contact-point-1",
        providerCallId: "CA123",
        direction: "inbound",
      }),
    );
    expect(console.info).toHaveBeenCalledWith(
      "Twilio Voice owner beta consent offered",
      expect.objectContaining({
        providerCallId: "CA123",
        recordingStarted: false,
      }),
    );
  });

  test("refuses an invalid signature before returning TwiML", async () => {
    const response = await POST(
      signedRequest(
        { AccountSid: "AC123", CallSid: "CA123", To: "+14158059951" },
        "invalid",
      ),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  test("refuses a signed but incomplete Voice payload", async () => {
    const response = await POST(
      signedRequest({ AccountSid: "AC123", CallSid: "CA123" }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
  });

  test("returns safe non-recording TwiML for an unknown caller", async () => {
    jest.mocked(authorizeVoiceOwnerBetaCall).mockResolvedValue({
      status: "denied",
      reason: "caller_not_verified",
    });
    const response = await POST(
      signedRequest({
        AccountSid: "AC123",
        CallSid: "CA123",
        From: "+14155550999",
        To: "+14158059951",
        Direction: "inbound",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("not available for this caller");
    expect(body).toContain("Nothing was recorded");
    expect(body).not.toContain("<Gather");
    expect(body).not.toContain("<Record");
    expect(console.info).toHaveBeenCalledWith(
      "Twilio Voice owner beta call rejected",
      expect.not.objectContaining({ callerNumber: expect.anything() }),
    );
  });

  test.each([
    "missing canonical party",
    "ambiguous canonical party",
    "missing or mismatched verified contact point",
  ])("fails canonical identity resolution closed: %s", async (reason) => {
    jest
      .mocked(resolveVoiceOwnerCallContext)
      .mockRejectedValueOnce(new Error(reason));
    const response = await POST(
      signedRequest({
        AccountSid: "AC123",
        CallSid: "CA123",
        From: "+14155550100",
        To: "+14158059951",
        Direction: "inbound",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("not available for this caller");
    expect(body).toContain("Nothing was recorded");
    expect(body).not.toContain("<Gather");
    expect(body).not.toContain("<Record");
    expect(registerVoiceCallInteraction).not.toHaveBeenCalled();
  });

  test("accepts an idempotent canonical call registration replay", async () => {
    jest.mocked(registerVoiceCallInteraction).mockResolvedValueOnce({
      interaction_id: "interaction-1",
      disposition: "replay",
    });
    const response = await POST(
      signedRequest({
        AccountSid: "AC123",
        CallSid: "CA123",
        From: "+14155550100",
        To: "+14158059951",
        Direction: "inbound",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("press 1 or say, I agree");
  });

  test("fails a consent timeout closed and never starts recording", async () => {
    const disclosedAt = new Date().toISOString();
    const consentUrl = new URL(WEBHOOK_URL);
    consentUrl.searchParams.set("stage", "owner-beta-consent");
    consentUrl.searchParams.set("call", "CA123");
    consentUrl.searchParams.set("disclosed_at", disclosedAt);
    consentUrl.searchParams.set(
      "disclosure_version",
      OWNER_BETA_VOICE_DISCLOSURE_VERSION,
    );
    const response = await POST(
      signedRequest(
        {
          AccountSid: "AC123",
          CallSid: "CA123",
          From: "+14155550100",
          To: "+14158059951",
          Direction: "inbound",
        },
        undefined,
        consentUrl.toString(),
      ),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("did not receive affirmative consent");
    expect(body).toContain("Nothing was recorded");
    expect(body).not.toContain("<Record");
    expect(claimVoiceCallConsentEvent).not.toHaveBeenCalled();
  });

  test("fails an affirmative response closed when durable consent persistence fails", async () => {
    jest
      .mocked(claimVoiceCallConsentEvent)
      .mockRejectedValueOnce(new Error("database unavailable"));
    const disclosedAt = new Date().toISOString();
    const consentUrl = new URL(WEBHOOK_URL);
    consentUrl.searchParams.set("stage", "owner-beta-consent");
    consentUrl.searchParams.set("call", "CA123");
    consentUrl.searchParams.set("disclosed_at", disclosedAt);
    consentUrl.searchParams.set(
      "disclosure_version",
      OWNER_BETA_VOICE_DISCLOSURE_VERSION,
    );
    const response = await POST(
      signedRequest(
        {
          AccountSid: "AC123",
          CallSid: "CA123",
          From: "+14155550100",
          To: "+14158059951",
          Direction: "inbound",
          Digits: "1",
        },
        undefined,
        consentUrl.toString(),
      ),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("did not receive affirmative consent");
    expect(body).toContain("Nothing was recorded");
    expect(body).not.toContain("consent was received");
    expect(body).not.toContain("<Record");
  });

  test("accepts consent but remains non-recording when launch readiness is incomplete", async () => {
    const disclosedAt = new Date().toISOString();
    const consentUrl = new URL(WEBHOOK_URL);
    consentUrl.searchParams.set("stage", "owner-beta-consent");
    consentUrl.searchParams.set("call", "CA123");
    consentUrl.searchParams.set("disclosed_at", disclosedAt);
    consentUrl.searchParams.set(
      "disclosure_version",
      OWNER_BETA_VOICE_DISCLOSURE_VERSION,
    );
    const response = await POST(
      signedRequest(
        {
          AccountSid: "AC123",
          CallSid: "CA123",
          From: "+14155550100",
          To: "+14158059951",
          Direction: "inbound",
          Digits: "1",
        },
        undefined,
        consentUrl.toString(),
      ),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("consent was received");
    expect(body).toContain("recording is not available right now");
    expect(body).not.toContain("<Record");
    expect(claimVoiceCallConsentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        providerAccountId: "AC123",
        providerCallId: "CA123",
        providerEventKey:
          "twilio:voice-consent:AC123:CA123:owner-beta-2026-08-17-v2",
        consented: true,
      }),
    );
    expect(console.info).toHaveBeenCalledWith(
      "Twilio Voice owner beta consent accepted",
      expect.objectContaining({
        providerAccountId: "AC123",
        providerCallId: "CA123",
        programKey: "ai_matrx_owner_beta",
        responseKind: "dtmf",
        responseValue: "1",
        consented: true,
        recordingStarted: false,
        recordingBlockedGateKeys: expect.arrayContaining([
          "provider_account_verified",
          "dedicated_storage_identity_ready",
          "external_storage_configured",
        ]),
      }),
    );
  });

  test("starts exact capture then connects the canonical relay with no optional events", async () => {
    jest.mocked(getVoiceStorageCanaryReadiness).mockResolvedValue({
      ready: true,
      status: "ready",
      evidenceId: 1234,
      completedAt: "2026-08-17T23:00:00.000Z",
    });
    jest.mocked(getVoiceProviderConfigurationReadiness).mockResolvedValue({
      ready: true,
      status: "ready",
      evidenceId: 5678,
      verifiedAt: "2026-08-17T23:00:00.000Z",
      providerAccountVerified: true,
      externalStorageConfigured: true,
    });
    jest.mocked(prepareConversationRelaySession).mockResolvedValue({
      session_id: "11111111-1111-4111-8111-111111111111",
      chat_conversation_id: "22222222-2222-4222-8222-222222222222",
      session_reference: "owner-beta-session-reference-value",
      expires_at: "2026-08-18T00:00:00Z",
    });
    const disclosedAt = new Date().toISOString();
    const consentUrl = new URL(WEBHOOK_URL);
    consentUrl.searchParams.set("stage", "owner-beta-consent");
    consentUrl.searchParams.set("call", "CA123");
    consentUrl.searchParams.set("disclosed_at", disclosedAt);
    consentUrl.searchParams.set(
      "disclosure_version",
      OWNER_BETA_VOICE_DISCLOSURE_VERSION,
    );

    const response = await POST(
      signedRequest(
        {
          AccountSid: "AC123",
          CallSid: "CA123",
          From: "+14155550100",
          To: "+14158059951",
          Direction: "inbound",
          Digits: "1",
        },
        undefined,
        consentUrl.toString(),
      ),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("<Start><Recording");
    expect(body).toContain('channels="dual"');
    expect(body).toContain('track="both"');
    expect(body).toContain(
      'recordingStatusCallback="https://www.aimatrx.com/api/webhooks/twilio/voice/recording"',
    );
    expect(body).toContain("Recording starts now");
    expect(body).toContain("<Connect><ConversationRelay");
    expect(body).toContain(
      'url="wss://server.app.matrxserver.com/communications/voice/conversation-relay"',
    );
    expect(body).toContain(
      '<Parameter name="sessionReference" value="owner-beta-session-reference-value"',
    );
    expect(body).not.toContain("events=");
    expect(prepareConversationRelaySession).toHaveBeenCalledWith({
      signedUrl: consentUrl.toString(),
      signature: expect.any(String),
      parameters: expect.objectContaining({
        AccountSid: "AC123",
        CallSid: "CA123",
        Digits: "1",
      }),
    });
    expect(claimVoiceCallConsentEvent).toHaveBeenCalledTimes(1);
    expect(
      jest.mocked(claimVoiceCallConsentEvent).mock.invocationCallOrder[0],
    ).toBeLessThan(
      jest.mocked(getVoiceStorageCanaryReadiness).mock.invocationCallOrder[0],
    );
    expect(console.info).toHaveBeenCalledWith(
      "Twilio Voice owner beta consent accepted",
      expect.objectContaining({
        providerCallId: "CA123",
        recordingStarted: true,
        conversationRelayConnected: true,
        recordingBlockedGateKeys: [],
      }),
    );
  });

  /** A signed POST to the consent action URL the route issued in its prompt. */
  function consentActionRequest(input: {
    call?: string;
    disclosedAt?: string;
    disclosureVersion?: string;
  }): Request {
    const actionUrl = new URL(WEBHOOK_URL);
    actionUrl.searchParams.set("stage", "owner-beta-consent");
    actionUrl.searchParams.set("call", input.call ?? "CA123");
    actionUrl.searchParams.set(
      "disclosed_at",
      input.disclosedAt ?? new Date().toISOString(),
    );
    actionUrl.searchParams.set(
      "disclosure_version",
      input.disclosureVersion ?? OWNER_BETA_VOICE_DISCLOSURE_VERSION,
    );
    return signedRequest(
      {
        AccountSid: "AC123",
        CallSid: "CA123",
        From: "+14155550100",
        To: "+14158059951",
        Direction: "inbound",
        Digits: "1",
      },
      undefined,
      actionUrl.toString(),
    );
  }

  test("captures a relay preparation failure while preserving consented recording", async () => {
    jest.mocked(getVoiceStorageCanaryReadiness).mockResolvedValueOnce({
      ready: true,
      status: "ready",
      evidenceId: 1234,
      completedAt: "2026-08-17T23:00:00.000Z",
    });
    jest.mocked(getVoiceProviderConfigurationReadiness).mockResolvedValueOnce({
      ready: true,
      status: "ready",
      evidenceId: 5678,
      verifiedAt: "2026-08-17T23:00:00.000Z",
      providerAccountVerified: true,
      externalStorageConfigured: true,
    });
    const preparationError = new Error("aidream unavailable");
    jest
      .mocked(prepareConversationRelaySession)
      .mockRejectedValueOnce(preparationError);

    const body = await (await POST(consentActionRequest({}))).text();

    expect(body).toContain("<Start><Recording");
    expect(body).not.toContain("<Connect><ConversationRelay");
    expect(recordConversationRelayPreparationFailure).toHaveBeenCalledWith(
      preparationError,
    );
  });

  test("rejects the caller without a consent prompt when owner-beta admission is unavailable", async () => {
    jest
      .mocked(authorizeVoiceOwnerBetaCall)
      .mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(
      signedRequest({
        AccountSid: "AC123",
        CallSid: "CA123",
        From: "+14155550100",
        To: "+14158059951",
        Direction: "inbound",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("not available for this caller");
    expect(body).not.toContain("<Gather");
    expect(body).not.toContain("<Record");
    expect(resolveVoiceOwnerCallContext).not.toHaveBeenCalled();
  });

  test("refuses a keypad consent replayed onto a different call's signed action URL", async () => {
    const response = await POST(consentActionRequest({ call: "CA999" }));
    const body = await response.text();

    expect(body).toContain("did not receive affirmative consent");
    expect(body).not.toContain("<Record");
    expect(claimVoiceCallConsentEvent).not.toHaveBeenCalled();
  });

  test("refuses consent given after the five-minute disclosure window", async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();

    const response = await POST(
      consentActionRequest({ disclosedAt: sixMinutesAgo }),
    );

    expect(await response.text()).toContain(
      "did not receive affirmative consent",
    );
    expect(claimVoiceCallConsentEvent).not.toHaveBeenCalled();
  });

  test("accepts consent given inside the five-minute disclosure window", async () => {
    const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();

    const response = await POST(
      consentActionRequest({ disclosedAt: fourMinutesAgo }),
    );

    expect(await response.text()).toContain("consent was received");
    expect(claimVoiceCallConsentEvent).toHaveBeenCalledTimes(1);
  });

  test("refuses consent against a superseded disclosure version", async () => {
    const response = await POST(
      consentActionRequest({ disclosureVersion: "owner-beta-2026-08-01-v1" }),
    );

    expect(await response.text()).toContain(
      "did not receive affirmative consent",
    );
    expect(claimVoiceCallConsentEvent).not.toHaveBeenCalled();
  });

  test("reports the recording lifecycle gate closed when persistence is not ready", async () => {
    jest.mocked(getVoiceRecordingPersistenceReadiness).mockResolvedValueOnce({
      ambiguous_call_count: 0,
      call_claim_ready: true,
      event_idempotency_ready: true,
      file_binding_ready: true,
      provider_identity_unique: true,
      provider_url_violation_count: 0,
      ready: false,
      recording_claim_ready: false,
      schema_ready: true,
    });

    const body = await (await GET()).json();

    expect(body.recording.readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lifecycle_persistence_ready",
          passed: false,
        }),
      ]),
    );
  });

  test("keeps the relay call-lifecycle gate closed while ambiguous calls exist", async () => {
    jest.mocked(getVoiceRecordingPersistenceReadiness).mockResolvedValueOnce({
      ambiguous_call_count: 3,
      call_claim_ready: true,
      event_idempotency_ready: true,
      file_binding_ready: true,
      provider_identity_unique: true,
      provider_url_violation_count: 0,
      ready: true,
      recording_claim_ready: true,
      schema_ready: true,
    });

    const body = await (await GET()).json();

    expect(body.conversationRelay.readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "canonical_call_lifecycle_ready",
          passed: false,
        }),
      ]),
    );
  });

  test("reports recording as disabled until every ownership gate passes", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recording).toMatchObject({
      enabled: false,
      mode: "blocked_until_all_gates_pass",
      readiness: {
        ready: false,
        passedGateCount: 2,
        totalGateCount: 9,
      },
    });
    expect(body.consent.persistence).toBe("durable_activity_ledger_ready");
    expect(body.conversationRelay).toMatchObject({
      enabled: true,
      mode: "owner_beta_ready",
      durableSystemOfRecord: "crm.interaction + platform.activity_log",
      readiness: {
        ready: true,
        optionalPlaybackEvidenceReady: false,
        passedGateCount: 13,
        totalGateCount: 14,
      },
    });
    expect(body.conversationRelay.readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "provider_playback_decoder_ready",
          passed: false,
        }),
        expect.objectContaining({
          key: "canonical_call_lifecycle_ready",
          passed: true,
        }),
        expect.objectContaining({
          key: "playback_activity_persistence_ready",
          passed: true,
        }),
        expect.objectContaining({ key: "public_route_mounted", passed: true }),
        expect.objectContaining({ key: "code_switch_enabled", passed: true }),
      ]),
    );
    expect(body.recording.storageCanary).toEqual({
      ready: false,
      status: "missing",
      evidenceId: null,
      completedAt: null,
    });
    expect(body.recording.providerConfiguration).toEqual({
      ready: false,
      status: "missing",
      evidenceId: null,
      verifiedAt: null,
      providerAccountVerified: false,
      externalStorageConfigured: false,
    });
    expect(body.recording.readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "owner_only_program_bound",
          passed: true,
        }),
        expect.objectContaining({
          key: "disclosure_and_consent_verified",
          passed: false,
        }),
        expect.objectContaining({
          key: "dedicated_storage_identity_ready",
          passed: false,
        }),
        expect.objectContaining({
          key: "lifecycle_persistence_ready",
          passed: true,
        }),
      ]),
    );
  });

  test("derives four storage gates from one exact canary receipt", async () => {
    jest.mocked(getVoiceStorageCanaryReadiness).mockResolvedValueOnce({
      ready: true,
      status: "ready",
      evidenceId: 1234,
      completedAt: "2026-08-16T20:00:00.000Z",
    });

    const response = await GET();
    const body = await response.json();

    expect(body.recording.enabled).toBe(false);
    expect(body.recording.readiness).toMatchObject({
      ready: false,
      passedGateCount: 6,
      totalGateCount: 9,
    });
    expect(body.recording.readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "dedicated_storage_identity_ready",
          passed: true,
        }),
        expect.objectContaining({
          key: "external_storage_canary_passed",
          passed: true,
        }),
        expect.objectContaining({
          key: "canonical_file_ingest_ready",
          passed: true,
        }),
        expect.objectContaining({
          key: "retention_access_deletion_ready",
          passed: true,
        }),
      ]),
    );
  });

  test("derives the two provider gates from one exact operator receipt", async () => {
    jest.mocked(getVoiceProviderConfigurationReadiness).mockResolvedValueOnce({
      ready: true,
      status: "ready",
      evidenceId: 5678,
      verifiedAt: "2026-08-17T23:00:00.000Z",
      providerAccountVerified: true,
      externalStorageConfigured: true,
    });

    const response = await GET();
    const body = await response.json();

    expect(body.recording.enabled).toBe(false);
    expect(body.recording.readiness).toMatchObject({
      ready: false,
      passedGateCount: 4,
      totalGateCount: 9,
    });
    expect(body.recording.readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "provider_account_verified",
          passed: true,
        }),
        expect.objectContaining({
          key: "external_storage_configured",
          passed: true,
        }),
        expect.objectContaining({
          key: "disclosure_and_consent_verified",
          passed: false,
        }),
      ]),
    );
  });

  test("fails relay lifecycle visibility closed when persistence proof is unavailable", async () => {
    jest
      .mocked(getVoiceRecordingPersistenceReadiness)
      .mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET();
    const body = await response.json();

    expect(body.conversationRelay.readiness).toMatchObject({
      ready: false,
      passedGateCount: 12,
      totalGateCount: 14,
    });
    expect(body.conversationRelay.readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "canonical_call_lifecycle_ready",
          passed: false,
        }),
      ]),
    );
  });
});
