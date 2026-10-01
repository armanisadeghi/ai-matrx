/**
 * The progress line never shows a count past what the person asked for, and
 * never says "your sources" (copy law R9; V5-A).
 */
import { cardProgressLine } from "./cardProgressLine";

describe("cardProgressLine", () => {
  it("caps the ready count at the request", () => {
    expect(cardProgressLine({ done: 3, total: 4, label: "Part 3", items: 9 }, 5)).toBe("Making 5 cards — 5 ready");
    expect(cardProgressLine({ done: 1, total: 4, label: "Part 1", items: 2 }, 5, "new cards")).toBe(
      "Making 5 new cards — 2 ready",
    );
  });
  it("is absent for a single-pass run", () => {
    expect(cardProgressLine({ done: 0, total: 1, label: "", items: 0 }, 5)).toBeNull();
    expect(cardProgressLine(null, 5)).toBeNull();
  });
});
