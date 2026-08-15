/** @jest-environment node */

import twilio from "twilio";

import {
  claimVoiceCallLifecycleEvent,
  getVoiceRecordingPersistenceReadiness,
  voicePersistenceHttpStatus,
} from "@/lib/communications/voice/persistence";
import { GET, POST } from "./route";

jest.mock("@/lib/communications/voice/persistence", () => ({
  claimVoiceCallLifecycleEvent: jest.fn(),
  getVoiceRecordingPersistenceReadiness: jest.fn(),
  voicePersistenceHttpStatus: jest.fn(),
}));

const URL = "https://www.aimatrx.com/api/webhooks/twilio/voice/status";
const AUTH_TOKEN = "call-status-route-test-auth-token";
const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
const claimCall = jest.mocked(claimVoiceCallLifecycleEvent);
const getReadiness = jest.mocked(getVoiceRecordingPersistenceReadiness);
const persistenceStatus = jest.mocked(voicePersistenceHttpStatus);

function signedRequest(
  params: Record<string, string>,
  signatureOverride?: string,
): Request {
  const signature =
    signatureOverride ??
    twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL, params);
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: new URLSearchParams(params),
  });
}

function completedParams(): Record<string, string> {
  return {
    AccountSid: "AC123",
    CallSid: "CA123",
    CallStatus: "completed",
    SequenceNumber: "3",
    Timestamp: "Sat, 15 Aug 2026 20:00:00 +0000",
  };
}

describe("POST /api/webhooks/twilio/voice/status", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    claimCall.mockReset();
    getReadiness.mockReset();
    persistenceStatus.mockReset();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.TWILIO_AUTH_TOKEN = originalAuthToken;
  });

  test("refuses a forged callback before persistence", async () => {
    const response = await POST(signedRequest(completedParams(), "invalid"));

    expect(response.status).toBe(403);
    expect(claimCall).not.toHaveBeenCalled();
  });

  test("acknowledges only after the exact call event is durably claimed", async () => {
    claimCall.mockResolvedValue({
      disposition: "applied",
      effective_status: "completed",
      event_id: 23,
      interaction_id: "interaction-1",
    });

    const response = await POST(signedRequest(completedParams()));

    expect(response.status).toBe(204);
    expect(claimCall).toHaveBeenCalledWith(
      expect.objectContaining({
        providerAccountId: "AC123",
        providerCallId: "CA123",
        sequence: 3,
        status: "completed",
      }),
    );
  });

  test("does not acknowledge a crash before durable claim", async () => {
    claimCall.mockRejectedValue(new Error("database unavailable"));
    persistenceStatus.mockReturnValue(500);

    const response = await POST(signedRequest(completedParams()));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Call callback not accepted");
  });

  test("reports readiness from the live persistence probe", async () => {
    getReadiness.mockResolvedValue({
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

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.persistence).toMatchObject({ ready: true });
  });
});
