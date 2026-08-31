import { parseNoteOutline } from "./noteOutline";

describe("parseNoteOutline", () => {
  it("parses heading levels, text, and offsets", () => {
    const content = "# Title\n\nbody\n\n## Section A\ntext\n### Sub";
    const items = parseNoteOutline(content);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      level: 1,
      text: "Title",
      charOffset: 0,
      headingIndex: 0,
    });
    expect(items[1].level).toBe(2);
    expect(items[1].text).toBe("Section A");
    expect(content.slice(items[1].charOffset)).toMatch(/^## Section A/);
    expect(items[2]).toMatchObject({ level: 3, text: "Sub", headingIndex: 2 });
  });

  it("skips headings inside fenced code blocks", () => {
    const content = [
      "# Real",
      "```bash",
      "# not a heading",
      "```",
      "~~~",
      "## also not",
      "~~~",
      "## Real Two",
    ].join("\n");
    const items = parseNoteOutline(content);
    expect(items.map((i) => i.text)).toEqual(["Real", "Real Two"]);
  });

  it("strips inline markdown and trailing closing hashes", () => {
    const items = parseNoteOutline(
      "## **Bold** and [link](https://x.com) and `code` ##",
    );
    expect(items[0].text).toBe("Bold and link and code");
  });

  it("ignores non-headings and empty headings", () => {
    const items = parseNoteOutline("#nospace\nplain\n####### seven\n#   \n");
    expect(items).toHaveLength(0);
  });

  it("returns [] for empty content", () => {
    expect(parseNoteOutline("")).toEqual([]);
  });
});
