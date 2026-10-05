import { finishReasonOf, hitOutputLimit } from "../latestTurn";

describe("a reply cut at the output limit says so", () => {
  it("reads the stored finish reason", () => {
    expect(finishReasonOf({ finish_reason: "length", provider_iteration: 1 })).toBe("length");
    expect(finishReasonOf({})).toBeNull();
    expect(finishReasonOf(null)).toBeNull();
  });
  it("names only the ceiling stops as truncation", () => {
    expect(hitOutputLimit("length")).toBe(true);
    expect(hitOutputLimit("max_tokens")).toBe(true);
    expect(hitOutputLimit("stop")).toBe(false);
    expect(hitOutputLimit(null)).toBe(false);
  });
});
