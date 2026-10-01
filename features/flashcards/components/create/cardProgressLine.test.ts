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
  it("shows a slow part being retried and a missed part as state, never a frozen line", () => {
    expect(cardProgressLine({ done: 0, total: 4, label: "", items: 0 }, 4)).toBe("Making 4 cards — 0 ready");
    expect(cardProgressLine({ done: 2, total: 4, label: "", items: 2, retrying: 1 }, 4)).toBe(
      "Making 4 cards — 2 ready · retrying 1 part",
    );
    expect(cardProgressLine({ done: 4, total: 4, label: "", items: 3, failed: 1 }, 4)).toBe(
      "Making 4 cards — 3 ready · 1 part missed",
    );
    for (const p of [
      { done: 1, total: 40, label: "", items: 49, retrying: 12 },
      { done: 40, total: 40, label: "", items: 38, failed: 12 },
    ]) {
      expect((cardProgressLine(p, 50, "new cards") ?? "").length).toBeLessThanOrEqual(60);
    }
  });
});
