/** @jest-environment node */

/**
 * The filter is the safety property. These tests exist to prove it can REFUSE,
 * not merely that it can store: a number that is not registered as a test
 * handset must produce zero writes, so no real person's inbound message can
 * ever be read out of communication.test_handset_inbox.
 */

jest.mock("server-only", () => ({}));

const insertMock = jest.fn();
const phoneLookupMock = jest.fn();

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => ({
    schema: () => ({
      from: (table: string) => {
        if (table === "sms_phone_numbers") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({ maybeSingle: phoneLookupMock }),
                }),
              }),
            }),
          };
        }
        return {
          insert: (row: Record<string, unknown>) => {
            insertMock(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: "row-1" }, error: null }),
              }),
            };
          },
        };
      },
    }),
  }),
}));

import {
  parseInboundTestHandsetPayload,
  storeInboundTestHandsetMessage,
} from "./test-handset-inbox";

const HANDSET_ONE = "+19498072145";
const ARMANS_REAL_PHONE = "+19496773627";
const TEST_ORG = "39c38960-d30c-4840-b0c1-c9960de95582";

function message(toNumber: string) {
  return parseInboundTestHandsetPayload(
    {
      MessageSid: "SM00000000000000000000000000000001",
      AccountSid: "AC00000000000000000000000000000001",
      From: "+19496662578",
      To: toNumber,
      Body: "Your AI Matrx verification code is: 654321",
      NumMedia: "0",
      NumSegments: "1",
    },
    "/api/webhooks/twilio/test-handset",
  );
}

beforeEach(() => {
  insertMock.mockReset();
  phoneLookupMock.mockReset();
});

describe("storeInboundTestHandsetMessage", () => {
  it("stores a message to a registered test handset, carrying the org explicitly", async () => {
    phoneLookupMock.mockResolvedValue({
      data: { organization_id: TEST_ORG },
      error: null,
    });

    const result = await storeInboundTestHandsetMessage(message(HANDSET_ONE));

    expect(result).toEqual({ stored: true, id: "row-1", duplicate: false });
    expect(insertMock).toHaveBeenCalledTimes(1);

    const row = insertMock.mock.calls[0][0];
    expect(row.organization_id).toBe(TEST_ORG);
    expect(row.to_number).toBe(HANDSET_ONE);
    expect(row.direction).toBe("inbound");
    expect(row.body).toBe("Your AI Matrx verification code is: 654321");
  });

  it("🚨 REFUSES a number that is not a registered test handset, writing NOTHING", async () => {
    // The lookup is filtered on program_key = 'ai_matrx_test_handset', so a
    // real person's number comes back empty.
    phoneLookupMock.mockResolvedValue({ data: null, error: null });

    const result = await storeInboundTestHandsetMessage(
      message(ARMANS_REAL_PHONE),
    );

    expect(result).toEqual({ stored: false, reason: "not_a_test_handset" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("refuses when the handset lookup errors, rather than storing anyway", async () => {
    phoneLookupMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });

    const result = await storeInboundTestHandsetMessage(message(HANDSET_ONE));

    expect(result).toEqual({ stored: false, reason: "not_a_test_handset" });
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("parseInboundTestHandsetPayload", () => {
  it("keeps the real body and falls back across Twilio's SID field names", () => {
    const parsed = parseInboundTestHandsetPayload(
      { SmsSid: "SM123", From: "+1", To: "+2", Body: "hello", NumMedia: "2" },
      "/api/webhooks/twilio/test-handset",
    );

    expect(parsed.providerMessageSid).toBe("SM123");
    expect(parsed.body).toBe("hello");
    expect(parsed.numMedia).toBe(2);
    expect(parsed.numSegments).toBeNull();
  });
});
