import { looksNotNumeric } from "./model";
describe("looksNotNumeric", () => {
  it("offers on letters, stays quiet on numbers and empty", () => {
    expect(looksNotNumeric("number", "abc")).toBe(true);
    expect(looksNotNumeric("number", "12x3")).toBe(true);
    expect(looksNotNumeric("number", "1,234.50")).toBe(false);
    expect(looksNotNumeric("number", "-7")).toBe(false);
    expect(looksNotNumeric("number", "")).toBe(false);
    expect(looksNotNumeric("text", "abc")).toBe(false);
  });
});
