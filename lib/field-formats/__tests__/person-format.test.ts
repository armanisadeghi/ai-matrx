import { FIELD_FORMATS } from "@ai-matrx/design-system/field-formats";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";
import { isChoiceFormat, isPersonFormat, withResolvedChoices } from "../choices";

/** A "Owner" column on a project table: the person responsible, picked from the team. */
describe("person format", () => {
  const members = [
    { value: "8d1f…a1", label: "Emily Parson" },
    { value: "3c9e…b2", label: "Armani Sadeghi" },
  ];

  it("is a choice format whose options come from outside the field", () => {
    expect(isChoiceFormat("person")).toBe(true);
    expect(isPersonFormat("person")).toBe(true);
    expect(isPersonFormat("choice")).toBe(false);
  });

  it("shows the member's name once the members are resolved, and the raw id before", () => {
    const format: FieldFormatConfig = { id: "person" };
    expect(FIELD_FORMATS.person.format("8d1f…a1", {})).toBe("8d1f…a1");
    const resolved = withResolvedChoices(format, members);
    expect(FIELD_FORMATS.person.format("8d1f…a1", resolved.options ?? {})).toBe("Emily Parson");
    // An id that is not a member is a MISMATCH (null), not silently shown.
    expect(FIELD_FORMATS.person.format("nobody", resolved.options ?? {})).toBeNull();
  });
});
