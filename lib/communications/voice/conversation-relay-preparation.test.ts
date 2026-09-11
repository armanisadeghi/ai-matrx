/** @jest-environment node */

import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";

jest.mock("server-only", () => ({}));

import { prepareConversationRelaySession } from "./conversation-relay-preparation";

describe("prepareConversationRelaySession", () => {
  const fetchMock = jest.fn<typeof fetch>();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
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
          session_reference: "reference",
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
    ).resolves.toMatchObject({ session_reference: "reference" });

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
  });

  test("refuses a failed aidream preparation response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(
      prepareConversationRelaySession({
        signedUrl: "https://www.aimatrx.com/api/webhooks/twilio/voice",
        signature: "twilio-hmac",
        parameters: { AccountSid: "AC123", CallSid: "CA123" },
      }),
    ).rejects.toThrow("HTTP 503");
  });
});
