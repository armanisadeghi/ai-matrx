import { markdownToPlainText } from "./plain-text";

describe("markdownToPlainText", () => {
  it("returns an empty string for nullish input", () => {
    expect(markdownToPlainText(undefined)).toBe("");
    expect(markdownToPlainText(null)).toBe("");
    expect(markdownToPlainText("")).toBe("");
  });

  it("unwraps the emphasis markers that reach real provider answers", () => {
    expect(markdownToPlainText("depends on **what you're treating**")).toBe(
      "depends on what you're treating",
    );
    expect(markdownToPlainText("*orthopedic* care")).toBe("orthopedic care");
    expect(markdownToPlainText("__bold__ and ___both___")).toBe(
      "bold and both",
    );
    expect(markdownToPlainText("~~struck~~ out")).toBe("struck out");
    expect(markdownToPlainText("run `pnpm type-check` now")).toBe(
      "run pnpm type-check now",
    );
  });

  it("keeps the label and drops the target of a link", () => {
    expect(markdownToPlainText("see [Cedars-Sinai](https://example.com)")).toBe(
      "see Cedars-Sinai",
    );
    expect(markdownToPlainText("[**bold label**](https://example.com)")).toBe(
      "bold label",
    );
  });

  it("leaves lone markers alone — a stray asterisk in prose is prose", () => {
    expect(markdownToPlainText("2 * 3 = 6")).toBe("2 * 3 = 6");
    expect(markdownToPlainText("a lone * marker")).toBe("a lone * marker");
    expect(markdownToPlainText("terms apply*")).toBe("terms apply*");
  });

  it("does not mangle snake_case identifiers", () => {
    expect(markdownToPlainText("column answer_text holds it")).toBe(
      "column answer_text holds it",
    );
    expect(markdownToPlainText("seo.ai_visibility_response")).toBe(
      "seo.ai_visibility_response",
    );
  });

  it("is idempotent on already-plain text", () => {
    const plain = "There isn't one objectively best PRP clinic in Los Angeles.";
    expect(markdownToPlainText(plain)).toBe(plain);
  });
});
