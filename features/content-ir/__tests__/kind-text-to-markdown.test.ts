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
