import {
  STEER_MAX_CHARS,
  cardKindsLine,
  foldSteer,
  gapSections,
  questionTypesValue,
} from "../steering";

describe("foldSteer", () => {
  it("puts the person's words first, then types, sections and the do-not-repeat list", () => {
    const text = foldSteer(
      {
        instruction: "Focus on isotopes",
        cardKinds: ["cloze"],
        sections: [{ title: "Isotopes", facts: [{ statement: "Isotopes share Z", chunkIds: [] }] }],
        existing: ["What is an isotope?"],
      },
      "cards",
    );
    const order = ["Focus on isotopes", "cloze deletion", "Cover these sections first", "already exist"].map(
      (s) => text.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("- What is an isotope?");
  });

  it("never names card kinds for questions", () => {
    expect(foldSteer({ cardKinds: ["cloze"] }, "questions")).toBe("");
  });

  it("stays inside the character budget and cuts the existing list first", () => {
    const existing = Array.from({ length: 80 }, (_, i) => `Existing card number ${i} ${"x".repeat(60)}`);
    const text = foldSteer({ instruction: "Keep me", existing }, "cards");
    expect(text.length).toBeLessThanOrEqual(STEER_MAX_CHARS);
    expect(text.startsWith("Keep me")).toBe(true);
  });

  it("returns an empty string when nothing is steered", () => {
    expect(foldSteer({}, "cards")).toBe("");
  });
});

describe("gapSections", () => {
  const sections = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("picks sections under the average share, fewest first", () => {
    const counts = new Map([
      ["a", 10],
      ["b", 0],
      ["c", 6],
      ["d", 2],
    ]);
    expect(gapSections(sections, counts).map((s) => s.id)).toEqual(["b", "d"]);
  });

  it("always returns somewhere to go when coverage is even", () => {
    const counts = new Map(sections.map((s) => [s.id, 5]));
    expect(gapSections(sections, counts).length).toBeGreaterThan(0);
  });

  it("treats a section with no items as a gap even when the average is zero", () => {
    expect(gapSections(sections, new Map()).map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("type helpers", () => {
  it("names nothing when no type is chosen", () => {
    expect(cardKindsLine([])).toBeNull();
    expect(questionTypesValue(undefined)).toBe("");
  });
  it("joins question types the way the quiz agents read them", () => {
    expect(questionTypesValue(["true_false", "multiple_choice"])).toBe("true_false,multiple_choice");
  });
});
