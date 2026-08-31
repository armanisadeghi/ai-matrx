/**
 * THE DEAD SELECT (Arman, live, 2026-08-31) — the guard.
 *
 * The pre-fix editor computed `agentId && builtinAgentsById.has(agentId) ?
 * agentId : null` and rendered THAT. When the catalogue had not loaded — its
 * normal state until `fetchAgentsListFull()` lands — every pick was silently
 * discarded: the trigger reverted to "Select a system agent" and Save said
 * "Choose a system agent before saving this mandate", blaming the admin for a
 * list that had not arrived.
 *
 * Each case below FAILS against that behaviour: it had exactly one message for
 * two different situations, and no message at all on screen.
 */

import { mandatePinRefusal } from "@/features/mandates/admin/pin-refusal";

const base = {
  agentId: "37341b98-84ce-4512-9501-670f20dfa678",
  pickedName: "Agent Goal Writer",
  catalogueLoaded: true,
  pickedIsSystem: true,
};

describe("mandatePinRefusal", () => {
  it("does not refuse a system agent — the save proceeds", () => {
    expect(mandatePinRefusal(base)).toBeNull();
  });

  it("does not call an empty form a refusal", () => {
    expect(
      mandatePinRefusal({ ...base, agentId: null, pickedIsSystem: false }),
    ).toBeNull();
  });

  it("says the catalogue is still loading — never that the pick is wrong", () => {
    const message = mandatePinRefusal({
      ...base,
      catalogueLoaded: false,
      pickedIsSystem: false,
    });
    expect(message).toContain("has not loaded yet");
    expect(message).toContain("try Save again");
    // THE ORIGINAL DEFECT: blaming the admin for a load that had not finished.
    expect(message).not.toContain("is not a system agent");
  });

  it("names the agent AND the remedy when the pick genuinely is not a system agent", () => {
    const message = mandatePinRefusal({
      ...base,
      pickedIsSystem: false,
    });
    expect(message).toContain("Agent Goal Writer");
    expect(message).toContain("is not a system agent");
    expect(message).toContain("Duplicate & customize");
  });

  it("still produces words when nothing knows the agent's name", () => {
    const message = mandatePinRefusal({
      ...base,
      pickedName: null,
      pickedIsSystem: false,
    });
    expect(message).toContain("That agent");
    expect(message).toContain("Duplicate & customize");
  });
});
