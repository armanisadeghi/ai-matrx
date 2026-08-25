import {
  analyzeShapeSample,
  buildConvertToShapeIntent,
} from "@/features/content-ir/studio/convert-to-shape";

describe("convert-to-shape preflight", () => {
  it("detects only a root __kind and suggests a readable name", () => {
    expect(analyzeShapeSample('{"__kind":"sales_summary","total":42}')).toEqual(
      {
        isValidJson: true,
        rootKind: "sales_summary",
        suggestedName: "Sales summary",
        errorMessage: null,
      },
    );

    expect(
      analyzeShapeSample('[{"__kind":"nested_item","value":1}]').rootKind,
    ).toBeNull();
  });

  it("surfaces invalid JSON instead of coercing it", () => {
    const result = analyzeShapeSample('{"broken":');
    expect(result.isValidJson).toBe(false);
    expect(result.errorMessage).toBeTruthy();
  });

  it("tells the creator to inspect an existing kind before creating", () => {
    const intent = buildConvertToShapeIntent("Sales Summary", "sales_summary");
    expect(intent).toContain('existing __kind "sales_summary"');
    expect(intent).toContain("instead of creating a duplicate");
  });
});
