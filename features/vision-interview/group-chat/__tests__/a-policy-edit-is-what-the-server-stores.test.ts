/**
 * The inspector's controls read and write the server's ViewPolicy exactly
 * (aidream `group_chat.models.ViewPolicy`, strict — invalid is a 422, never
 * clamped). `{}` reads as the server's defaults; every control round-trips;
 * a choice the server would refuse is named before it is sent.
 *
 * Use case: the clinic no-show interview — the creator makes the Adversary
 * blind to the room, then lets it see only the Architect from round 6.
 */
import { policyProblem, readPolicy, writePolicy, participantName } from "../policy";

const GROUP = ["sounding_board", "amplifier", "cartographer", "archaeologist", "adversary", "architect"];

it("{} reads as the server's defaults: sees everyone, by name, every turn, 12k", () => {
  expect(readPolicy({})).toEqual({
    sees: "everyone",
    seesKeys: [],
    labels: "named",
    reveal: "always",
    revealRounds: null,
    cadence: "person",
    cadenceRounds: null,
    budgetChars: 12_000,
  });
});

it("the stored Adversary policy round-trips through the controls", () => {
  const stored = { sees: "everyone", labels: "named", reveal: { after_round: 6 }, cadence: "person", budget_chars: 12000 } as const;
  expect(writePolicy(readPolicy(stored))).toEqual(stored);
});

it("sees: none, only and except write the server's shapes", () => {
  const base = readPolicy({});
  expect(writePolicy({ ...base, sees: "none" }).sees).toBe("none");
  expect(writePolicy({ ...base, sees: "only", seesKeys: ["architect", "person"] }).sees).toEqual({ only: ["architect", "person"] });
  expect(writePolicy({ ...base, sees: "except", seesKeys: ["amplifier"] }).sees).toEqual({ except: ["amplifier"] });
  expect(readPolicy({ sees: { except: ["amplifier"] } })).toMatchObject({ sees: "except", seesKeys: ["amplifier"] });
});

it("reveal and cadence carry their round counts", () => {
  const base = readPolicy({});
  expect(writePolicy({ ...base, reveal: "every_rounds", revealRounds: 3 }).reveal).toEqual({ every_rounds: 3 });
  expect(writePolicy({ ...base, cadence: "every_rounds", cadenceRounds: 2 }).cadence).toEqual({ every_rounds: 2 });
  expect(readPolicy({ cadence: { every_rounds: 2 } })).toMatchObject({ cadence: "every_rounds", cadenceRounds: 2 });
});

it("names what the server would refuse, before it is sent", () => {
  const base = readPolicy({});
  expect(policyProblem(base, GROUP)).toBeNull();
  expect(policyProblem({ ...base, sees: "only", seesKeys: [] }, GROUP)).toBe("Pick who");
  expect(policyProblem({ ...base, sees: "only", seesKeys: ["scribe"] }, GROUP)).toBe("Not in this group");
  expect(policyProblem({ ...base, sees: "only", seesKeys: ["person"] }, GROUP)).toBeNull();
  expect(policyProblem({ ...base, reveal: "after_round", revealRounds: 0 }, GROUP)).toBe("Rounds 1–10000");
  expect(policyProblem({ ...base, cadence: "every_rounds", cadenceRounds: null }, GROUP)).toBe("Rounds 1–10000");
  expect(policyProblem({ ...base, budgetChars: 999 }, GROUP)).toBe("Budget 1k–48k");
  expect(policyProblem({ ...base, budgetChars: 48_001 }, GROUP)).toBe("Budget 1k–48k");
  expect(policyProblem({ ...base, budgetChars: 48_000 }, GROUP)).toBeNull();
});

it("a participant's name carries its instance", () => {
  expect(participantName({ label: "Adversary", instance_label: null })).toBe("Adversary");
  expect(participantName({ label: "Adversary", instance_label: "full view" })).toBe("Adversary · full view");
});
