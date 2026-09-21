/** @jest-environment node */

/**
 * THE STRUCTURAL TEST. The test-handset OTP path exists because Twilio Verify
 * codes cannot be read back, and the whole safety of it rests on one claim: a
 * number that is not designated as a test handset CANNOT take this path, by
 * any spelling of any request. There is no env var, flag or header to check —
 * the only admission is the database designation — so what these tests prove
 * is that the gate is closed by default and opens only on that row.
 *
 * Both controls the ruling asked for are here:
 *   - negative: a non-designated number (Arman's real phone) is refused, sends
 *     nothing and stores nothing;
 *   - positive: a designated handset is admitted and completes.
 */

jest.mock("server-only", () => ({}));

const phoneLookupMock = jest.fn();
const insertMock = jest.fn();
const selectRowMock = jest.fn();
const updateMock = jest.fn();

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => ({
    schema: () => ({
      from: (table: string) => {
        if (table === "sms_phone_numbers") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ is: () => ({ maybeSingle: phoneLookupMock }) }),
              }),
            }),
          };
        }
        // communication.test_handset_verification
        return {
          insert: async (row: Record<string, unknown>) => {
            insertMock(row);
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: selectRowMock }),
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            updateMock(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    }),
  }),
}));

import {
  checkTestHandsetVerification,
  isDesignatedTestHandset,
  OTP_MAX_ATTEMPTS,
  sendTestHandsetVerification,
} from "./test-handset-otp";

const HANDSET_ONE = "+19498072145";
const ARMANS_REAL_PHONE = "+19496773627";
const TEST_ORG = "39c38960-d30c-4840-b0c1-c9960de95582";

const fetchMock = jest.fn();

function designated() {
  phoneLookupMock.mockResolvedValue({
    data: { phone_number: HANDSET_ONE, organization_id: TEST_ORG },
    error: null,
  });
}

function notDesignated() {
  // The lookup is filtered on program_key = 'ai_matrx_test_handset', so any
  // number without that registration comes back empty.
  phoneLookupMock.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_MESSAGING_SERVICE_SID = "MGtest";
  fetchMock.mockResolvedValue({ ok: true, text: async () => "" });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("isDesignatedTestHandset — the admission gate", () => {
  it("admits a registered test handset", async () => {
    designated();
    await expect(isDesignatedTestHandset(HANDSET_ONE)).resolves.toBe(true);
  });

  it("🚨 refuses a number that is not registered as a test handset", async () => {
    notDesignated();
    await expect(isDesignatedTestHandset(ARMANS_REAL_PHONE)).resolves.toBe(false);
  });

  it("🚨 treats a FAILED lookup as 'not a handset', never as an admission", async () => {
    phoneLookupMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    await expect(isDesignatedTestHandset(HANDSET_ONE)).resolves.toBe(false);
  });
});

describe("sendTestHandsetVerification", () => {
  it("positive control: issues a code to a designated handset and sends it", async () => {
    designated();
    const result = await sendTestHandsetVerification(HANDSET_ONE);

    expect(result).toEqual({ success: true, status: "pending" });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const row = insertMock.mock.calls[0][0] as Record<string, string>;
    expect(row.organization_id).toBe(TEST_ORG);
    expect(row.phone_number).toBe(HANDSET_ONE);
    // Hashed at rest, with a per-row salt. The plaintext is never stored.
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.code_salt).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(row)).not.toMatch(/"code"/);

    // The code that goes out is six digits, and it is NOT in the stored row.
    const body = (fetchMock.mock.calls[0][1] as { body: URLSearchParams }).body;
    const sentText = body.get("Body") ?? "";
    // The wording must NOT be OTP-shaped: Twilio blocks and redacts that.
    expect(sentText).toContain("test handset pairing");
    expect(sentText).not.toMatch(/verification code/i);
    const code = sentText.match(/(\d{6})/)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    expect(row.code_hash).not.toContain(code as string);
    // Sent over OUR OWN Messaging Service, not Twilio Verify.
    expect(body.get("MessagingServiceSid")).toBe("MGtest");
  });

  it("🚨 NEGATIVE CONTROL: a non-designated number sends NOTHING and stores NOTHING", async () => {
    notDesignated();
    const result = await sendTestHandsetVerification(ARMANS_REAL_PHONE);

    expect(result.success).toBe(false);
    expect(result.status).toBe("denied");
    expect(result.error).toBe("not a designated test handset");
    expect(insertMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("checkTestHandsetVerification — Twilio Verify's semantics, kept", () => {
  const SALT = "a".repeat(32);
  // sha256("<salt>:123456"), computed by the module's own scheme.
  function hashOf(code: string): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createHash } = require("crypto");
    return createHash("sha256").update(`${SALT}:${code}`).digest("hex");
  }

  function pending(overrides: Record<string, unknown> = {}) {
    selectRowMock.mockResolvedValue({
      data: {
        id: "otp-1",
        code_salt: SALT,
        code_hash: hashOf("123456"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: null,
        attempts: 0,
        ...overrides,
      },
      error: null,
    });
  }

  it("approves the right code and BURNS it (single use)", async () => {
    designated();
    pending();

    const result = await checkTestHandsetVerification(HANDSET_ONE, "123456");

    expect(result).toEqual({ success: true, status: "approved" });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ consumed_at: expect.any(String) }),
    );
  });

  it("refuses the wrong code and counts the attempt", async () => {
    designated();
    pending();

    const result = await checkTestHandsetVerification(HANDSET_ONE, "000000");

    expect(result.success).toBe(false);
    expect(updateMock).toHaveBeenCalledWith({ attempts: 1 });
  });

  it("refuses an EXPIRED code even when it is correct", async () => {
    designated();
    pending({ expires_at: new Date(Date.now() - 1000).toISOString() });

    const result = await checkTestHandsetVerification(HANDSET_ONE, "123456");

    expect(result.success).toBe(false);
    expect(result.error).toBe("code expired");
  });

  it("refuses past the attempt ceiling even when the code is correct", async () => {
    designated();
    pending({ attempts: OTP_MAX_ATTEMPTS });

    const result = await checkTestHandsetVerification(HANDSET_ONE, "123456");

    expect(result.success).toBe(false);
    expect(result.error).toBe("too many attempts");
  });

  it("🚨 NEGATIVE CONTROL: a non-designated number cannot check a code at all", async () => {
    notDesignated();
    const result = await checkTestHandsetVerification(ARMANS_REAL_PHONE, "123456");

    expect(result.success).toBe(false);
    expect(result.error).toBe("not a designated test handset");
    expect(selectRowMock).not.toHaveBeenCalled();
  });
});
