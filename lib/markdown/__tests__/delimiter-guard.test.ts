import {
  guardMarkdownDelimiters,
  guardMathDelimiters,
  guardRunawayLinks,
} from "@/lib/markdown/delimiter-guard";

describe("guardMathDelimiters", () => {
  it("leaves content without `$$` untouched", () => {
    const src = "Plain prose with a price of $5 and $10.";
    expect(guardMathDelimiters(src)).toEqual({ text: src, violations: [] });
  });

  it("preserves genuine display math", () => {
    const src = "Before\n\n$$\\frac{a}{b} = c$$\n\nAfter";
    const { text, violations } = guardMathDelimiters(src);
    expect(text).toBe(src);
    expect(violations).toEqual([]);
  });

  it("preserves command-free symbolic math", () => {
    const src = "$$x^2 + y^2 = z^2$$";
    expect(guardMathDelimiters(src).text).toBe(src);
  });

  it("escapes a stray `$$` that would swallow prose", () => {
    // The real-world shape: a model emitted `$$` where a citation should have
    // closed, and the next `$$` far below closed the accidental math span.
    const src =
      "- **Handling:** Forms a clot [https://a.com/x](https://a.com/x)$$ . " +
      "#### 2. Injectable (i-PRF) - **Preparation:** ultra-low speed " +
      "($\\sim 200 \\text{ g}$). - **Matrix:** liquid state before " +
      "polymerization occurs $$https://www.agd.org/x](https://www.agd.org/x).";

    const { text, violations } = guardMathDelimiters(src);

    expect(violations.map((v) => v.reason)).toEqual(["prose-span", "unpaired"]);
    // The opening stray is neutralized...
    expect(text).toContain("(https://a.com/x)\u200B$\u200B$ .");
    // ...and the markdown it had swallowed is intact for the parser.
    expect(text).toContain("#### 2. Injectable (i-PRF)");
    expect(text).toContain("**Preparation:**");
  });

  it("still renders real math after an escaped prose span", () => {
    const src =
      "Cited$$ . Some prose with a [link](https://x.com) and **bold** text $$ " +
      "and then $$E = mc^2$$ closes it out.";
    const { text } = guardMathDelimiters(src);
    expect(text).toContain("$$E = mc^2$$");
    expect(text).toContain("Cited\u200B$\u200B$");
  });

  it("ignores `$$` inside code spans and fenced blocks", () => {
    const src =
      "Use `$$foo$$` inline.\n\n```bash\necho $$ && echo done\n```\n\nDone.";
    const { text, violations } = guardMathDelimiters(src);
    expect(text).toBe(src);
    expect(violations).toEqual([]);
  });

  it("reports but does not escape an unpaired `$$` (inert to remark-math)", () => {
    const src = "A sentence that ends oddly $$";
    const { text, violations } = guardMathDelimiters(src);
    expect(text).toBe(src);
    expect(violations).toEqual([
      expect.objectContaining({ reason: "unpaired" }),
    ]);
  });

  it("rejects a long prose span even when it contains LaTeX fragments", () => {
    const src =
      "$$ The sample was spun at roughly \\sim 400 g which is a normal " +
      "clinical protocol for this preparation and the resulting membrane " +
      "was compressed before placement in the surgical defect $$";
    const { text, violations } = guardMathDelimiters(src);
    expect(violations[0]?.reason).toBe("prose-span");
    expect(text.startsWith("\u200B$\u200B$")).toBe(true);
  });
});

describe("guardRunawayLinks", () => {
  it("leaves normal links alone, including formatted labels", () => {
    const src =
      "See [the **docs**](https://example.com/docs) and [x](https://x.com).";
    expect(guardRunawayLinks(src)).toEqual({ text: src, violations: [] });
  });

  it("escapes a link label that swallowed a section", () => {
    const label = `citation one, citation two. Then a heading:\n#### 2. Next Section\n- **Bold:** ${"prose ".repeat(40)}`;
    const src = `Text [${label}](https://example.com/x) tail.`;
    const { text, violations } = guardRunawayLinks(src);
    expect(violations[0]?.reason).toBe("runaway-link");
    expect(text).toContain("Text \u200B&#91;citation one");
  });

  it("ignores brackets inside code", () => {
    const src = "`[" + "x".repeat(250) + "](y)`";
    expect(guardRunawayLinks(src).violations).toEqual([]);
  });
});

describe("guardMarkdownDelimiters", () => {
  it("neutralizes both failure shapes in one pass and keeps real content", () => {
    const src =
      "- **Handling:** clot [https://a.com/x, https://b.org/y$$ . " +
      "#### 2. Injectable (i-PRF) - **Preparation:** ultra-low speed " +
      "($\\sim 200 \\text{ g}$). - **Matrix:** liquid state before " +
      "polymerization occurs $$https://b.org/y](https://b.org/y).\n\n$$x^2 = y$$";

    const { text, violations } = guardMarkdownDelimiters(src);

    expect(violations.some((v) => v.reason === "prose-span")).toBe(true);
    expect(violations.some((v) => v.reason === "runaway-link")).toBe(true);
    // The real math at the end survives untouched.
    expect(text).toContain("$$x^2 = y$$");
    // The swallowed markdown is back in play for the parser.
    expect(text).toContain("**Preparation:**");
  });
});
