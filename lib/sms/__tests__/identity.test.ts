import {
  isSmsCommandCandidate,
  normalizeSmsEndpoint,
  selectSingleSmsPreferenceBinding,
  smsInboundProviderEventKey,
  smsVerifiedPreferenceScope,
} from "@/lib/sms/identity";

describe("SMS identity contract", () => {
  test("normalizes endpoints through the canonical CRM normalizer", () => {
    expect(normalizeSmsEndpoint("(415) 555-1234")).toBe("+14155551234");
    expect(normalizeSmsEndpoint("+44 20 7946 0958")).toBe("+442079460958");
  });

  test("admits only the exact DONE command candidate before agent readiness", () => {
    expect(isSmsCommandCandidate("  done  ")).toBe(true);
    expect(isSmsCommandCandidate("DONE task one")).toBe(false);
    expect(isSmsCommandCandidate("hello")).toBe(false);
  });

  test("scopes inbound idempotency to provider account and message", () => {
    expect(
      smsInboundProviderEventKey({
        provider: "twilio",
        providerAccountId: "AC123",
        providerMessageId: "SM123",
        source: "+14155551234",
        destination: "+14155559999",
      }),
    ).toBe("twilio:inbound:AC123:SM123");
  });

  test("refuses an event key without durable provider identity", () => {
    expect(() =>
      smsInboundProviderEventKey({
        provider: "twilio",
        providerAccountId: "",
        providerMessageId: "SM123",
        source: "+14155551234",
        destination: "+14155559999",
      }),
    ).toThrow("provider account and message identifiers");
  });

  test("scopes a tenant user's verified phone to the shared destination and program", () => {
    expect(
      smsVerifiedPreferenceScope(
        {
          provider: "twilio",
          providerAccountId: "AC123",
          providerMessageId: "SM123",
          source: "+14155551234",
          destination: "+14155559999",
        },
        "destination-id",
        "ai_matrx_owner_beta",
      ),
    ).toEqual({
      phoneNumber: "+14155551234",
      destinationIdentityId: "destination-id",
      programKey: "ai_matrx_owner_beta",
    });
  });

  test("fails closed when the same phone has multiple explicit bindings", () => {
    expect(selectSingleSmsPreferenceBinding([{ id: "one" }, { id: "two" }])).toEqual({
      status: "ambiguous",
      candidateCount: 2,
    });
  });

  test("resolves exactly one explicit binding", () => {
    expect(selectSingleSmsPreferenceBinding([{ id: "one" }])).toEqual({
      status: "resolved",
      value: { id: "one" },
    });
  });
});
