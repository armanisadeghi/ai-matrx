/**
 * A NAME WITH A DOT KEEPS IT (lane DRILL-CLOSE-2): provider "Z.ai" read "Z ai" because the plain-words
 * rule split every letter-dot-letter. Dots separate words only in a declared code (`code: true`).
 * Red on HEAD: "Z.ai" -> "Z ai".
 */
import { drillDimensionLabelFor, plainWords } from "../dimensionWords";

describe("a dot in a display name", () => {
  it("stays in a name and in a number", () => {
    expect(plainWords("Z.ai")).toBe("Z.ai");
    expect(plainWords("Gemini 2.5")).toBe("Gemini 2.5");
  });
  it("a provider choice dimension with no declared label reads as written", () => {
    const provider = drillDimensionLabelFor({ key: "provider", label: "Provider", from: "provider", kind: "choice" } as never, { names: undefined })!;
    expect(provider("Z.ai")).toBe("Z.ai");
  });
  it("a code-shaped dimension without a registry label still splits its dots", () => {
    const feature = drillDimensionLabelFor({ key: "feature", label: "Feature", from: "feature", kind: "choice", code_shaped: true } as never, { names: undefined })!;
    expect(feature("news.coarse_relevance")).toBe("News coarse relevance");
  });
  it("a declared code still becomes words (by the registry label, else by splitting the code)", () => {
    const feature = drillDimensionLabelFor(
      { key: "feature", label: "Feature", from: "feature", kind: "choice", choices: [{ value: "news.coarse_relevance", label: "News relevance screen" }] } as never,
      { names: undefined },
    )!;
    expect(feature("news.coarse_relevance")).toBe("News relevance screen");
    expect(plainWords("news.coarse_relevance", { code: true })).toBe("News coarse relevance");
  });
});
