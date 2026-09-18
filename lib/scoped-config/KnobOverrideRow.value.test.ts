import { editableKnobValue, sameKnobValue } from "./KnobOverrideRow";
import type { KnobLadder } from "./ladder";
import type { ScopedKnob } from "./types";

const knob = {
  effective_value: "organization-value",
} as ScopedKnob;

const inheritedLadder = {
  value: "organization-value",
} as KnobLadder;

describe("personal knob values", () => {
  it("starts a personal draft from the resolved effective value, not its empty override", () => {
    expect(editableKnobValue("user", inheritedLadder, knob, undefined)).toBe(
      "organization-value",
    );
  });

  it.each([false, 0])("preserves the effective %p value", (value) => {
    expect(
      editableKnobValue(
        "user",
        { ...inheritedLadder, value } as KnobLadder,
        { ...knob, effective_value: value } as ScopedKnob,
        undefined,
      ),
    ).toBe(value);
  });

  it("does not treat an unchanged resolved value as a new save", () => {
    expect(sameKnobValue("organization-value", "organization-value")).toBe(
      true,
    );
    expect(sameKnobValue("organization-value", "my-value")).toBe(false);
  });
});
