/**
 * Owner-authoring pure contracts. Browser/RLS writes are integration-verified;
 * these tests pin the non-destructive metadata merge used by every profile
 * save so unrelated system metadata can never be clobbered by the editor.
 */

import { mergeEditableShapeMetadata } from "../studio/shape-authoring-service";

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
