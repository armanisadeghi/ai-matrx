/** @jest-environment node */

import {
  callDisclosureTextHash,
  createCallConsentEvidence,
  isFreshCallDisclosure,
} from "@/lib/communications/voice/consent";

describe("call consent evidence", () => {
  test("builds provider-neutral affirmative evidence without disclosure text", () => {
    const evidence = createCallConsentEvidence({
      provider: "twilio",
      providerAccountId: "AC123",
      providerCallId: "CA123",
      providerEventKey: "twilio:voice-consent:AC123:CA123:v1",
      programKey: "ai_matrx_owner_beta",
      disclosureVersion: "v1",
      disclosureText: "This call may be recorded.",
      disclosedAt: "2026-08-15T18:00:00.000Z",
      responseKind: "dtmf",
      responseValue: "1",
      consentedAt: "2026-08-15T18:00:05.000Z",
      source: "twiml",
    });

    expect(evidence).toEqual({
      provider: "twilio",
      providerAccountId: "AC123",
      providerCallId: "CA123",
      providerEventKey: "twilio:voice-consent:AC123:CA123:v1",
      programKey: "ai_matrx_owner_beta",
      disclosureVersion: "v1",
      disclosureTextHash: callDisclosureTextHash(
        "This call may be recorded.",
      ),
      disclosedAt: "2026-08-15T18:00:00.000Z",
      responseKind: "dtmf",
      responseValue: "1",
      consented: true,
      consentedAt: "2026-08-15T18:00:05.000Z",
      source: "twiml",
    });
    expect(evidence).not.toHaveProperty("disclosureText");
  });

  test("rejects impossible timestamps and stale action contexts", () => {
    expect(() =>
      createCallConsentEvidence({
        provider: "twilio",
        providerAccountId: "AC123",
        providerCallId: "CA123",
        providerEventKey: "event",
        programKey: "program",
        disclosureVersion: "v1",
        disclosureText: "Disclosure",
        disclosedAt: "2026-08-15T18:00:10.000Z",
        responseKind: "speech",
        responseValue: "i agree",
        consentedAt: "2026-08-15T18:00:00.000Z",
        source: "twiml",
      }),
    ).toThrow("consentedAt cannot precede disclosedAt");

    expect(
      isFreshCallDisclosure({
        disclosedAt: "2026-08-15T18:00:00.000Z",
        now: "2026-08-15T18:04:59.000Z",
        maxAgeMs: 300_000,
      }),
    ).toBe(true);
    expect(
      isFreshCallDisclosure({
        disclosedAt: "2026-08-15T18:00:00.000Z",
        now: "2026-08-15T18:05:01.000Z",
        maxAgeMs: 300_000,
      }),
    ).toBe(false);
  });
});
