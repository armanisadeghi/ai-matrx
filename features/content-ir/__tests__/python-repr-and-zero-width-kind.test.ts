/**
 * @jest-environment jsdom
 *
 * K4 (kind-never-raw round 7): two spellings the screen still reads as a kind
 * slipped past both detectors —
 *   1. a Python repr, `{'__kind': 'flashcard_set', …}` (what `str(dict)` puts
 *      in a server error or a tool's string result), in TEXT contexts;
 *   2. a zero-width character inside the key (`"__​kind"`).
 * The shared detector reads both, the screen scan (sentinel + frame judge)
 * flags both, and the markdown / one-line / search-snippet converters convert
 * both like any other kind.
 */
import {
  firstKindSlug,
  hasKindKey,
  markdownCarriesKind,
  normalizeKindSpellings,
  textCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { domLeaksKind, domShowsDetectionOnlyKind, screenKindSlug, screenTextHoldsKind } from "@/features/content-ir/surfaces/kind-leak-scan";
import { kindTextPreview, kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { inlineKindText } from "@/features/content-ir/surfaces/kind-one-line";
import { snippetKindText } from "@/features/content-ir/surfaces/kind-snippet-text";

const PY = "{'__kind': 'flashcard_set', 'title': 'Cell biology', 'cards': [{'front': 'Mitochondria', 'back': \"Makes ATP, it's busy\"}], 'shuffle': True, 'deck': None}";
const PY_ERROR = `Tool failed: could not save ${PY} (validation)`;
const ZW = '{"__​kind":"flashcard_set","title":"Cell biology","cards":[{"front":"Mitochondria","back":"Makes ATP"}]}';
const ZW_PROSE = `Here are your cards: ${ZW}`;

describe("the shared detector", () => {
  it("reads a zero-width character inside the key", () => {
    expect(hasKindKey(ZW)).toBe(true);
    expect(firstKindSlug(ZW)).toBe("flashcard_set");
    expect(textCarriesKind(ZW_PROSE)).toBe(true);
  });

  it("reads a Python-repr key in text contexts", () => {
    expect(hasKindKey(PY, { python: true })).toBe(true);
    expect(firstKindSlug(PY, { python: true })).toBe("flashcard_set");
  });

  // Round 10 (302f4ceed7, 11ec229496): only REAL JSON is converted/lifted; a Python repr in
  // free text is DETECTION ONLY — the sentinel reports it, no reader lifts or rewrites it.
  it("a Python repr in prose is detection only: never lifted as a markdown/text kind region", () => {
    expect(markdownCarriesKind(PY_ERROR)).toBe(false);
    expect(textCarriesKind(PY_ERROR)).toBe(false);
  });

  it("never reads a Python repr as a JSON key (parsed-JSON contexts)", () => {
    expect(hasKindKey(PY)).toBe(false);
  });

  it("prose that names the key is not one", () => {
    expect(markdownCarriesKind("Set the '__kind': field to the shape name.")).toBe(false);
    expect(markdownCarriesKind("A Python repr in quoted source: `{'__kind': 'x'}`")).toBe(false);
  });
});

describe("the screen scan (sentinel + frame judge)", () => {
  it("reports a Python repr drawn as text as detection only (sentinel yes, frame judge no)", () => {
    expect(screenTextHoldsKind(PY_ERROR)).toBe(true);
    expect(screenKindSlug(PY_ERROR)).toBe("flashcard_set");
    const p = document.createElement("p");
    p.textContent = PY_ERROR;
    expect(domLeaksKind(p)).toBe(false);
    expect(domShowsDetectionOnlyKind(p)).toBe(true);
  });

  it.each([
    ["zero-width key", ZW_PROSE],
  ])("flags a %s drawn as text", (_name, text) => {
    expect(screenTextHoldsKind(text)).toBe(true);
    expect(screenKindSlug(text)).toBe("flashcard_set");
    const p = document.createElement("p");
    p.textContent = text;
    expect(domLeaksKind(p)).toBe(true);
  });

  it("reports a Python repr in a title attribute as detection only", () => {
    const span = document.createElement("span");
    span.setAttribute("title", PY);
    expect(domLeaksKind(span)).toBe(false);
    expect(domShowsDetectionOnlyKind(span)).toBe(true);
  });

  it.each([
    ["zero-width key", ZW],
  ])("flags a %s in a title attribute", (_name, text) => {
    const span = document.createElement("span");
    span.setAttribute("title", text);
    expect(domLeaksKind(span)).toBe(true);
  });
});

describe("the converters: a zero-width key is a kind, a Python repr is left as written", () => {
  it("Python repr: every converter leaves the words exactly as written (round 10)", () => {
    expect(kindTextToMarkdown(PY_ERROR)).toBe(PY_ERROR);
    expect(inlineKindText(PY_ERROR, { plain: true })).toBe(PY_ERROR);
    expect(snippetKindText(PY_ERROR)).toBe(PY_ERROR);
  });

  it.each([
    ["zero-width key", ZW_PROSE],
  ])("markdown: %s", (_name, text) => {
    const md = kindTextToMarkdown(text);
    expect(md).not.toMatch(/__​?kind/);
    expect(md).toContain("Mitochondria");
    expect(kindTextPreview(text).text).not.toMatch(/__​?kind/);
  });

  it.each([
    ["zero-width key", ZW_PROSE],
  ])("one line: %s", (_name, text) => {
    const line = inlineKindText(text, { plain: true });
    expect(line).not.toMatch(/__​?kind/);
    expect(line).toContain("Flashcard Set");
  });

  it.each([
    ["zero-width key", ZW_PROSE],
  ])("search snippet: %s", (_name, text) => {
    const snippet = snippetKindText(text);
    expect(snippet).not.toMatch(/__​?kind/);
    expect(snippet).toContain("Flashcard Set");
  });

  it("kindless text and JSON holding a repr as a string VALUE come back unchanged", () => {
    const plain = "Nothing structured here, just {'a': 1} in prose.";
    expect(normalizeKindSpellings(plain)).toBe(plain);
    const json = JSON.stringify({ error: PY });
    expect(normalizeKindSpellings(json)).toBe(json);
  });
});
