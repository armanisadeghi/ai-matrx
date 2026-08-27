/**
 * Owner-authoring pure contracts. Browser/RLS writes are integration-verified;
 * these tests pin the non-destructive metadata merge used by every profile
 * save so unrelated system metadata can never be clobbered by the editor.
 */

import {
  mergeEditableShapeMetadata,
  planShapeComponentDefaultSwitch,
  type ShapeComponentCandidate,
} from "../studio/shape-authoring-service";

describe("mergeEditableShapeMetadata", () => {
  it("updates authorable keys while preserving unrelated metadata", () => {
    expect(
      mergeEditableShapeMetadata(
        {
          source: "schema_proposal",
          user_authored: true,
          nested: { keep: "me" },
          title_key: "old_title",
        },
        { titleKey: "name", loadingComponent: "card" },
      ),
    ).toEqual({
      source: "schema_proposal",
      user_authored: true,
      nested: { keep: "me" },
      title_key: "name",
      loading_component: "card",
    });
  });

  it("trims values and removes only keys explicitly cleared", () => {
    expect(
      mergeEditableShapeMetadata(
        {
          source: "schema_proposal",
          title_key: "title",
          loading_component: "table",
        },
        { titleKey: "  display_name  ", loadingComponent: "   " },
      ),
    ).toEqual({
      source: "schema_proposal",
      title_key: "display_name",
    });
  });

  it("recovers loudly-safe from malformed non-object metadata", () => {
    expect(
      mergeEditableShapeMetadata(["legacy"], {
        titleKey: "title",
        loadingComponent: null,
      }),
    ).toEqual({ title_key: "title" });
  });
});

describe("planShapeComponentDefaultSwitch — exactly-one-default invariant", () => {
  const rows: ShapeComponentCandidate[] = [
    {
      id: "generic-row",
      platform: "web",
      role: "output",
      componentKey: "generic_structured",
      source: "bundled",
      isActive: true,
      isDefault: false,
    },
    {
      id: "old-default",
      platform: "web",
      role: "output",
      componentKey: "old_component",
      source: "db",
      isActive: true,
      isDefault: true,
    },
    {
      id: "new-target",
      platform: "web",
      role: "output",
      componentKey: "new_component",
      source: "db",
      isActive: true,
      isDefault: false,
    },
    // Different role — must never be touched by an "output" switch.
    {
      id: "input-default",
      platform: "web",
      role: "input",
      componentKey: "some_input",
      source: "db",
      isActive: true,
      isDefault: true,
    },
  ];

  it("clears the current default and sets the target, scoped to (platform, role)", () => {
    expect(planShapeComponentDefaultSwitch(rows, "new-target")).toEqual({
      clearIds: ["old-default"],
      setId: "new-target",
    });
  });

  it("is a no-op clear when the target is already the default", () => {
    expect(planShapeComponentDefaultSwitch(rows, "old-default")).toEqual({
      clearIds: [],
      setId: "old-default",
    });
  });

  it("clears every other default when more than one row wrongly carries the flag", () => {
    const dirty: ShapeComponentCandidate[] = [
      ...rows.slice(0, 2),
      { ...rows[2], isDefault: true },
    ];
    expect(planShapeComponentDefaultSwitch(dirty, "generic-row")).toEqual({
      clearIds: ["old-default", "new-target"],
      setId: "generic-row",
    });
  });

  it("throws when the target id is not among the candidate rows", () => {
    expect(() => planShapeComponentDefaultSwitch(rows, "missing")).toThrow(
      /not one of this Shape's registered components/,
    );
  });
});
