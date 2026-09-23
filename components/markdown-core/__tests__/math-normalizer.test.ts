import { normalizeMathDelimiters } from "../math-normalizer";

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
  ["digit-led needs tex", "$2x$ and $2^x$", "$2x$ and $$2^x$$"],
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
