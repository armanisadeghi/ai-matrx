import { citedFieldProbes, citedFieldTexts } from "../citedField";

const data = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [
    { front: "What is the powerhouse of the cell?", back: "Mitochondria" },
    { front: "Where is DNA stored?", back: "The nucleus" },
  ],
  trust: { citations: [{ title: "x" }] },
};

describe("citedFieldProbes", () => {
  it("finds the n-th item of a list (1-based) by its own words", () => {
    expect(citedFieldProbes(data, "cards-2")).toEqual(["Where is DNA stored?", "The nucleus"]);
  });
  it("summary is the top-level scalars, never the envelope", () => {
    expect(citedFieldProbes(data, "summary")).toEqual(["Cell biology"]);
  });
  it("names nothing for an out-of-range item or an unknown key", () => {
    expect(citedFieldProbes(data, "cards-3")).toEqual([]);
    expect(citedFieldProbes(data, "nope-1")).toEqual([]);
    expect(citedFieldProbes(data, null)).toEqual([]);
  });
  it("never offers the trust envelope", () => {
    expect(citedFieldProbes(data, "trust")).toEqual([]);
  });
});

describe("citedFieldTexts (shown ringed when the instance renders in its sandbox frame)", () => {
  it("is the cited place's words, whole and in reading order", () => {
    expect(citedFieldTexts(data, "cards-1")).toEqual(["What is the powerhouse of the cell?", "Mitochondria"]);
    expect(citedFieldTexts(data, "summary")).toEqual(["Cell biology"]);
  });
  it("never truncates a long field (the probes do)", () => {
    const long = "x".repeat(200);
    expect(citedFieldTexts({ summary_text: long }, "summary")).toEqual([long]);
    expect(citedFieldProbes({ summary_text: long }, "summary")[0]).toHaveLength(80);
  });
});
