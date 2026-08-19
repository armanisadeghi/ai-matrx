import {
  getHighlightTerms,
  getQueryHighlightSegments,
} from "@/features/rag/components/hit-card/query-highlighting";

describe("query highlighting", () => {
  it("removes standalone stop words from the meaningful term list", () => {
    expect(
      getHighlightTerms(
        "What are the guidelines for measuring pain from back injuries?",
      ),
    ).toEqual(["guidelines", "measuring", "pain", "back", "injuries"]);
  });

  it("favors the longest exact sequence and leaves shorter matches elsewhere", () => {
    const segments = getQueryHighlightSegments(
      "These guidelines for measuring pain differ from other pain scales.",
      "What are the guidelines for measuring pain?",
    ).filter((segment) => segment.highlighted);

    expect(segments.map(({ text, wordCount }) => ({ text, wordCount }))).toEqual([
      { text: "guidelines for measuring pain", wordCount: 4 },
      { text: "pain", wordCount: 1 },
    ]);
    expect(segments.every((segment) => segment.maxWordCount === 4)).toBe(true);
  });

  it("treats adjacent meaningful query words as a chain in any order", () => {
    const highlighted = getQueryHighlightSegments(
      "The pain guidelines distinguish back injuries from other conditions.",
      "What are the guidelines for measuring pain from back injuries?",
    ).filter((segment) => segment.highlighted);

    expect(highlighted.map(({ text, wordCount }) => ({ text, wordCount }))).toEqual([
      { text: "pain guidelines", wordCount: 2 },
      { text: "back injuries", wordCount: 2 },
    ]);
    expect(highlighted.every((segment) => segment.maxWordCount === 2)).toBe(true);
  });

  it("does not inflate an unordered chain with repeated terms absent from the query", () => {
    const highlighted = getQueryHighlightSegments(
      "Pain pain guidelines.",
      "pain guidelines",
    ).filter((segment) => segment.highlighted);

    expect(highlighted.map(({ text, wordCount }) => ({ text, wordCount }))).toEqual([
      { text: "Pain", wordCount: 1 },
      { text: "pain guidelines", wordCount: 2 },
    ]);
  });

  it("does not highlight a stop word by itself", () => {
    expect(
      getQueryHighlightSegments("The result is in the document.", "the")
        .filter((segment) => segment.highlighted),
    ).toEqual([]);
  });

  it("allows stop words when they are part of a meaningful phrase", () => {
    const highlighted = getQueryHighlightSegments(
      "Pain in the back can radiate.",
      "pain in the back",
    ).filter((segment) => segment.highlighted);

    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toMatchObject({
      text: "Pain in the back",
      wordCount: 4,
    });
  });

  it("matches Unicode words without changing the original text", () => {
    const highlighted = getQueryHighlightSegments(
      "La mesure de la douleur aiguë est documentée.",
      "douleur aiguë",
    ).filter((segment) => segment.highlighted);

    expect(highlighted[0]).toMatchObject({
      text: "douleur aiguë",
      wordCount: 2,
    });
  });
});
