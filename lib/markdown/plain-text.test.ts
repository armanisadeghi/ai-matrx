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

describe("markdownToPlainText — math", () => {
  it("makes a fraction readable instead of showing raw TeX", () => {
    // The exact defect WP12 reported on the mobile card scrubber.
    expect(markdownToPlainText("\\(\\frac{dy}{dx}\\)")).toBe("dy/dx");
  });

  it("handles display math and common operators", () => {
    expect(markdownToPlainText("\\[a \\times b \\leq c\\]")).toBe("a × b ≤ c");
    expect(markdownToPlainText("$$\\sqrt{x}$$")).toBe("√(x)");
    expect(markdownToPlainText("\\(x^{2} + \\pi\\)")).toBe("x^2 + π");
  });

  it("resolves one level of nesting", () => {
    expect(markdownToPlainText("\\(\\frac{\\frac{a}{b}}{c}\\)")).toBe("a/b/c");
  });

  it("leaves prose backslashes and currency alone", () => {
    // Math transforms must never run outside a math region.
    expect(markdownToPlainText("Use C:\\Users\\name for the path")).toBe(
      "Use C:\\Users\\name for the path",
    );
    expect(markdownToPlainText("It costs $5 and $10")).toBe(
      "It costs $5 and $10",
    );
  });

  it("still unwraps emphasis around math", () => {
    expect(markdownToPlainText("**\\(\\frac{1}{2}\\)**")).toBe("1/2");
  });
});
