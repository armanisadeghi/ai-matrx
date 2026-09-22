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

/**
 * The system destination edits the PLATFORM DEFAULT, not an override. Read as
 * an override every admin row on /administration/users/limits opened with no
 * value — the box then printed the em dash a sentence uses for "nothing", so
 * clicking a field and typing 9 sent "—9" and the save refused. Found walking
 * the register during the 2026-09-22 independent review.
 */
describe("system knob values", () => {
  const systemKnob = {
    effective_value: 8,
    platform_default: 8,
    org_override: null,
  } as unknown as ScopedKnob;

  it("starts a system draft from the platform default, never from an empty override", () => {
    expect(
      editableKnobValue("organization", undefined, systemKnob, undefined, true),
    ).toBe(8);
  });

  it.each([false, 0])("keeps a falsy platform default %p rather than blanking it", (value) => {
    expect(
      editableKnobValue(
        "organization",
        undefined,
        { ...systemKnob, platform_default: value } as unknown as ScopedKnob,
        undefined,
        true,
      ),
    ).toBe(value);
  });

  it("leaves every other destination reading its override exactly as before", () => {
    expect(
      editableKnobValue("organization", undefined, systemKnob, "org-value"),
    ).toBe("org-value");
  });
});
