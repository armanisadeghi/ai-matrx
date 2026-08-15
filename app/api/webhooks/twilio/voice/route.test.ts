/** @jest-environment node */

import twilio from "twilio";

import {
  authorizeVoiceOwnerBetaCall,
  inspectVoiceOwnerBetaProgram,
} from "@/lib/communications/voice/owner-beta-program";
import { getVoiceRecordingPersistenceReadiness } from "@/lib/communications/voice/persistence";
import { OWNER_BETA_VOICE_DISCLOSURE_VERSION } from "@/lib/communications/providers/twilio/voice-twiml";

import { GET, POST } from "./route";

jest.mock("@/lib/communications/voice/owner-beta-program", () => ({
  authorizeVoiceOwnerBetaCall: jest.fn(),
  inspectVoiceOwnerBetaProgram: jest.fn(),
}));
jest.mock("@/lib/communications/voice/persistence", () => ({
  getVoiceRecordingPersistenceReadiness: jest.fn(),
}));

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
    expect(response.headers.get("content-type")).toBe("text/xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("A.I. Matrix");
    expect(body).toContain("not being recorded right now");
    expect(body).toContain("press 1 or say, I agree");
    expect(body).toContain("<Gather");
    expect(body).not.toContain("<Record");
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
  });

  test("accepts an affirmative response into structured evidence without recording", async () => {
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
    expect(body).toContain("not recording this call");
    expect(body).not.toContain("<Record");
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
      }),
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
});
