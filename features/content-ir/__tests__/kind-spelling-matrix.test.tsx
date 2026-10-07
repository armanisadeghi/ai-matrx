/**
 * THE SPELLING MATRIX (kind-never-raw round 8). The key `__kind` can be
 * spelled many ways a reader still sees as `__kind` (owner ruling): literal,
 * `_`-escaped, markdown-escaped `\_\_kind`, backslash-escaped quotes
 * `\"__kind\"`, a zero-width character inside the key, Python repr
 * `'__kind'`, typographic quotes `“__kind”` and HTML entities
 * `&quot;__kind&quot;`. Every detector, converter and label function runs
 * the ONE spelling normalizer (`normalizeKindSpellings` /
 * `hasKindKeyAnySpelling`), so every cell of this table must hold:
 *
 *   SPELLINGS × DETECTORS  — each detector SEES the kind
 *   SPELLINGS × CONVERTERS — no raw key in the output, and the kind is named
 *   SPELLINGS × RENDER     — the real accumulator streamed char by char and
 *                            the reload splitter, every frame judged by the
 *                            DOM frame judge; settled live = reload
 *
 * Adding a spelling or a consumer is ONE line in its table. The self-test
 * proves a converter that skips the normalizer turns the matrix red.
 *
 * Round 9 (DO NO HARM): realistic COMBINATIONS run through every table too;
 * every converter and render cell must keep the text after the kind
 * ("Enjoy.") — a converter never hides text; a FALSE-POSITIVE table (prose
 * that mentions the key, code spans, ZWJ emoji, soft hyphens) must come out
 * exactly as written; EXOTIC spellings are DETECTION ONLY (the sentinel and
 * the judge report them, nothing converts them).
 *
 * Round 10 (THE BOUNDARY, supersedes rounds 8–9 on spellings): only REAL JSON
 * converts — literal, `\u005f`, markdown-escaped, zero-width inside the key
 * (the CONVERSION tables). Every other spelling in free text (backslash-
 * escaped quotes, repr, JS literal, smart quotes, entities, their
 * combinations, the exotic forms) is DETECTION ONLY: the sentinel reports it,
 * and every converter, label and render leaves it byte for byte as written.
 */
// eslint-disable-next-line import/order -- the judge's mocks must register first
import { domElementVerdict, domFrameVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockRenderer";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { splitContentIntoBlocksV2 } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";
import {
  ALL_KIND_SPELLINGS,
  JSON_KIND_SPELLINGS,
  firstKindSlug,
  hasKindKey,
  hasKindKeyAnySpelling,
  jsonKindSignal,
  markdownCarriesKind,
  textCarriesKind,
  valueCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { catalogProseText, inlineKindText, nonJsonKindsAsCode } from "@/features/content-ir/surfaces/kind-one-line";
import { snippetKindText } from "@/features/content-ir/surfaces/kind-snippet-text";
import { conversationTitleText, kindTextLabel } from "@/features/content-ir/surfaces/kind-text-label";
import { kindTextPreview, kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { domLeaksKind, domShowsDetectionOnlyKind, screenTextHoldsKind } from "@/features/content-ir/surfaces/kind-leak-scan";
import { normalizeKindSpellings, scanKindSpellingRegions } from "@/features/content-ir/surfaces/json-kind-signal";
import { spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { plainTitleFromMarkdown } from "@ai-matrx/rich-content/markdown-core/plain-title";
import { publicResourceDescription, publicResourceTitle } from "@/app/(public)/p/e/publicResourceText";

jest.setTimeout(600_000);

const KIND = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ front: "What makes ATP?", back: "Mitochondria" }],
};
const JSON_TEXT = JSON.stringify(KIND);
const REPR =
  "{'__kind': 'flashcard_set', 'title': 'Cell biology', 'cards': [{'front': 'What makes ATP?', 'back': 'Mitochondria'}]}";

/** ONE LINE PER REAL-JSON SPELLING (round 10: the CONVERSION table): the whole kind, spelled that way. */
const SPELLINGS: ReadonlyArray<readonly [string, string]> = [
  ["literal", JSON_TEXT],
  ["unicode-escaped", JSON_TEXT.replace('"__kind"', '"\\u005f_kind"')],
  ["markdown-escaped", JSON_TEXT.replaceAll("_", "\\_")],
  ["zero-width", JSON_TEXT.replace('"__kind"', '"__​kind"')],
];

/** ONE LINE PER NON-JSON SPELLING (round 10: DETECTION ONLY, preserved as written). */
const NON_JSON_SPELLINGS: ReadonlyArray<readonly [string, string]> = [
  ["backslash-escaped", JSON_TEXT.replaceAll('"', '\\"')],
  ["python-repr", REPR],
  ["smart-quotes", JSON_TEXT.replace(/"([^"]*)"/g, "“$1”")],
  ["html-entities", JSON_TEXT.replaceAll('"', "&quot;")],
];

/** A string escaped as one more JSON-string level (`"` → `\"`, `\` → `\\`). */
const escapeLevel = (text: string) => text.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
const smartQuoted = (text: string) => text.replace(/"([^"]*)"/g, "\u201C$1\u201D");

/**
 * ONE LINE PER REALISTIC COMBINATION (owner ruling, round 9): realistic
 * spellings mixed in one key. Each runs through every table above.
 */
const COMBINATIONS: ReadonlyArray<readonly [string, string]> = [
  ["markdown-escaped + zero-width", JSON_TEXT.replaceAll("_", "\\_").replace("\\_\\_kind", "\\_\\_\u200Bkind")],
  ["half markdown-escaped", JSON_TEXT.replace('"__kind"', '"\\__kind"')],
];

/** Non-JSON COMBINATIONS (round 10: detection only, preserved as written). */
const NON_JSON_COMBINATIONS: ReadonlyArray<readonly [string, string]> = [
  ["escaped + zero-width", escapeLevel(JSON_TEXT).replace("__kind", "__\u200Bkind")],
  ["python-repr + zero-width", REPR.replace("__kind", "__\u200Bkind")],
  ["smart-quotes + zero-width", smartQuoted(JSON_TEXT).replace("__kind", "__\u200Dkind")],
  ["escaped + markdown-escaped", escapeLevel(JSON_TEXT.replaceAll("_", "\\_"))],
  ["escaped two levels", escapeLevel(escapeLevel(JSON_TEXT))],
  ["escaped three levels", escapeLevel(escapeLevel(escapeLevel(JSON_TEXT)))],
  ["escaped key, spaced colon", escapeLevel(JSON_TEXT).replace('\\"__kind\\":', '\\"__kind\\" :')],
  ["python key, JSON values", JSON_TEXT.replace('"__kind"', "'__kind'")],
  ["entity-encoded python repr", REPR.replaceAll("'", "&#39;")],
  ["JavaScript literal (Node console)", "{ __kind: 'flashcard_set', title: 'Cell biology', cards: [ { front: 'What makes ATP?', back: 'Mitochondria' } ] }"],
  ["JavaScript literal (double quotes)", '{__kind: "flashcard_set", title: "Cell biology", cards: [{front: "What makes ATP?", back: "Mitochondria"}]}'],
];

/** Every REAL-JSON spelling (the conversion tables): singles and combinations. */
const REALISTIC: ReadonlyArray<readonly [string, string]> = [...SPELLINGS, ...COMBINATIONS];

const prose = (spelled: string) => `Here are your cards: ${spelled} Enjoy.`;

/** ONE LINE PER DETECTOR: must SEE the kind (prose or whole text). */
const DETECTORS: ReadonlyArray<readonly [string, (spelled: string) => boolean]> = [
  ["hasKindKeyAnySpelling", (s) => hasKindKeyAnySpelling(prose(s))],
  ["markdownCarriesKind", (s) => markdownCarriesKind(prose(s))],
  ["textCarriesKind", (s) => textCarriesKind(prose(s))],
  ["valueCarriesKind", (s) => valueCarriesKind({ answer: prose(s) })],
  ["jsonKindSignal", (s) => jsonKindSignal(s, JSON_KIND_SPELLINGS) === "kind"],
  ["firstKindSlug", (s) => firstKindSlug(prose(s), JSON_KIND_SPELLINGS) === "flashcard_set"],
  ["screenTextHoldsKind (sentinel)", (s) => screenTextHoldsKind(prose(s))],
  [
    "domLeaksKind (judge)",
    (s) => {
      const div = document.createElement("div");
      div.textContent = prose(s);
      return domLeaksKind(div);
    },
  ],
];

/**
 * ONE LINE PER CONVERTER: text in, readable text out. A one-line LABEL of
 * prose is the prose's first line ("Here are your cards:"), so label
 * converters read the WHOLE spelled kind, where the label must name it.
 */
type Converter = (spelled: string) => string;
const CONVERTERS: ReadonlyArray<readonly [string, Converter]> = [
  ["snippetKindText (search preview)", (s) => snippetKindText(prose(s))],
  ["kindTextToMarkdown (export)", (s) => kindTextToMarkdown(prose(s))],
  ["kindTextPreview", (s) => kindTextPreview(prose(s)).text],
  ["kindTextLabel", (s) => kindTextLabel(s)],
  ["conversationTitleText (title)", (s) => conversationTitleText(s) ?? ""],
  ["catalogProseText", (s) => catalogProseText(prose(s))],
  ["inlineKindText", (s) => inlineKindText(prose(s))],
  ["publicResourceTitle", (s) => publicResourceTitle(s)],
  ["publicResourceDescription", (s) => publicResourceDescription(s) ?? ""],
  ["plainTitleFromMarkdown", (s) => plainTitleFromMarkdown(s)],
];

/** An independent oracle (not the code under test): any spelling of the key left in the output. */
function holdsRawKey(out: string): boolean {
  const plain = out
    .replace(/[​-‍⁠﻿­]/g, "")
    .replace(/&(?:quot|#0*34|#[xX]0*22);/g, '"')
    .replace(/&(?:apos|#0*39|#[xX]0*27);/g, "'");
  return /(?:_|\\_|\\u005[fF]){2}kind/.test(plain);
}

/** Whether a converter's cell fails for a spelling (raw key, or the kind not named). */
function converterCellFails(convert: Converter, spelled: string): string | null {
  const out = convert(spelled);
  if (holdsRawKey(out)) return `raw key: ${out.slice(0, 160)}`;
  if (!/Cell biology|Flashcard/i.test(out)) return `kind not named: ${out.slice(0, 160)}`;
  return null;
}

/** Converters fed the PROSE (not the bare kind): the text around the kind must survive. */
const PROSE_CONVERTERS = new Set([
  "snippetKindText (search preview)",
  "kindTextToMarkdown (export)",
  "kindTextPreview",
  "catalogProseText",
  "inlineKindText",
]);

describe("spelling matrix — detectors", () => {
  const cells = REALISTIC.flatMap(([spelling, spelled]) =>
    DETECTORS.map(([name, detect]) => [`${spelling} × ${name}`, detect, spelled] as const),
  );
  it.each(cells)("%s sees the kind", (_cell, detect, spelled) => {
    expect(detect(spelled)).toBe(true);
  });
});

describe("spelling matrix — converters", () => {
  const cells = REALISTIC.flatMap(([spelling, spelled]) =>
    CONVERTERS.map(([name, convert]) => [`${spelling} × ${name}`, convert, spelled] as const),
  );
  it.each(cells)("%s shows no raw key", (_cell, convert, spelled) => {
    expect(converterCellFails(convert, spelled)).toBeNull();
  });

  const proseCells = REALISTIC.flatMap(([spelling, spelled]) =>
    CONVERTERS.filter(([name]) => PROSE_CONVERTERS.has(name)).map(
      ([name, convert]) => [`${spelling} × ${name}`, convert, spelled] as const,
    ),
  );
  it.each(proseCells)("%s never hides the text around the kind", (_cell, convert, spelled) => {
    const out = convert(spelled);
    expect(out).toContain("Here are your cards");
    expect(out).toContain("Enjoy.");
  });
});

describe("spelling matrix — self-test", () => {
  it("a converter that skips the normalizer turns the matrix red", () => {
    // The pre-round-8 shape: decide on the literal key alone.
    const skipsNormalizer: Converter = (s) => (hasKindKey(s) ? kindTextLabel(s) : s);
    const red = SPELLINGS.filter(([, spelled]) => converterCellFails(skipsNormalizer, spelled) !== null).map(
      ([spelling]) => spelling,
    );
    expect(red).toEqual(expect.arrayContaining(["markdown-escaped"]));
    expect(red).not.toContain("literal");
  });

  it("a detector that skips the normalizer turns the matrix red", () => {
    const red = SPELLINGS.filter(([, spelled]) => !hasKindKey(prose(spelled))).map(([spelling]) => spelling);
    expect(red).toEqual(["markdown-escaped"]);
  });
});

// ── The rendered chat prose path: live (char by char) and reload ──────────

function streamFrames(text: string, requestId: string) {
  const frames: Array<{ block: RenderBlockPayload; active: boolean }> = [];
  let finalizing = false;
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    frames.push({ block: (payload as { block: RenderBlockPayload }).block, active: !finalizing });
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const ch of text) accumulator.ingest(ch, dispatch);
  finalizing = true;
  accumulator.finalize(dispatch);
  return frames;
}

async function reloadText(text: string): Promise<string> {
  const parts: string[] = [];
  for (const [index, block] of splitContentIntoBlocksV2(text).entries()) {
    const verdict = await domElementVerdict(
      React.createElement(BlockRenderer, {
        block: block as never,
        index,
        isStreamActive: false,
        replaceBlockContent: () => undefined,
        handleOpenEditor: () => undefined,
      }),
    );
    if (verdict.raw) throw new Error(`reload drew a raw kind: ${verdict.text.slice(0, 200)}`);
    parts.push(verdict.text);
  }
  return parts.join("");
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** What the reload draws, raw or not (a false positive may be judged; its words must all be there). */
async function drawnText(text: string): Promise<string> {
  const parts: string[] = [];
  for (const [index, block] of splitContentIntoBlocksV2(text).entries()) {
    const verdict = await domElementVerdict(
      React.createElement(BlockRenderer, {
        block: block as never,
        index,
        isStreamActive: false,
        replaceBlockContent: () => undefined,
        handleOpenEditor: () => undefined,
      }),
    );
    parts.push(verdict.text);
  }
  return parts.join(" ");
}

describe("spelling matrix — rendered chat prose (live char-by-char + reload)", () => {
  it.each(REALISTIC)("%s: no frame draws it raw, and settled live = reload", async (spelling, spelled) => {
    const answer = prose(spelled);
    const frames = streamFrames(answer, `req-spelling-${spelling}`);
    const leaks: string[] = [];
    for (const { block, active } of frames) {
      const verdict = await domFrameVerdict(block, { isStreamActive: active });
      if (verdict.raw) leaks.push(`${block.content?.length} chars: ${verdict.text.slice(-120)}`);
    }
    expect(leaks).toEqual([]);

    const settled = new Map<string, RenderBlockPayload>();
    for (const { block } of frames) settled.set(block.blockId, block);
    const live: string[] = [];
    for (const block of [...settled.values()].sort((a, b) => a.blockIndex - b.blockIndex)) {
      const verdict = await domFrameVerdict(block, { isStreamActive: false });
      expect(verdict.raw).toBe(false);
      live.push(verdict.text);
    }
    const liveText = squash(live.join(""));
    // Lifted spellings draw the kind (its cards); unparseable ones its one-line label.
    expect(liveText).toMatch(/What makes ATP|Cell biology[_*\s]*· Flashcard/i);
    // Never hides text: the words around the kind are on screen.
    expect(liveText).toContain("Here are your cards");
    expect(liveText).toContain("Enjoy.");
    expect(liveText).toBe(squash(await reloadText(answer)));
  });
});

describe("spelling matrix — content-fed RichContent", () => {
  it.each(REALISTIC)("%s: RichContent never draws it raw", async (_spelling, spelled) => {
    const verdict = await domElementVerdict(
      React.createElement(RichContent, { level: "full", imagePolicy: "ai", source: prose(spelled) }),
    );
    expect(verdict.raw).toBe(false);
    expect(squash(verdict.text)).toMatch(/What makes ATP|Cell biology[_*\s]*· Flashcard/i);
  });
});

// ── Round 9: false positives, never-hides-text, exotic detection ──────────

/**
 * ONE LINE PER FALSE POSITIVE: text that is NOT a kind region must come out
 * of every converter and the prose reader EXACTLY as written, and render with
 * every word (code-span backticks aside).
 */
const FALSE_POSITIVES: ReadonlyArray<readonly [string, string]> = [
  ["prose mentions the key", 'To declare one, add a "__kind": "flashcard_set" key to the object. Zanzibar.'],
  ["bare word", "The __kind field names the shape. Zanzibar."],
  ["code span, literal", 'Use `{"__kind": "flashcard_set"}` to declare it. Zanzibar.'],
  ["code span, escaped", 'The escaped form is `{\\"__kind\\":\\"note\\"}` in logs. Zanzibar.'],
  ["code span, python repr", "In Python, `{'__kind': 'note'}` is a dict. Zanzibar."],
  ["ZWJ emoji and soft hyphen", "Family \u{1F468}\u200D\u{1F469}\u200D\u{1F467} trip, co\u00ADoperate, word\u200Bbreak. Zanzibar."],
  ["prose braces, escaped mention after", 'I like {braces}. The log said \\"__kind\\": \\"note\\" earlier. Zanzibar.'],
  ["math braces", "We can't simplify $\\frac{a}{b}$ so let's keep {the} braces kind of. Zanzibar."],
];

describe("spelling matrix — false positives come out exactly as written", () => {
  it.each(FALSE_POSITIVES)("%s", async (_name, text) => {
    expect(spelledKindsAsOneLine(text)).toBe(text);
    expect(normalizeKindSpellings(text)).toBe(text);
    expect(inlineKindText(text)).toBe(text);
    expect(snippetKindText(text)).toBe(text);
    const drawn = squash(await drawnText(text));
    // Every prose word survives the render (code spans are source views the
    // judge does not read; markdown punctuation aside).
    const proseWords = text.replace(/`[^`]*`/g, " ").replace(/[$\\{}"]/g, " ").split(/\s+/);
    for (const word of proseWords.filter((w) => /^[A-Za-z]{4,}\.?$/.test(w))) {
      expect(drawn).toContain(word.replace(/\.$/, ""));
    }
  });

  it("a zero-width character OUTSIDE the key is never touched (H-2)", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    const text = `Family ${family} and soft\u00ADhyphen and \`co\u200Bde\` then {"__\u200Bkind":"note","title":"Hi"} end`;
    for (const out of [normalizeKindSpellings(text), kindTextToMarkdown(text), snippetKindText(text), inlineKindText(text), spelledKindsAsOneLine(text)]) {
      expect(out).toContain(family);
      expect(out).toContain("soft\u00ADhyphen");
      expect(out).toContain("co\u200Bde");
    }
    // The key itself still reads through its zero-width character.
    expect(normalizeKindSpellings(text)).toContain('{"__kind":"note"');
  });
});

/**
 * ONE LINE PER EXOTIC SPELLING (owner ruling, round 9): DETECTION ONLY. The
 * sentinel and the frame judge report each; no renderer converts them, so no
 * conversion is asserted.
 */
const EXOTIC: ReadonlyArray<readonly [string, string]> = [
  ["double HTML entities", JSON_TEXT.replaceAll('"', "&amp;quot;")],
  ["&#95; underscores", JSON_TEXT.replace("__kind", "&#95;&#95;kind")],
  ["upper-case entities", JSON_TEXT.replaceAll('"', "&QUOT;")],
  ["padded hex entities", JSON_TEXT.replaceAll('"', "&#x00022;")],
  ["fullwidth quotes", JSON_TEXT.replaceAll('"', "\uFF02")],
  ["bidi mark in the key", JSON_TEXT.replace("__kind", "__\u200Ekind")],
  ["invisible operator in the key", JSON_TEXT.replace("__kind", "_\u2062_kind")],
  ["combining grapheme joiner in the key", JSON_TEXT.replace("__kind", "__\u034Fkind")],
];

// ── Round 10: every non-JSON spelling is DETECTION ONLY + preserved as written ──

/** Every detection-only spelling: the non-JSON singles, their combinations, the exotic forms. */
const DETECTION_ONLY: ReadonlyArray<readonly [string, string]> = [...NON_JSON_SPELLINGS, ...NON_JSON_COMBINATIONS, ...EXOTIC];

/** ONE LINE PER TEXT CONVERTER: prose in, the prose out byte for byte when its kind is not JSON. */
const AS_WRITTEN_PROSE: ReadonlyArray<readonly [string, Converter]> = [
  ["prose leaf (spelledKindsAsOneLine)", (t) => spelledKindsAsOneLine(t)],
  ["normalizeKindSpellings", (t) => normalizeKindSpellings(t)],
  ["snippetKindText (search preview)", (t) => snippetKindText(t)],
  ["kindTextToMarkdown (export)", (t) => kindTextToMarkdown(t)],
  ["kindTextPreview", (t) => kindTextPreview(t).text],
  ["catalogProseText", (t) => catalogProseText(t)],
  ["inlineKindText", (t) => inlineKindText(t)],
];
/** ONE LINE PER LABEL: the spelled text in, at most clipped (never rewritten). */
const AS_WRITTEN_LABELS: ReadonlyArray<readonly [string, Converter]> = [
  ["kindTextLabel", (t) => kindTextLabel(t, 10_000)],
  ["conversationTitleText (title)", (t) => conversationTitleText(t) ?? ""],
  ["publicResourceTitle", (t) => publicResourceTitle(t)],
  ["publicResourceDescription", (t) => publicResourceDescription(t) ?? ""],
];

/** A converter cell fails when the spelled text is not in the output exactly as written. */
function asWrittenCellFails(convert: Converter, text: string, label: boolean): string | null {
  const out = convert(text);
  if (label) {
    // A label formats text (clip, title cleanup); a detection-only kind must get
    // exactly the treatment of the same text with no kind in it.
    const kindless = convert(text.replaceAll("kind", "kinx")).replaceAll("kinx", "kind");
    return out === kindless ? null : `rewritten: ${out.slice(0, 160)} ≠ ${kindless.slice(0, 160)}`;
  }
  return out.includes(text) ? null : `rewritten: ${out.slice(0, 160)}`;
}

describe("spelling matrix — detection only: the sentinel reports it, the judge does not fail it", () => {
  it.each(DETECTION_ONLY)("%s", (_name, spelled) => {
    expect(screenTextHoldsKind(prose(spelled))).toBe(true);
    const div = document.createElement("div");
    div.textContent = prose(spelled);
    expect(domLeaksKind(div)).toBe(false);
    expect(domShowsDetectionOnlyKind(div)).toBe(true);
  });
});

describe("spelling matrix — detection only: every converter and label leaves it as written", () => {
  const cells = DETECTION_ONLY.flatMap(([spelling, spelled]) => [
    ...AS_WRITTEN_PROSE.map(([name, convert]) => [`${spelling} × ${name}`, convert, prose(spelled), false] as const),
    ...AS_WRITTEN_LABELS.map(([name, convert]) => [`${spelling} × ${name}`, convert, spelled, true] as const),
  ]);
  it.each(cells)("%s", (_cell, convert, text, label) => {
    expect(asWrittenCellFails(convert, text, label)).toBeNull();
  });

  it("self-test: a converter that rewrites a non-JSON spelling turns the table red", () => {
    // The round-8/9 shape: every spelling's region read as a label.
    const rewrites: Converter = (t) => {
      let out = t;
      for (const region of scanKindSpellingRegions(t, { families: "all" }).reverse()) {
        out = out.slice(0, region.start) + "Flashcard Set" + out.slice(region.end);
      }
      return out;
    };
    const red = NON_JSON_SPELLINGS.filter(([, spelled]) => asWrittenCellFails(rewrites, prose(spelled), false) !== null);
    expect(red.map(([name]) => name)).toEqual(NON_JSON_SPELLINGS.map(([name]) => name));
  });
});

describe("spelling matrix — detection only: rendered live (char by char) and reloaded byte for byte", () => {
  it.each(DETECTION_ONLY)("%s", async (spelling, spelled) => {
    const answer = prose(spelled);
    const frames = streamFrames(answer, `req-as-written-${spelling}`);
    const settled = new Map<string, RenderBlockPayload>();
    for (const { block } of frames) settled.set(block.blockId, block);
    const live: string[] = [];
    for (const block of [...settled.values()].sort((a, b) => a.blockIndex - b.blockIndex)) {
      const verdict = await domFrameVerdict(block, { isStreamActive: false });
      expect(verdict.raw).toBe(false);
      live.push(verdict.text);
    }
    const reload = squash(await reloadText(answer));
    expect(squash(live.join(""))).toBe(reload);
    // Byte for byte as written — as an inline code span, a source view the
    // judge does not read — and still visible to the sentinel in the source.
    expect(nonJsonKindsAsCode(answer)).toContain(spelled);
    expect(screenTextHoldsKind(answer)).toBe(true);
  });
});
