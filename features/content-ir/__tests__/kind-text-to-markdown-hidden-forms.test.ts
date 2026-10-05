/**
 * Y6 (kind never raw): kindTextToMarkdown never leaves raw kind JSON for a
 * person — not inside an HTML comment, not as front matter, not when its key is
 * written escaped and the text is cut off, and not when `__kind` is not a slug.
 * Every form is tested with LF and CRLF.
 */
import { kindTextPreview, kindTextToMarkdown } from "../surfaces/kind-text-to-markdown";

const SET = { __kind: "flashcard_set", title: "Cell biology", cards: [] };
const SET_JSON = JSON.stringify(SET);
const UNREADABLE = "Structured output could not be read";

const eol = (text: string, crlf: boolean) => (crlf ? text.replace(/\n/g, "\r\n") : text);

describe.each([
  ["LF", false],
  ["CRLF", true],
])("%s", (_name, crlf) => {
  it("a kind inside an HTML comment reads as the kind", () => {
    const md = kindTextToMarkdown(eol(`Intro\n\n<!-- ${SET_JSON} -->\n\nOutro`, crlf));
    expect(md).not.toContain("__kind");
    expect(md).toContain("# Cell biology");
    expect(md).toContain("Intro");
    expect(md).toContain("Outro");
  });

  it("a multi-line comment and an unclosed comment read as the kind too", () => {
    const multi = kindTextToMarkdown(eol(`Intro\n<!--\n${SET_JSON}\n-->\nOutro`, crlf));
    expect(multi).not.toContain("__kind");
    expect(multi).toContain("# Cell biology");
    const open = kindTextToMarkdown(eol(`Intro\n<!-- ${SET_JSON}\n`, crlf));
    expect(open).not.toContain("__kind");
  });

  it("a kind written as front matter reads as the kind", () => {
    const md = kindTextToMarkdown(eol(`---\n${SET_JSON}\n---\nBody text`, crlf));
    expect(md).not.toContain("__kind");
    expect(md).toContain("# Cell biology");
    expect(md).toContain("Body text");
  });

  it("a cut-off kind with an escaped key is a one-line note, never the fragment", () => {
    const cut = eol(`Hi\n\n{"\\u005f_kind":"flashcard_set","title":"Ce`, crlf);
    const md = kindTextToMarkdown(cut);
    expect(md).not.toMatch(/u005f|__kind|flashcard_set"/);
    expect(md).toContain("Hi");
    expect(md).toMatch(/did not finish/);
    const preview = kindTextPreview(cut);
    expect(preview.text).toBe("Hi");
    expect(preview.pendingKind).toBe("flashcard_set");
  });

  it.each([
    ["a number", '{"__kind": 5, "a": 1}'],
    ["null", '{"__kind": null, "a": 1}'],
    ["empty", '{"__kind": "", "a": 1}'],
    ["a non-slug", '{"__kind": "not a slug!", "a": 1}'],
    ["a list", '{"__kind": ["x"], "a": 1}'],
  ])("a kind whose __kind is %s is a one-line unreadable note", (_label, json) => {
    expect(kindTextToMarkdown(eol(json, crlf))).toBe(UNREADABLE);
    const inProse = kindTextToMarkdown(eol(`Before\n\n${json}\n\nAfter`, crlf));
    expect(inProse).not.toContain("__kind");
    expect(inProse).toContain(UNREADABLE);
    expect(inProse).toContain("Before");
    expect(inProse).toContain("After");
    const fenced = kindTextToMarkdown(eol(`Before\n\n\`\`\`json\n${json}\n\`\`\`\n\nAfter`, crlf));
    expect(fenced).not.toContain("__kind");
    expect(fenced).toContain(UNREADABLE);
  });
});

describe("what stays as written", () => {
  it("kindless text and kindless JSON are untouched", () => {
    expect(kindTextToMarkdown("<!-- a note -->\nHello")).toBe("<!-- a note -->\nHello");
    expect(kindTextToMarkdown('{"a": 1}')).toBe('{"a": 1}');
  });
  it("inline code quoting a kind key is quoted source and stays", () => {
    const text = 'The key is `{"__kind": 5}` in the file.';
    expect(kindTextToMarkdown(text)).toBe(text);
  });
  it("a valid kind is unchanged by the new passes", () => {
    expect(kindTextToMarkdown(SET_JSON)).toContain("# Cell biology");
  });
});
