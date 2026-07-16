import { computeTextCounterMetrics, normalizeCounterText } from "../textCounterMetrics";

describe("computeTextCounterMetrics", () => {
  it("counts visible Unicode graphemes separately from UTF-16 characters", () => {
    const metrics = computeTextCounterMetrics("Hi 👨‍👩‍👧‍👦!");

    expect(metrics.graphemes).toBe(5);
    expect(metrics.characters).toBeGreaterThan(metrics.graphemes);
    expect(metrics.words).toBe(1);
  });

  it("reports useful writing and keyword metrics", () => {
    const metrics = computeTextCounterMetrics(
      "Matrx makes work simple. Matrx makes teams faster!",
    );

    expect(metrics.sentences).toBe(2);
    expect(metrics.paragraphs).toBe(1);
    expect(metrics.keywordDensity).toEqual(
      expect.arrayContaining([expect.objectContaining({ word: "matrx", count: 2 })]),
    );
  });
});

describe("normalizeCounterText", () => {
  it("normalizes line endings and accidental spacing without changing content", () => {
    expect(normalizeCounterText("  One   two \r\n\r\n\r\n Three  ")).toBe("One two\n\nThree");
  });
});
