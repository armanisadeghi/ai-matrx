import {
  buildCanvasItemContextValue,
  isCanvasItemContextKey,
  isCanvasItemContextValue,
} from "@/features/agents/utils/canvasItemContext";

const UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("canvasItemContext", () => {
  it("treats canvas UUIDs as context keys", () => {
    expect(isCanvasItemContextKey(UUID)).toBe(true);
    expect(isCanvasItemContextKey("artifact_1")).toBe(false);
    expect(isCanvasItemContextKey("working_document")).toBe(false);
  });

  it("builds a rich mutable value keyed by the canvas UUID", () => {
    const value = buildCanvasItemContextValue({
      artifactId: UUID,
      content: 'console.log("hi")',
      label: "Snippet",
      version: 2,
    });
    expect(value.mutable).toBe(true);
    expect(value.persist).toBe("auto");
    expect(value.source).toEqual({
      kind: "canvas_item",
      id: UUID,
      field: "content",
      base_version: 2,
    });
    expect(isCanvasItemContextValue(value)).toBe(true);
  });

  it("rejects non-UUID artifact ids", () => {
    expect(() =>
      buildCanvasItemContextValue({
        artifactId: "not-a-uuid",
        content: "x",
        label: "x",
        version: 1,
      }),
    ).toThrow(/canvas UUID/);
  });
});
