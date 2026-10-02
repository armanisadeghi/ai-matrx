import { persistableVariableDefinitions } from "../variable-binding";

describe("persistableVariableDefinitions — an empty 'Fill automatically' is a draft", () => {
  it("drops an empty binding and keeps the variable", () => {
    expect(
      persistableVariableDefinitions([
        {
          name: "a",
          defaultValue: "",
          binding: { contextItemId: "", scopeTypeId: "", itemKey: "", onMissing: "empty" },
        },
        {
          name: "b",
          defaultValue: "",
          binding: {
            kind: "merge_field",
            source: "record",
            semantic_type: "collection",
            table_id: "",
            missing: "absent",
            override_policy: "shown_locked",
          },
        },
      ]),
    ).toEqual([
      { name: "a", defaultValue: "" },
      { name: "b", defaultValue: "" },
    ]);
  });

  it("keeps a real binding untouched", () => {
    const real = {
      name: "c",
      defaultValue: "",
      binding: { contextItemId: "i", scopeTypeId: "s", itemKey: "k" },
    };
    expect(persistableVariableDefinitions([real])).toEqual([real]);
  });
});
