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
 */
// eslint-disable-next-line import/order -- the judge's mocks must register first
import { domElementVerdict, domFrameVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import {
  ALL_KIND_SPELLINGS,
  firstKindSlug,
  hasKindKey,
  hasKindKeyAnySpelling,
  jsonKindSignal,
  markdownCarriesKind,
  textCarriesKind,
  valueCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { catalogProseText, inlineKindText } from "@/features/content-ir/surfaces/kind-one-line";
import { snippetKindText } from "@/features/content-ir/surfaces/kind-snippet-text";
import { conversationTitleText, kindTextLabel } from "@/features/content-ir/surfaces/kind-text-label";
import { kindTextPreview, kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { domLeaksKind, screenTextHoldsKind } from "@/features/content-ir/surfaces/kind-leak-scan";
import { kindCell } from "@/features/data-tables/utils/kind-cell";
import { plainTitleFromMarkdown } from "@/components/markdown-core/plain-title";
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

/** ONE LINE PER SPELLING: the whole kind, spelled that way. */
const SPELLINGS: ReadonlyArray<readonly [string, string]> = [
  ["literal", JSON_TEXT],
  ["unicode-escaped", JSON_TEXT.replace('"__kind"', '"\\u005f_kind"')],
  ["markdown-escaped", JSON_TEXT.replaceAll("_", "\\_")],
  ["backslash-escaped", JSON_TEXT.replaceAll('"', '\\"')],
  ["zero-width", JSON_TEXT.replace('"__kind"', '"__​kind"')],
  ["python-repr", REPR],
  ["smart-quotes", JSON_TEXT.replace(/"([^"]*)"/g, "“$1”")],
  ["html-entities", JSON_TEXT.replaceAll('"', "&quot;")],
];

const prose = (spelled: string) => `Here are your cards: ${spelled} Enjoy.`;

/** ONE LINE PER DETECTOR: must SEE the kind (prose or whole text). */
const DETECTORS: ReadonlyArray<readonly [string, (spelled: string) => boolean]> = [
  ["hasKindKeyAnySpelling", (s) => hasKindKeyAnySpelling(prose(s))],
  ["markdownCarriesKind", (s) => markdownCarriesKind(prose(s))],
  ["textCarriesKind", (s) => textCarriesKind(prose(s))],
  ["valueCarriesKind", (s) => valueCarriesKind({ answer: prose(s) })],
  ["jsonKindSignal", (s) => jsonKindSignal(s, ALL_KIND_SPELLINGS) === "kind"],
  ["firstKindSlug", (s) => firstKindSlug(prose(s), ALL_KIND_SPELLINGS) === "flashcard_set"],
  ["screenTextHoldsKind (sentinel)", (s) => screenTextHoldsKind(prose(s))],
  [
    "domLeaksKind (judge)",
    (s) => {
      const div = document.createElement("div");
      div.textContent = prose(s);
      return domLeaksKind(div);
    },
  ],
  ["kindCell", (s) => kindCell(s)?.state === "kind"],
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

describe("spelling matrix — detectors", () => {
  const cells = SPELLINGS.flatMap(([spelling, spelled]) =>
    DETECTORS.map(([name, detect]) => [`${spelling} × ${name}`, detect, spelled] as const),
  );
  it.each(cells)("%s sees the kind", (_cell, detect, spelled) => {
    expect(detect(spelled)).toBe(true);
  });
});

describe("spelling matrix — converters", () => {
  const cells = SPELLINGS.flatMap(([spelling, spelled]) =>
    CONVERTERS.map(([name, convert]) => [`${spelling} × ${name}`, convert, spelled] as const),
  );
  it.each(cells)("%s shows no raw key", (_cell, convert, spelled) => {
    expect(converterCellFails(convert, spelled)).toBeNull();
  });
});

describe("spelling matrix — self-test", () => {
  it("a converter that skips the normalizer turns the matrix red", () => {
    // The pre-round-8 shape: decide on the literal key alone.
    const skipsNormalizer: Converter = (s) => (hasKindKey(s) ? kindTextLabel(s) : s);
    const red = SPELLINGS.filter(([, spelled]) => converterCellFails(skipsNormalizer, spelled) !== null).map(
      ([spelling]) => spelling,
    );
    expect(red).toEqual(
      expect.arrayContaining(["markdown-escaped", "backslash-escaped", "python-repr", "smart-quotes", "html-entities"]),
    );
    expect(red).not.toContain("literal");
  });

  it("a detector that skips the normalizer turns the matrix red", () => {
    const red = SPELLINGS.filter(([, spelled]) => !hasKindKey(prose(spelled))).map(([spelling]) => spelling);
    expect(red.length).toBeGreaterThanOrEqual(5);
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

describe("spelling matrix — rendered chat prose (live char-by-char + reload)", () => {
  it.each(SPELLINGS)("%s: no frame draws it raw, and settled live = reload", async (spelling, spelled) => {
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
    expect(liveText).toBe(squash(await reloadText(answer)));
  });
});
