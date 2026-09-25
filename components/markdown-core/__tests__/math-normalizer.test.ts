import { isEscapedBracketProse, normalizeMathDelimiters } from "../math-normalizer";

// Source → exact normalized source. Anything not math must come back
// byte-identical; math comes back in remark-math's `$$` forms.
const TABLE: Array<[string, string, string]> = [
  ["currency pair", "It costs $5 and $10.", "It costs $5 and $10."],
  ["price range", "Plans run $5-$10 a month.", "Plans run $5-$10 a month."],
  ["decimal prices", "$20.50 or $3.99", "$20.50 or $3.99"],
  ["shell variables", "Set $HOME/$PATH first.", "Set $HOME/$PATH first."],
  ["template literal", "Use ${name} here.", "Use ${name} here."],
  ["escaped dollar", "Escaped \\$x^2\\$ stays.", "Escaped \\$x^2\\$ stays."],
  ["windows path in brackets", "See [C:\\Users\\me] now.", "See [C:\\Users\\me] now."],
  ["markdown link", "[\\alpha paper](https://x.y)", "[\\alpha paper](https://x.y)"],
  ["task list", "- [ ] todo", "- [ ] todo"],
  ["single-dollar tex", "Let $x^2$ be.", "Let $$x^2$$ be."],
  ["lone variable", "for all $n$ here", "for all $$n$$ here"],
  // content-ir 0.18.0 (Pandoc delimiters): `$2x$` is a formula like `$2a$` — a
  // leading digit no longer needs a TeX command once the span is closed. A
  // price glued to a word stays text: `$10$N9qo` (a bcrypt cost) and `$5-$10`.
  ["digit-led closed span is math", "$2x$ and $2^x$", "$$2x$$ and $$2^x$$"],
  ["digit glued to a word stays text", "hash $2a$10$N9qo8u", "hash $2a$10$N9qo8u"],
  ["unit economics", "where $FC$ is fixed costs", "where $$FC$$ is fixed costs"],
  ["closing followed by digit", "$x$5", "$x$5"],
  ["space after opening", "$ x^2$", "$ x^2$"],
  ["inline paren", "a \\(x+1\\) b", "a $$x+1$$ b"],
  ["display bracket", "a\n\\[x\\]\nb", "a\n\n\n$$\nx\n$$\n\n\nb"],
  ["existing $$ untouched", "$$a$b$$ and $$c$$", "$$a$b$$ and $$c$$"],
  ["code span untouched", "`$x^2$ \\(y\\)`", "`$x^2$ \\(y\\)`"],
  ["double-backtick span", "``a ` $x^2$``", "``a ` $x^2$``"],
  ["fence untouched", "```\n$x^2$\n```\n$y^2$", "```\n$x^2$\n```\n$$y^2$$"],
  ["tilde fence untouched", "~~~\n\\(a\\)\n~~~", "~~~\n\\(a\\)\n~~~"],
  ["paren does not cross blank line", "\\(a\n\nb\\)", "\\(a\n\nb\\)"],
  ["bracket latex display", "[ \\frac{1}{2} ]", "\n\n$$\n\\frac{1}{2}\n$$\n\n"],
];

describe("normalizeMathDelimiters", () => {
  it.each(TABLE)("%s", (_name, input, expected) => {
    expect(normalizeMathDelimiters(input)).toBe(expected);
  });

  it("is idempotent", () => {
    for (const [, input] of TABLE) {
      const once = normalizeMathDelimiters(input);
      expect(normalizeMathDelimiters(once)).toBe(once);
    }
  });
});

describe("escaped brackets around prose are literal, not math (verify-RC-B4 R2-3)", () => {
  it("leaves \\[word\\] as escaped brackets the markdown renders as [word]", () => {
    expect(normalizeMathDelimiters("See \\[bracket\\] here.")).toBe("See \\[bracket\\] here.");
    expect(normalizeMathDelimiters("Call it \\[sic\\], then \\[see note\\].")).toBe("Call it \\[sic\\], then \\[see note\\].");
  });

  it("still converts real display math between \\[ \\]", () => {
    for (const tex of ["x^2 + y^2", "x", "E = mc^2", "\\alpha", "3.14", "\\frac{a}{b}"]) {
      expect(normalizeMathDelimiters(`\\[${tex}\\]`)).toContain(`$$\n${tex}\n$$`);
    }
  });

  it("the one rule, as the editor uses it", () => {
    expect(isEscapedBracketProse("bracket")).toBe(true);
    expect(isEscapedBracketProse(" see note ")).toBe(true);
    expect(isEscapedBracketProse("x")).toBe(false);
    expect(isEscapedBracketProse("a+b")).toBe(false);
    expect(isEscapedBracketProse("\\sin x")).toBe(false);
  });
});
