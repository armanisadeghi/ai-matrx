/**
 * KIND NEVER RAW — round 11 (independent attacker's repros). Reload must draw
 * what live draws and never swallow the message into a code card.
 *
 * H1: an escaped `{\"__kind\":…}` paragraph followed later by a real kind made
 *     the reload splitter read the rest of the message (lists, headings, a
 *     python fence, a table) as ONE "JSON" code card: its bare-JSON step never
 *     balanced the escaped line's braces and took the region to the end, then
 *     `hasKindKey` found the LATER real key and called it a kind region.
 * H2: a ```json fence whose body line ends inside a JSON string (escaped
 *     quotes) swallowed its closing ``` and everything after: the fence
 *     reader carried string state across lines (a JSON string never holds a
 *     raw newline).
 */
import { splitContentIntoBlocksV2 } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";

type Block = { type: string; content?: string; language?: string };
const split = (text: string) => splitContentIntoBlocksV2(text) as unknown as Block[];
const jsonCards = (blocks: Block[]) => blocks.filter((b) => b.type === "code" && (b.language ?? "json") === "json");

const ESCAPED = '{\\"__kind\\":\\"note\\",\\"title\\":\\"Hi\\"}';
const ESCAPED_MD = '{\\"\\\\_\\\\_kind\\":\\"note\\",\\"title\\":\\"Hi\\"}';
const REAL = 'Here it is {"__kind":"note","title":"Real","body":"x"} done.';
const AFTER = "\n\n- one\n- two\n\n## Heading\n\n```python\nprint(1)\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";

describe("H1 — an escaped kind paragraph never makes reload swallow the message", () => {
  it.each([
    ["escaped", ESCAPED],
    ["escaped + markdown-escaped key", ESCAPED_MD],
  ])("%s paragraph, then a real kind in prose, then lists / heading / fence / table", (_name, escaped) => {
    const blocks = split(`Intro.\n\n${escaped}\n\n${REAL}${AFTER}`);
    for (const card of jsonCards(blocks)) {
      expect(card.content).not.toContain("## Heading");
      expect(card.content).not.toContain("- one");
      expect(card.content).not.toContain("print(1)");
      expect(card.content).not.toContain("| a | b |");
      expect(card.content).not.toContain("done.");
      expect(card.content).not.toContain(escaped);
    }
    expect(blocks.some((b) => b.type === "code" && b.language === "python" && b.content?.includes("print(1)"))).toBe(true);
    // The escaped paragraph stays prose, as written.
    expect(blocks.some((b) => b.type === "text" && b.content?.includes(escaped))).toBe(true);
  });

  it("a real kind that is still arriving (no prose break) is still a JSON region", () => {
    const blocks = split('Intro.\n\n{"__kind":"note","title":"Hi","body":"strea');
    expect(jsonCards(blocks).map((b) => b.content)).toEqual(['{"__kind":"note","title":"Hi","body":"strea']);
  });
});

describe("H2 — a ```json fence ending a line inside a string still closes at its ```", () => {
  it.each([
    ["top level", "Para\n\n```json\n{0}\n```\n\n- item two\n", "{0}"],
    ["list item", "- item one\n  ```json\n  {0}\n  ```\n- item two\n- item three\n", "  {0}"],
    ["blockquote", "> quoted\n> ```json\n> {0}\n> ```\n> after\n\nTail para.\n", "{0}"],
  ])("%s", (_where, template, body) => {
    for (const inner of [ESCAPED, '{\\"a\\":\\"b\\"}']) {
      const blocks = split(template.replace("{0}", inner));
      const cards = jsonCards(blocks);
      expect(cards.map((b) => b.content)).toEqual([body.replace("{0}", inner)]);
      const rest = blocks.filter((b) => b.type !== "code").map((b) => b.content ?? "").join("\n");
      for (const word of ["item two", "after", "Tail para."]) {
        if (template.includes(word)) expect(rest).toContain(word);
      }
    }
  });
});

import { nonJsonKindsAsCode } from "@/features/content-ir/surfaces/kind-one-line";

/**
 * H3: the as-written code span (round 10) may only be added where it changes
 * nothing else on screen. Otherwise the text is left untouched (detection
 * only) — never visible backticks, never a broken neighbour.
 */
describe("H3 — nonJsonKindsAsCode wraps only where a code span is safe", () => {
  it("a plain prose region still becomes a code span", () => {
    expect(nonJsonKindsAsCode(`Log: ${ESCAPED} ok.`)).toBe(`Log: \`${ESCAPED}\` ok.`);
  });

  it.each([
    ["inside a <td>", `<table><tr><td>${ESCAPED}</td></tr></table>`],
    ["inside <details> (no blank line)", `<details>\n<summary>S</summary>\n${ESCAPED}\n</details>`],
    ["a <td> line inside a table block", `<table>\n<tr><td>${ESCAPED}</td></tr>\n</table>`],
    ["a region spanning a blank line", 'Log: {\\"__kind\\":\\"note\\",\n\n\\"title\\":\\"Hi\\"} ok.'],
    ["right after a code span", `\`x\`${ESCAPED} ok.`],
    ["right before a code span", `Log: ${ESCAPED}\`y\` ok.`],
    ["holding a backtick", 'Log: {\\"__kind\\":\\"note\\",\\"title\\":\\"a`b\\"} ok.'],
    ["a table cell with a pipe inside", `| a | b |\n|---|---|\n| {\\"__kind\\":\\"note\\",\\"title\\":\\"x|y\\"} | 2 |`],
  ])("%s → left exactly as written", (_name, text) => {
    expect(nonJsonKindsAsCode(text)).toBe(text);
  });

  it("a stray backtick elsewhere in the paragraph never pairs with the fence", () => {
    // An unpaired single backtick (a paired one would make the region code already).
    const text = `A stray \` here, then ${ESCAPED} done.`;
    const out = nonJsonKindsAsCode(text);
    // A run of 1 exists in the paragraph, so the fence is 2 long.
    expect(out).toBe(`A stray \` here, then \`\`${ESCAPED}\`\` done.`);
  });

  it("inline HTML mid-line keeps markdown, so the span is safe there", () => {
    expect(nonJsonKindsAsCode(`See <span>${ESCAPED}</span> here.`)).toBe(`See <span>\`${ESCAPED}\`</span> here.`);
  });

  it("a region in a later paragraph ignores an earlier paragraph's HTML", () => {
    const text = `<div>x</div>\n\nLog: ${ESCAPED} ok.`;
    expect(nonJsonKindsAsCode(text)).toBe(`<div>x</div>\n\nLog: \`${ESCAPED}\` ok.`);
  });
});
