// Edit in place: the caret lands where the person double-clicked — the click
// travels as the rendered text around it and is found again in the editor's
// text (core/caret-context.ts).

import { locateCaret } from "@ai-matrx/rich-editor/core/caret-context";

describe("locateCaret", () => {
  const text = "The quick brown fox\njumps over the lazy dog.\n\nA second paragraph about the fox.";

  test("both sides of the click find the exact spot", () => {
    expect(locateCaret(text, { before: "jumps over the la", after: "zy dog." })).toBe(text.indexOf("lazy") + 2);
  });

  test("rendered whitespace (line breaks, double spaces) still matches", () => {
    expect(locateCaret(text, { before: "brown fox jumps ", after: "over the" })).toBe(text.indexOf("over"));
  });

  test("a repeated word is told apart by its context", () => {
    expect(locateCaret(text, { before: "paragraph about the ", after: "fox." })).toBe(text.lastIndexOf("fox"));
  });

  test("one side alone is enough at the edges of a block", () => {
    expect(locateCaret(text, { before: "", after: "A second paragraph" })).toBe(text.indexOf("A second"));
    expect(locateCaret(text, { before: "the lazy dog.", after: "" })).toBe(text.indexOf("dog.") + 4);
  });

  test("markdown source: context found through the markup when the words are contiguous", () => {
    const source = "Some **bold words** and a [link](https://x.test) here.";
    expect(locateCaret(source, { before: "and a ", after: "link here." })).toBe(source.indexOf("[link") );
  });

  test("text that is not there gives null (the editor keeps its own caret)", () => {
    expect(locateCaret(text, { before: "zebra crossing", after: "elephant" })).toBeNull();
  });
});
