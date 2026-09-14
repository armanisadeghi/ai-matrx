import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { educationFastfireManifest } from "./education-fastfire.manifest";

describe("FastFire fixed mandate disclosure", () => {
  it("exposes every fixed FastFire mandate exactly once without a default agent", () => {
    const roles = educationFastfireManifest.agentRoles ?? [];
    const disclosedMandates = roles.map((role) => role.mandateKey);

    expect(disclosedMandates).toEqual([
      MANDATE_KEYS.flashcards__grade_spoken,
      MANDATE_KEYS.flashcards__spoken_front_tts,
      MANDATE_KEYS.flashcards__helper_tts,
    ]);
    expect(new Set(disclosedMandates).size).toBe(3);
    expect(roles.every((role) => role.defaultAgentId === null)).toBe(true);
  });
});
