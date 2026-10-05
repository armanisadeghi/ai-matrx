import { findDocumentPassage, headingLabel } from "../documentPassage";

const body = [
  "# Enzyme kinetics",
  "Intro paragraph about enzymes.",
  "",
  "## Mechanism",
  "Catalysis proceeds in steps.",
  "",
  "### Substrate binding",
  "The substrate docks in the active site through weak interactions.",
  "A second sentence on the next line.",
  "",
  "## References",
  "Smith 2020.",
].join("\n");

describe("findDocumentPassage", () => {
  it("names the section above the quoted words", () => {
    const p = findDocumentPassage(body, "The substrate docks in the active site through weak interactions.");
    expect(p?.headings).toEqual(["Enzyme kinetics", "Mechanism", "Substrate binding"]);
    expect(p?.startLine).toBe(7);
    expect(headingLabel(p!.headings)).toBe("Mechanism › Substrate binding");
  });
  it("tolerates a quote that drifts after its opening words", () => {
    const p = findDocumentPassage(body, "The substrate docks in the active site, then something else entirely.");
    expect(p?.startLine).toBe(7);
  });
  it("is null (no guess) when the words are not in the body", () => {
    expect(findDocumentPassage(body, "Completely unrelated sentence about nothing here")).toBeNull();
    expect(findDocumentPassage(body, "")).toBeNull();
  });
  it("a lone title names no section", () => {
    expect(headingLabel(["Enzyme kinetics"])).toBe("Enzyme kinetics");
  });
});
