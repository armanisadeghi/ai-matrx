/**
 * kindTextToMarkdown — answer text with `__kind` regions becomes readable
 * markdown for display/export destinations; kindless text is untouched.
 */
import { kindTextPreview, kindTextToMarkdown } from "../surfaces/kind-text-to-markdown";

const SET = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
};
const SET_JSON = JSON.stringify(SET);

describe("kindTextToMarkdown", () => {
  it("converts a whole-text kind value", () => {
    const md = kindTextToMarkdown(SET_JSON);
    expect(md).not.toContain("__kind");
    expect(md).toContain("# Cell biology");
    expect(md).toContain("Mitochondria");
  });

  it("converts a pretty-printed kind value", () => {
    const md = kindTextToMarkdown(JSON.stringify(SET, null, 2));
    expect(md).not.toContain("__kind");
    expect(md).toContain("Powerhouse?");
  });

  it("converts a ```json fenced kind inside prose and keeps the prose", () => {
    const text = `Here are your cards:\n\n\`\`\`json\n${SET_JSON}\n\`\`\`\n\nGood luck!`;
    const md = kindTextToMarkdown(text);
    expect(md).not.toContain("__kind");
    expect(md).not.toContain("```json");
    expect(md).toContain("Here are your cards:");
    expect(md).toContain("Good luck!");
    expect(md).toContain("# Cell biology");
  });

  it("converts an unlabelled fence holding a kind", () => {
    const md = kindTextToMarkdown(`Intro\n\`\`\`\n${SET_JSON}\n\`\`\``);
    expect(md).not.toContain("__kind");
    expect(md).toContain("Intro");
  });

  it("converts a bare kind object on its own line in prose", () => {
    const md = kindTextToMarkdown(`Before\n\n${SET_JSON}\n\nAfter`);
    expect(md).not.toContain("__kind");
    expect(md).toMatch(/^Before/);
    expect(md).toMatch(/After$/);
  });

  it("converts a list of kinds", () => {
    const md = kindTextToMarkdown(JSON.stringify([SET, { ...SET, title: "Two" }]));
    expect(md).not.toContain("__kind");
    expect(md).toContain("# Cell biology");
    expect(md).toContain("# Two");
  });

  it("leaves kindless text and kindless JSON byte for byte", () => {
    const plain = "## Notes\n\n```json\n{\"a\": 1}\n```\n\nDone.";
    expect(kindTextToMarkdown(plain)).toBe(plain);
    expect(kindTextToMarkdown('{"a":1}')).toBe('{"a":1}');
    expect(kindTextToMarkdown("")).toBe("");
    expect(kindTextToMarkdown(null)).toBe("");
  });

  it("leaves a kind that only appears inside a non-json code example alone", () => {
    const text = "Example:\n\n```ts\nconst x = " + SET_JSON + ";\n```";
    expect(kindTextToMarkdown(text)).toBe(text);
  });
});

/**
 * V4 (independent verifier, 2026-09-30): every shape below still exported raw
 * `"__kind"` JSON. A kind is never raw in an export; a kind QUOTED as source
 * (an inline code span, a fence in another language) stays as written.
 */
describe("kindTextToMarkdown — V4 shapes never leave raw kind JSON", () => {
  const noRaw = (md: string) => {
    expect(md).not.toContain("__kind");
    expect(md).not.toMatch(/"flashcard_set"/);
  };

  it("a CRLF ```json fence converts", () => {
    const md = kindTextToMarkdown(`Intro\r\n\`\`\`json\r\n${SET_JSON}\r\n\`\`\`\r\nAfter`);
    noRaw(md);
    expect(md).toContain("# Cell biology");
    expect(md).toContain("Intro");
    expect(md).toContain("After");
    expect(md).not.toContain("```");
  });

  it("a truncated kind in an unclosed fence is a one-line 'did not finish' note", () => {
    const md = kindTextToMarkdown('Intro\n```json\n{"__kind": "flashcard_set", "title": "Cell bi');
    noRaw(md);
    expect(md).toBe("Intro\n\nFlashcard Set did not finish");
  });

  it("a truncated kind in a CLOSED fence (invalid JSON) is the note", () => {
    const md = kindTextToMarkdown('Intro\n```json\n{"__kind": "flashcard_set", "title": \n```\nAfter');
    noRaw(md);
    expect(md).toContain("Flashcard Set did not finish");
    expect(md).toContain("After");
  });

  it("a truncated bare kind at the tail is the note; the prose before it stays", () => {
    const md = kindTextToMarkdown('Here you go: {"__kind": "flashcard_set", "cards": [{"front": "Pow');
    noRaw(md);
    expect(md).toBe("Here you go:\n\nFlashcard Set did not finish");
  });

  it("a whole-text truncated kind is the note", () => {
    expect(kindTextToMarkdown('{"__kind": "flashcard_set", "title": "Ce')).toBe(
      "Flashcard Set did not finish",
    );
  });

  it("an unnamed truncated kind says 'Result did not finish'", () => {
    const md = kindTextToMarkdown('Intro\n\n{"__kind": "flash');
    noRaw(md);
    expect(md).toBe("Intro\n\nResult did not finish");
  });

  it("a kindless wrapper holding a kind: its data reads as markdown, the kind converts", () => {
    const wrapper = JSON.stringify({ result: SET, note: "Review weekly" });
    for (const text of [
      wrapper,
      `Output:\n\n\`\`\`json\n${wrapper}\n\`\`\``,
      `Output:\n\n${wrapper}\n\nEnd`,
    ]) {
      const md = kindTextToMarkdown(text);
      noRaw(md);
      expect(md).toContain("Cell biology");
      expect(md).toContain("Review weekly");
      expect(md).not.toContain('"note"');
    }
  });

  it("two kinds in one fence both convert", () => {
    const two = `${SET_JSON}\n${JSON.stringify({ ...SET, title: "Genetics" })}`;
    const md = kindTextToMarkdown(`Cards:\n\`\`\`json\n${two}\n\`\`\``);
    noRaw(md);
    expect(md).toContain("# Cell biology");
    expect(md).toContain("# Genetics");
    expect(md).not.toContain("```");
  });

  it("a mixed array (kinds + plain values) converts every element", () => {
    const mixed = JSON.stringify([SET, { topic: "Osmosis", minutes: 10 }]);
    for (const text of [mixed, `List:\n\`\`\`json\n${mixed}\n\`\`\``]) {
      const md = kindTextToMarkdown(text);
      noRaw(md);
      expect(md).toContain("# Cell biology");
      expect(md).toContain("Osmosis");
      expect(md).not.toContain('"topic"');
    }
  });

  it("a kind in a blockquote fence converts and stays quoted", () => {
    const md = kindTextToMarkdown(`Quote:\n\n> \`\`\`json\n> ${SET_JSON}\n> \`\`\`\n\nAfter`);
    noRaw(md);
    expect(md).toContain("> # Cell biology");
    expect(md).toContain("After");
    expect(md).not.toContain("```");
  });

  it("a ~~~JSON fence converts", () => {
    const md = kindTextToMarkdown(`~~~JSON\n${SET_JSON}\n~~~`);
    noRaw(md);
    expect(md).toContain("# Cell biology");
    expect(md).not.toContain("~~~");
  });

  it("a bare kind mid-sentence starts its block output on a new line", () => {
    const md = kindTextToMarkdown(`Answer: ${SET_JSON} Thanks!`);
    noRaw(md);
    expect(md).toMatch(/^Answer:\n\n# Cell biology/);
    expect(md).toMatch(/\n\nThanks!$/);
    expect(md).not.toMatch(/[^\n]# Cell biology/);
  });

  it("RULING: a kind in an inline code span is quoted source and stays as written", () => {
    const text = `Send \`${SET_JSON}\` to the API.`;
    expect(kindTextToMarkdown(text)).toBe(text);
  });

  it("RULING: a kind in a ```xml or ```ts fence stays as written", () => {
    const xml = "Example:\n\n```xml\n<data>" + SET_JSON + "</data>\n```";
    expect(kindTextToMarkdown(xml)).toBe(xml);
    const ts = "```ts\nconst x = " + SET_JSON + ";\n```";
    expect(kindTextToMarkdown(ts)).toBe(ts);
  });
});

describe("kindTextPreview (compact, possibly streaming)", () => {
  it("a complete kind previews as markdown", () => {
    const p = kindTextPreview(SET_JSON);
    expect(p.text).not.toContain("__kind");
    expect(p.pendingKind).toBeNull();
  });

  it("a kind still arriving is cut and named, never shown raw", () => {
    const partial = 'Here you go:\n\n```json\n{"__kind": "flashcard_set", "title": "Cell bi';
    const p = kindTextPreview(partial);
    expect(p.text).toBe("Here you go:");
    expect(p.pendingKind).toBe("flashcard_set");
  });

  it("a nested arriving kind cuts at its outermost object", () => {
    const p = kindTextPreview('Intro {"title": "x", "items": [{"__kind": "flash');
    expect(p.text).toBe("Intro");
    expect(p.pendingUnnamed).toBe(true);
  });

  it("kindless text is unchanged", () => {
    expect(kindTextPreview("Just text").text).toBe("Just text");
  });
});
