import {
  normalizeSmsEndpoint,
  smsInboundProviderEventKey,
  smsVerifiedPreferenceScope,
} from "@/lib/sms/identity";

describe("SMS identity contract", () => {
  test("normalizes endpoints through the canonical CRM normalizer", () => {
    expect(normalizeSmsEndpoint("(415) 555-1234")).toBe("+14155551234");
    expect(normalizeSmsEndpoint("+44 20 7946 0958")).toBe("+442079460958");
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

  test("scopes verified phone identity to the destination tenant", () => {
    expect(
      smsVerifiedPreferenceScope(
        {
          provider: "twilio",
          providerAccountId: "AC123",
          providerMessageId: "SM123",
          source: "+14155551234",
          destination: "+14155559999",
        },
        "org-destination",
      ),
    ).toEqual({
      phoneNumber: "+14155551234",
      organizationId: "org-destination",
    });
  });
});
