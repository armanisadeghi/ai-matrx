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
  phone_number: "+14155550101",
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
        verifiedCallers: [verifiedCaller, { ...verifiedCaller }],
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
      verifiedCallerBinding: "enrolled",
    });
  });
  // ── Enrolling a second person must not take voice down (ruling 5) ────────
  //
  // Real case: the owner is enrolled and calling works. We enroll a second
  // person for a demo — a second operator on the same program number. Under
  // the old rule the admission read up to two enrollment rows for the
  // destination and denied unless there was exactly ONE in the whole system,
  // so the second enrollment refused EVERY call, the owner's included. The
  // first demo would have taken his own line down.
  //
  // `verifiedCallers` now carries only the rows for the number that is
  // calling, so these are what the admission actually sees.

  const secondOperator = { phone_number: "+14155550102" };
  const secondOperatorCall = { ...call, callerNumber: "+14155550102" };

  test("both enrolled people are admitted; a second enrollment takes nobody down", () => {
    // The owner calls. Only HIS enrollment is in the candidate set.
    expect(
      evaluateVoiceOwnerBetaAdmission(call, {
        destinations: [destination],
        verifiedCallers: [verifiedCaller],
      }),
    ).toEqual({
      status: "authorized",
      programKey: "ai_matrx_owner_beta",
      destinationId: "destination-1",
    });

    // The second operator calls. Only THEIR enrollment is in the set.
    expect(
      evaluateVoiceOwnerBetaAdmission(secondOperatorCall, {
        destinations: [destination],
        verifiedCallers: [secondOperator],
      }),
    ).toEqual({
      status: "authorized",
      programKey: "ai_matrx_owner_beta",
      destinationId: "destination-1",
    });
  });

  test("a stranger is still refused, however many people are enrolled", () => {
    const stranger = { ...call, callerNumber: "+14155559999" };
    expect(
      evaluateVoiceOwnerBetaAdmission(stranger, {
        destinations: [destination],
        // Nobody's enrollment matches that number.
        verifiedCallers: [],
      }),
    ).toEqual({ status: "denied", reason: "caller_not_verified" });
  });

  test("two accounts claiming one number is a real ambiguity and is refused", () => {
    // This is what "exactly one" is FOR: not "one person on the program", but
    // "this number belongs to one account". Guessing which is never right.
    expect(
      evaluateVoiceOwnerBetaAdmission(call, {
        destinations: [destination],
        verifiedCallers: [verifiedCaller, { phone_number: "+14155550101" }],
      }),
    ).toEqual({ status: "denied", reason: "caller_binding_ambiguous" });
  });

  test("the program stays READY once a second person enrolls", () => {
    // The readiness snapshot used to run the caller count through the same
    // exactly-one rule, so the program reported NOT READY because the beta
    // grew — a status screen that turns red on success.
    expect(
      voiceOwnerBetaProgramSnapshot({
        destinations: [destination],
        verifiedCallers: [verifiedCaller, secondOperator],
      }),
    ).toEqual({
      ready: true,
      programKey: "ai_matrx_owner_beta",
      destinationBinding: "exact",
      verifiedCallerBinding: "enrolled",
    });
  });

});
