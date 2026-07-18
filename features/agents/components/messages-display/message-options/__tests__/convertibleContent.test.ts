/**
 * Convert-action gating — the "Convert to flashcards / quiz" item only offers
 * itself on messages whose markdown carries enumerable structure (a table or a
 * real list). Prose and code samples stay generic.
 */

import { hasConvertibleContent } from "../convertibleContent";

describe("hasConvertibleContent", () => {
  it("rejects empty / whitespace content", () => {
    expect(hasConvertibleContent("")).toBe(false);
    expect(hasConvertibleContent("   \n  ")).toBe(false);
  });

  it("rejects plain prose", () => {
    expect(
      hasConvertibleContent(
        "Photosynthesis is the process by which plants convert light into chemical energy. It happens in the chloroplasts.",
      ),
    ).toBe(false);
  });

  it("accepts a markdown table (row + separator)", () => {
    const md = [
      "Here is a comparison:",
      "",
      "| Term | Definition |",
      "| --- | --- |",
      "| ATP | Energy currency |",
    ].join("\n");
    expect(hasConvertibleContent(md)).toBe(true);
  });

  it("accepts aligned separator variants", () => {
    const md = "| A | B |\n|:---|---:|\n| 1 | 2 |";
    expect(hasConvertibleContent(md)).toBe(true);
  });

  it("rejects a lone pipe line with no separator (not a table)", () => {
    expect(hasConvertibleContent("a | b | c\n| just | pipes |")).toBe(false);
  });

  it("accepts a bullet list of 3+ items", () => {
    const md = "- Mitochondria\n- Ribosomes\n- Golgi apparatus";
    expect(hasConvertibleContent(md)).toBe(true);
  });

  it("accepts an ordered list of 3+ items", () => {
    const md = "1. First step\n2. Second step\n3. Third step";
    expect(hasConvertibleContent(md)).toBe(true);
  });

  it("rejects a list with fewer than 3 items", () => {
    expect(hasConvertibleContent("- one\n- two")).toBe(false);
  });

  it("ignores tables and lists inside fenced code blocks", () => {
    const md = [
      "```sql",
      "| col | col |",
      "| --- | --- |",
      "- not a list",
      "- still not",
      "- nope",
      "```",
    ].join("\n");
    expect(hasConvertibleContent(md)).toBe(false);
  });

  it("still detects a real table after a code fence", () => {
    const md = [
      "```txt",
      "- fake",
      "```",
      "| Q | A |",
      "| --- | --- |",
      "| x | y |",
    ].join("\n");
    expect(hasConvertibleContent(md)).toBe(true);
  });
});
