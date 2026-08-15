/** @jest-environment node */

import twilio from "twilio";

import {
  claimVoiceRecordingLifecycleEvent,
  getVoiceRecordingPersistenceReadiness,
  voicePersistenceHttpStatus,
} from "@/lib/communications/voice/persistence";
import { GET, POST } from "./route";

jest.mock("@/lib/communications/voice/persistence", () => ({
  claimVoiceRecordingLifecycleEvent: jest.fn(),
  getVoiceRecordingPersistenceReadiness: jest.fn(),
  voicePersistenceHttpStatus: jest.fn(),
}));

const URL = "https://www.aimatrx.com/api/webhooks/twilio/voice/recording";
const AUTH_TOKEN = "recording-route-test-auth-token";
const originalAuthToken = process.env.TWILIO_AUTH_TOKEN;
const claimRecording = jest.mocked(claimVoiceRecordingLifecycleEvent);
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
    RecordingSid: "RE123",
    RecordingStatus: "completed",
    RecordingDuration: "42",
    RecordingChannels: "2",
    RecordingSource: "StartCallRecordingAPI",
    RecordingTrack: "both",
    RecordingUrl: "https://api.twilio.com/recordings/RE123",
  };
}

describe("POST /api/webhooks/twilio/voice/recording", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    claimRecording.mockReset();
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
    expect(claimRecording).not.toHaveBeenCalled();
  });

  test("refuses completed evidence without a provider URL", async () => {
    const params = completedParams();
    delete params.RecordingUrl;
    const response = await POST(signedRequest(params));

    expect(response.status).toBe(400);
    expect(claimRecording).not.toHaveBeenCalled();
  });

  test("acknowledges only after the exact event is durably claimed", async () => {
    claimRecording.mockResolvedValue({
      disposition: "applied",
      effective_status: "completed",
      event_id: 17,
      interaction_id: "interaction-1",
    });

    const response = await POST(signedRequest(completedParams()));

    expect(response.status).toBe(204);
    expect(claimRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        providerAccountId: "AC123",
        providerCallId: "CA123",
        providerRecordingId: "RE123",
        status: "completed",
      }),
    );
  });

  test("returns non-success when persistence crashes before the claim", async () => {
    claimRecording.mockRejectedValue(new Error("database unavailable"));
    persistenceStatus.mockReturnValue(500);

    const response = await POST(signedRequest(completedParams()));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Recording callback not accepted");
  });

  test("returns non-success when the call cannot be correlated", async () => {
    claimRecording.mockRejectedValue(new Error("no exact call"));
    persistenceStatus.mockReturnValue(409);

    const response = await POST(signedRequest(completedParams()));

    expect(response.status).toBe(409);
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
    expect(body).toMatchObject({
      recordingEnabled: false,
      providerMediaUrlRole: "evidence_only",
      durablePlaybackIdentity: "canonical_file_id",
      persistence: { ready: true },
    });
  });
});
