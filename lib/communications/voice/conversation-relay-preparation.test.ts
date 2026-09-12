/** @jest-environment node */

import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";

jest.mock("server-only", () => ({}));

const mockInsert = jest.fn();
const mockFrom = jest.fn(() => ({ insert: mockInsert }));
const mockSchema = jest.fn(() => ({ from: mockFrom }));
const mockCreateAdminClient = jest.fn(() => ({ schema: mockSchema }));

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: mockCreateAdminClient,
}));

import {
  CONVERSATION_RELAY_PREPARATION_TIMEOUT_MS,
  ConversationRelayPreparationFailure,
  prepareConversationRelaySession,
  recordConversationRelayPreparationFailure,
} from "./conversation-relay-preparation";

describe("prepareConversationRelaySession", () => {
  const fetchMock = jest.fn<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
    mockInsert.mockReset().mockResolvedValue({ error: null });
    mockFrom.mockClear();
    mockSchema.mockClear();
    mockCreateAdminClient.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("forwards only Twilio-signed proof to aidream without a browser credential", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session_id: "11111111-1111-4111-8111-111111111111",
          chat_conversation_id: "22222222-2222-4222-8222-222222222222",
          session_reference: "owner-beta-session-reference-value",
          expires_at: "2026-09-11T12:00:00.000Z",
        }),
        { status: 200 },
      ),
    );

    await expect(
      prepareConversationRelaySession({
        signedUrl: "https://www.aimatrx.com/api/webhooks/twilio/voice",
        signature: "twilio-hmac",
        parameters: { AccountSid: "AC123", CallSid: "CA123" },
      }),
    ).resolves.toMatchObject({
      session_reference: "owner-beta-session-reference-value",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${AIDREAM_PRODUCTION_URL.replace(/\/$/, "")}/communications/voice/conversation-relay/session-reference`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(
      (options?.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.signal?.aborted).toBe(false);
    expect(CONVERSATION_RELAY_PREPARATION_TIMEOUT_MS).toBeLessThanOrEqual(
      5_000,
    );
  });

  test("returns typed, safe facts for a failed aidream preparation response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));

    await expect(
      prepareConversationRelaySession({
        signedUrl: "https://www.aimatrx.com/api/webhooks/twilio/voice",
        signature: "twilio-hmac",
        parameters: { AccountSid: "AC123", CallSid: "CA123" },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "http_response",
        httpStatus: 409,
        message: "ConversationRelay session preparation failed",
      }),
    );
  });

  test("fails closed and redacts a malformed successful response", async () => {
    const opaqueReference = "owner-beta-session-reference-value";
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session_id: "not-a-uuid",
          chat_conversation_id: "22222222-2222-4222-8222-222222222222",
          session_reference: opaqueReference,
          expires_at: "2026-09-11T12:00:00.000Z",
        }),
        { status: 200 },
      ),
    );

    try {
      await prepareConversationRelaySession({
        signedUrl: "https://www.aimatrx.com/api/webhooks/twilio/voice",
        signature: "twilio-hmac",
        parameters: { AccountSid: "AC123", CallSid: "CA123" },
      });
      throw new Error("Expected malformed preparation response to be refused");
    } catch (error) {
      expect(error).toEqual(
        expect.objectContaining({
          code: "invalid_response",
          httpStatus: null,
        }),
      );
      expect(error).not.toEqual(
        expect.objectContaining({
          message: expect.stringContaining(opaqueReference),
        }),
      );
    }
  });

  test("persists only typed failure code and HTTP status", async () => {
    await recordConversationRelayPreparationFailure(
      new ConversationRelayPreparationFailure("http_response", 409),
      "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        error_text:
          "ConversationRelay session preparation failed after consented recording began.",
        error_type: "ConversationRelayPreparationFailure",
        metadata: {
          boundary: "conversation_relay_session_preparation",
          failure_code: "http_response",
          http_status: 409,
          provider: "twilio",
          recording_started: true,
        },
      }),
    );
  });

  test("redacts an arbitrary thrown error from persisted telemetry", async () => {
    await recordConversationRelayPreparationFailure(
      new Error("secret signed URL and response body"),
      "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        error_type: "ConversationRelayPreparationFailure",
        metadata: expect.objectContaining({
          failure_code: "transport_failure",
          http_status: null,
        }),
      }),
    );
    expect(JSON.stringify(mockInsert.mock.calls[0])).not.toContain(
      "secret signed URL",
    );
  });
});
