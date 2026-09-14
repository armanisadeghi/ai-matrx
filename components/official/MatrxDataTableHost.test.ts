import { tableDensityFromKnob } from "./MatrxDataTableHost";

describe("tableDensityFromKnob", () => {
  it.each(["condensed", "normal", "spacious"] as const)(
    "keeps the registered %s density",
    (density) => {
      expect(tableDensityFromKnob(density)).toBe(density);
    },
  );

  it("uses normal while the canonical scoped value is unresolved or invalid", () => {
    expect(tableDensityFromKnob(undefined)).toBe("normal");
    expect(tableDensityFromKnob("comfortable")).toBe("normal");
  });
});
