/**
 * The inline (collapsed) variable row is a one-line text box for every typed
 * variable — free typing is the point of this view; the real component lives
 * behind the chevron. See the header of collapsed-row.ts (Arman, 2026-09-27).
 */

import { collapsedRowKind } from "../collapsed-row";

describe("collapsedRowKind", () => {
  it("every typed variable is a one-line text box, choice types included", () => {
    for (const customComponent of [
      undefined,
      { type: "textarea" },
      { type: "url" },
      { type: "select", options: ["low", "medium", "high", "critical"] },
      { type: "radio", options: ["a very detailed", "a well-structured table"] },
      { type: "checkbox", options: ["a", "b"] },
      { type: "buttons", options: ["a", "b"] },
      { type: "selection-list", options: ["a", "b"] },
      { type: "pill-toggle", options: ["a", "b"] },
      { type: "toggle" },
      { type: "number" },
      { type: "slider" },
      { type: "datetime" },
      { type: "color" },
    ] as const) {
      expect(collapsedRowKind(customComponent)).toBe("text-line");
    }
  });

  it("values that cannot be typed open the editor", () => {
    expect(collapsedRowKind({ type: "image" })).toBe("open-editor");
    expect(collapsedRowKind({ type: "document" })).toBe("open-editor");
    expect(
      collapsedRowKind({ type: "select", options: ["a"] }, { picklistBound: true }),
    ).toBe("open-editor");
  });
});
