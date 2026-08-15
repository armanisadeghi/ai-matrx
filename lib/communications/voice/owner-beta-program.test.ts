/** @jest-environment node */

import {
  evaluateVoiceOwnerBetaAdmission,
  voiceOwnerBetaProgramSnapshot,
} from "@/lib/communications/voice/owner-beta-program";

const destination = {
  id: "destination-1",
  phone_number: "+14155550100",
  provider: "twilio",
  provider_account_id: "AC-approved",
  program_key: "ai_matrx_owner_beta",
};

const verifiedCaller = {
  organization_id: "organization-1",
  phone_number: "+14155550101",
  user_id: "user-1",
};

const call = {
  provider: "twilio" as const,
  providerAccountId: "AC-approved",
  providerCallId: "CA-call",
  callerNumber: "+14155550101",
  calledNumber: "+14155550100",
  direction: "inbound",
};

describe("owner Voice beta program", () => {
  test("admits only the exact approved account, number, and verified caller", () => {
    expect(
      evaluateVoiceOwnerBetaAdmission(call, {
        destinations: [destination],
        verifiedCallers: [verifiedCaller],
      }),
    ).toEqual({
      status: "authorized",
      programKey: "ai_matrx_owner_beta",
      destinationId: "destination-1",
      organizationId: "organization-1",
      userId: "user-1",
    });
  });

  test.each([
    [
      "wrong provider account",
      { ...call, providerAccountId: "AC-other" },
      "provider_account_mismatch",
    ],
    [
      "wrong called number",
      { ...call, calledNumber: "+14155550999" },
      "called_number_mismatch",
    ],
    [
      "wrong caller",
      { ...call, callerNumber: "+14155550888" },
      "caller_not_verified",
    ],
    [
      "outbound direction",
      { ...call, direction: "outbound-api" },
      "direction_not_inbound",
    ],
  ])("rejects %s", (_label, attemptedCall, reason) => {
    expect(
      evaluateVoiceOwnerBetaAdmission(attemptedCall, {
        destinations: [destination],
        verifiedCallers: [verifiedCaller],
      }),
    ).toEqual({ status: "denied", reason });
  });

  test("fails closed on missing or ambiguous canonical bindings", () => {
    expect(
      evaluateVoiceOwnerBetaAdmission(call, {
        destinations: [],
        verifiedCallers: [],
      }),
    ).toEqual({ status: "denied", reason: "program_not_bound" });
    expect(
      evaluateVoiceOwnerBetaAdmission(call, {
        destinations: [destination, { ...destination, id: "destination-2" }],
        verifiedCallers: [],
      }),
    ).toEqual({ status: "denied", reason: "program_binding_ambiguous" });
    expect(
      evaluateVoiceOwnerBetaAdmission(call, {
        destinations: [destination],
        verifiedCallers: [verifiedCaller, { ...verifiedCaller, user_id: "user-2" }],
      }),
    ).toEqual({ status: "denied", reason: "caller_binding_ambiguous" });
  });

  test("publishes only secret-free binding readiness", () => {
    expect(
      voiceOwnerBetaProgramSnapshot({
        destinations: [destination],
        verifiedCallers: [verifiedCaller],
      }),
    ).toEqual({
      ready: true,
      programKey: "ai_matrx_owner_beta",
      destinationBinding: "exact",
      verifiedCallerBinding: "exact",
    });
  });
});
