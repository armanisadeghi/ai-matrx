import { stripControlLines } from "./stripControlLines";

/**
 * Forcing function for jobs-bar-2026-09-16, item 10: a live Vision Interview
 * transcript printed the primary voice's machine self-rating into the expert's
 * own reading pane. Every case here fails against the unfiltered text.
 */
describe("stripControlLines", () => {
  it("removes a declared control line from a persisted turn", () => {
    const turn =
      "Does the intake technician select from a strict, finite list?\n\nWRAP_RATING: 4";
    expect(stripControlLines(turn)).toBe(
      "Does the intake technician select from a strict, finite list?",
    );
  });

  it("removes it wherever it sits, and leaves no blank gap", () => {
    const turn = "First line.\nWRAP_RATING: 5\nSecond line.";
    expect(stripControlLines(turn)).toBe("First line.\nSecond line.");
  });

  it("survives the markdown decorations a model adds", () => {
    expect(stripControlLines("Body.\n> WRAP_RATING: 2")).toBe("Body.");
    expect(stripControlLines("Body.\n**USED: a,b")).toBe("Body.");
  });

  it("never touches prose that merely mentions a token", () => {
    const prose = "We raised the WRAP_RATING: it is not a number you type.";
    expect(stripControlLines(prose)).toBe(prose);
  });

  it("leaves ordinary text byte-for-byte alone", () => {
    const prose = "Route every pallet.\n\n- shred\n- refurbish";
    expect(stripControlLines(prose)).toBe(prose);
  });
});
