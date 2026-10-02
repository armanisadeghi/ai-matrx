import {
  hasRandomOptionSource,
  isAutoAssignValue,
  RANDOM_AUTO_ASSIGN_VALUE,
  supportsRandomAssignment,
} from "../auto-assignment";

describe("auto assignment", () => {
  it("uses an exact collision-safe marker", () => {
    expect(isAutoAssignValue(RANDOM_AUTO_ASSIGN_VALUE)).toBe(true);
    expect(
      isAutoAssignValue({
        type: "auto_assign",
        strategy: "random",
        listId: "forged",
      }),
    ).toBe(false);
    expect(isAutoAssignValue("auto_assign:random")).toBe(false);
  });

  it("requires both author opt-in and an option source", () => {
    const eligible = {
      type: "select" as const,
      options: ["one", "two"],
      assignment: { random: true },
    };
    expect(hasRandomOptionSource(eligible)).toBe(true);
    expect(supportsRandomAssignment(eligible)).toBe(true);
    expect(supportsRandomAssignment({ ...eligible, assignment: undefined })).toBe(
      false,
    );
  });

  it("accepts a structured list as the authoritative source", () => {
    expect(
      supportsRandomAssignment({
        type: "radio",
        structured_list: { listId: "list-1" },
        assignment: { random: true },
      }),
    ).toBe(true);
  });
});
