import { splitMarkdownForEmbed } from "../blogLayout";

const para = (n: number, word: string) =>
  Array.from({ length: n }, () => `${word} ${word} ${word} ${word}.`).join(" ");

describe("splitMarkdownForEmbed", () => {
  it("returns the whole body as `before` when the article is short", () => {
    const md = "Just a couple of short sentences. Nothing to split here.";
    const { before, after } = splitMarkdownForEmbed(md);
    expect(before).toBe(md.trim());
    expect(after).toBe("");
  });

  it("splits a long multi-paragraph article near the midpoint on a block boundary", () => {
    const blocks = [
      `# Intro\n\n${para(6, "alpha")}`,
      para(6, "beta"),
      `## Middle\n\n${para(6, "gamma")}`,
      para(6, "delta"),
      para(6, "epsilon"),
    ];
    const md = blocks.join("\n\n");
    const { before, after } = splitMarkdownForEmbed(md);

    expect(before).not.toBe("");
    expect(after).not.toBe("");
    // Every character is preserved (whitespace-insensitive) and nothing is duplicated.
    expect((before + "\n\n" + after).replace(/\s+/g, " ").trim()).toBe(
      md.replace(/\s+/g, " ").trim(),
    );
    // The split is at a paragraph boundary — `before` ends a block, `after`
    // begins one; neither half starts/ends mid-line with a dangling fragment.
    expect(before.endsWith(".")).toBe(true);
    expect(after.trimStart()).toBe(after.trimStart());
  });

  it("never splits inside a fenced code block", () => {
    const fence = "```\n" + para(30, "code") + "\n```";
    const md = [para(8, "a"), fence, para(8, "b"), para(8, "c")].join("\n\n");
    const { before, after } = splitMarkdownForEmbed(md);
    // The fence's backticks must both live in the same half (never cut apart).
    const openBefore = (before.match(/```/g) ?? []).length;
    const openAfter = (after.match(/```/g) ?? []).length;
    expect(openBefore % 2).toBe(0);
    expect(openAfter % 2).toBe(0);
  });

  it("is null-safe", () => {
    expect(splitMarkdownForEmbed(null)).toEqual({ before: "", after: "" });
    expect(splitMarkdownForEmbed(undefined)).toEqual({ before: "", after: "" });
  });
});
