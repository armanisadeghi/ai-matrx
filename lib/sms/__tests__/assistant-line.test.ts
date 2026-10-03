import {
  assistantBindingTargets,
  bindingMatchesTargets,
  successorDestinationId,
} from "@/lib/sms/assistant-line";

// The live shape on 2026-10-03 (Lane BC): the old staff number's row names the
// new one as its successor, and every enrolled person is bound to the new row.
const OLD = {
  id: "9de3f283-e4cc-4a6f-963c-b8cec9fff279",
  program_key: "ai_matrx_owner_beta",
  metadata: { succeeded_by: "f4e64c95-eef2-420c-8dfd-0e273428c9d2" },
};
const NEW = {
  id: "f4e64c95-eef2-420c-8dfd-0e273428c9d2",
  program_key: "ai_matrx_personal_staff",
  metadata: {},
};
const boundToNew = {
  assistant_destination_id: NEW.id,
  assistant_program_key: NEW.program_key,
};
const boundToOld = {
  assistant_destination_id: OLD.id,
  assistant_program_key: OLD.program_key,
};

describe("a retired staff number keeps answering its people", () => {
  test("the old number answers a person bound to its successor", () => {
    const targets = assistantBindingTargets(OLD, NEW);
    expect(bindingMatchesTargets(boundToNew, targets)).toBe(true);
    expect(bindingMatchesTargets(boundToOld, targets)).toBe(true);
  });

  test("the new number answers its own people and nobody else's", () => {
    const targets = assistantBindingTargets(NEW, null);
    expect(bindingMatchesTargets(boundToNew, targets)).toBe(true);
    expect(bindingMatchesTargets(boundToOld, targets)).toBe(false);
  });

  test("a binding must carry the bound row's own program", () => {
    const targets = assistantBindingTargets(OLD, NEW);
    expect(
      bindingMatchesTargets(
        { assistant_destination_id: NEW.id, assistant_program_key: OLD.program_key },
        targets,
      ),
    ).toBe(false);
  });

  test("a successor row that is not the named one never widens the match", () => {
    const stranger = { id: "00000000-0000-4000-8000-000000000001", program_key: "x" };
    expect(assistantBindingTargets(OLD, stranger)).toHaveLength(1);
    expect(assistantBindingTargets(OLD, null)).toHaveLength(1);
  });

  test("only a non-empty string names a successor", () => {
    expect(successorDestinationId(OLD.metadata)).toBe(NEW.id);
    expect(successorDestinationId({})).toBeNull();
    expect(successorDestinationId(null)).toBeNull();
    expect(successorDestinationId({ succeeded_by: " " })).toBeNull();
    expect(successorDestinationId(["x"])).toBeNull();
  });
});
