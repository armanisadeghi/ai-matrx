import {
  createResourceReference,
  promoteResource,
  suppressResourceRepresentations,
} from "./resource-reference";
import {
  buildCustomComponent,
  extractEffectiveValues,
} from "@/features/agents/utils/variable-customcomponent";

describe("agent resource reference", () => {
  it("keeps the default reference minimal", () => {
    expect(createResourceReference("file", "file-1")).toEqual({
      __kind: "resource_ref",
      resource_type: "file",
      resource_id: "file-1",
    });
  });

  it("adds bounded promotion and deduplicated suppression", () => {
    const promoted = promoteResource(
      createResourceReference("file", "file-1"),
      "clean",
      5_000,
    );
    expect(
      suppressResourceRepresentations(promoted, "RAW", "rag", "raw"),
    ).toEqual({
      __kind: "resource_ref",
      resource_type: "file",
      resource_id: "file-1",
      promote: [{ representation: "clean", max_chars: 5_000 }],
      exclude: ["raw", "rag"],
    });
  });

  it("preserves media-variable promotion and suppression config", () => {
    const component = buildCustomComponent({
      type: "document",
      resourceContext: {
        promote: [{ representation: "clean", max_chars: 5_000 }],
        exclude: ["raw", "rag"],
      },
    });
    expect(component?.resource_context).toEqual({
      promote: [{ representation: "clean", max_chars: 5_000 }],
      exclude: ["raw", "rag"],
    });
    expect(extractEffectiveValues(component).resourceContext).toEqual(
      component?.resource_context,
    );
  });
});
