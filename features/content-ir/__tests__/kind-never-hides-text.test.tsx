/**
 * A KIND NEVER HIDES TEXT (kind-never-raw round 9, owner ruling 1: do no
 * harm). An object that opens a kind and never closes — cut off, or simply
 * followed by more prose (`Example: {\"__kind\":\"note\", and then the rest of
 * my answer…`) — ends where its own grammar breaks: its one-line label, then
 * every word after it, on screen. Round 8 swallowed the rest of the message
 * (H-1), and a literal key drew raw on reload while live showed only the
 * title (L-4). Each row is one realistic spelling cut after its first value;
 * the sentence after it must survive every prose converter, the reload, and
 * the live stream (char by char), and live must read like reload.
 */
// eslint-disable-next-line import/order -- the judge's mocks must register first
import { domElementVerdict, domFrameVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";
import { catalogProseText, inlineKindText, spelledKindsAsOneLine, nonJsonKindsAsCode } from "@/features/content-ir/surfaces/kind-one-line";
import { snippetKindText } from "@/features/content-ir/surfaces/kind-snippet-text";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { kindTextLabel } from "@/features/content-ir/surfaces/kind-text-label";

jest.setTimeout(600_000);

const JSON_TEXT = JSON.stringify({ __kind: "note", title: "Hi", body: "Mitochondria make ATP" });
const REPR = "{'__kind': 'note', 'title': 'Hi', 'body': 'Mitochondria make ATP'}";
const escapeLevel = (text: string) => text.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

/** The spelled object cut right after its first value's comma: it never closes. */
function unclosed(spelled: string): string {
  const at = spelled.indexOf("note");
  return spelled.slice(0, spelled.indexOf(",", at) + 1);
}

const TAIL = "and then the rest of my long answer must stay visible. Zanzibar.";

const SPELLED: ReadonlyArray<readonly [string, string]> = [
  ["literal (L-4)", JSON_TEXT],
  ["markdown-escaped", JSON_TEXT.replaceAll("_", "\\_")],
  ["zero-width key", JSON_TEXT.replace("__kind", "__​kind")],
  ["escaped", escapeLevel(JSON_TEXT)],
  ["escaped two levels", escapeLevel(escapeLevel(JSON_TEXT))],
  ["escaped three levels", escapeLevel(escapeLevel(escapeLevel(JSON_TEXT)))],
  ["python repr", REPR],
  ["smart quotes", JSON_TEXT.replace(/"([^"]*)"/g, "“$1”")],
  ["html entities", JSON_TEXT.replaceAll('"', "&quot;")],
  ["javascript literal", "{ __kind: 'note', title: 'Hi', body: 'Mitochondria make ATP' }"],
];

/** The real-JSON rows (round 10): the rest are detection only and stay as written. */
const JSON_ROWS = new Set(["literal (L-4)", "markdown-escaped", "zero-width key"]);

const CASES = SPELLED.map(([name, spelled]) => [name, `Example: ${unclosed(spelled)} ${TAIL}`] as const);

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const words = (text: string) => text.replace(/[\s_*|]+/g, "");

async function reloadText(text: string): Promise<{ text: string; raw: boolean }> {
  const parts: string[] = [];
  let raw = false;
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
    raw ||= verdict.raw;
    parts.push(verdict.text);
  }
  return { text: squash(parts.join(" ")), raw };
}

async function liveText(text: string): Promise<{ text: string; raw: boolean }> {
  const settled = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator(`req-hides-${text.length}`, (payload) => {
    const block = (payload as { block: RenderBlockPayload }).block;
    settled.set(block.blockId, block);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const ch of text) accumulator.ingest(ch, dispatch);
  accumulator.finalize(dispatch);
  const parts: string[] = [];
  let raw = false;
  for (const block of [...settled.values()].sort((a, b) => a.blockIndex - b.blockIndex)) {
    const verdict = await domFrameVerdict(block, { isStreamActive: false });
    raw ||= verdict.raw;
    parts.push(verdict.text);
  }
  return { text: squash(parts.join(" ")), raw };
}

describe("an unclosed kind never hides the text after it — prose converters", () => {
  const converters: ReadonlyArray<readonly [string, (text: string) => string]> = [
    ["spelledKindsAsOneLine (prose leaf)", spelledKindsAsOneLine],
    ["inlineKindText", (text) => inlineKindText(text)],
    ["catalogProseText", catalogProseText],
    ["kindTextToMarkdown", kindTextToMarkdown],
    ["snippetKindText", snippetKindText],
  ];
  const cells = CASES.flatMap(([name, text]) => converters.map(([c, convert]) => [`${name} × ${c}`, convert, text] as const));
  it.each(cells)("%s", (_cell, convert, text) => {
    const out = convert(text);
    expect(out).toContain("Example");
    expect(squash(out)).toContain(TAIL);
  });
});

describe("an unclosed kind never hides the text after it — rendered", () => {
  it.each(CASES)("%s: reload keeps every word, live reads like reload", async (_name, text) => {
    const reload = await reloadText(text);
    expect(reload.raw).toBe(false);
    expect(reload.text).toContain(TAIL);
    // Round 10: a real JSON spelling reads as its label; every other spelling draws exactly as written.
    if (JSON_ROWS.has(_name)) expect(reload.text).toMatch(/Note/);
    else {
      // Drawn exactly as written, as an inline code span (a source view the
      // judge does not read) — so the as-written proof is the prose source.
      const spelled = SPELLED.find(([name]) => name === _name)![1];
      expect(nonJsonKindsAsCode(text)).toContain(unclosed(spelled));
      expect(nonJsonKindsAsCode(text)).toContain(TAIL);
      expect(reload.text).toContain("Example:");
    }
    const live = await liveText(text);
    expect(live.raw).toBe(false);
    expect(live.text).toContain(TAIL);
    expect(words(live.text)).toBe(words(reload.text));
  });
});

/**
 * ROUND 10 — the free-text boundary (owner ruling C1). A stray `[[`, `{"`,
 * `{{`, `["`, an unrelated earlier object, a pasted schema or a truncated
 * kindless fragment never extends a region to the end of the text, and a
 * non-JSON spelling (`{\"__kind\":…}` in prose, a JS literal) is LEFT AS
 * WRITTEN. Inputs are the attacker's exact repros. Every converter (inline,
 * catalog, snippet, export, label) keeps every character outside the one real
 * JSON kind, and reload and live (char by char) keep every word, once, in order,
 * in prose — never inside a code card.
 */
const K10 = '{"__kind":"note","title":"Hi"}';
const E10 = '{\\"__kind\\":\\"note\\",\\"title\\":\\"Hi\\"}';
/** [name, text, the real JSON kind in it (or null), pieces that must survive verbatim, in order]. */
const R10: ReadonlyArray<readonly [string, string, string | null, string[]]> = [
  ["stray [[ before a kind", `Matrix [[1, 2], [3, 4] is singular. Here: ${K10} and the rest qx1 stays.\n\nNext qx2.`, K10, ["Matrix [[1, 2], [3, 4] is singular. Here: ", " and the rest qx1 stays.", "Next qx2."]],
  ["truncated JSON before a kind", `The API returned {"status": "ok", "items": [ (cut off). Here: ${K10} and the rest qx1 stays.\n\nNext qx2.`, K10, ['The API returned {"status": "ok", "items": [ (cut off). Here: ', " and the rest qx1 stays.", "Next qx2."]],
  ["stray {{ before a kind", `Template uses {{name for names. Here: ${K10} and the rest qx1 stays.`, K10, ["Template uses {{name for names. Here: ", " and the rest qx1 stays."]],
  ["stray [\" before a kind", `Choices ["a", "b" are listed. Here: ${K10} and the rest qx1 stays.`, K10, ['Choices ["a", "b" are listed. Here: ', " and the rest qx1 stays."]],
  ["escaped kind after a stray {{", `Template uses {{name here. Here: ${E10} and the rest qx1 stays.`, null, [`Template uses {{name here. Here: ${E10} and the rest qx1 stays.`]],
  ["prose mention of the key", `To make a card set "__kind": "note" in your object; the rest qx1 stays.`, null, [`To make a card set "__kind": "note" in your object; the rest qx1 stays.`]],
  ["prose mention after an earlier object", `Objects look like {"a": 1}. To make a card set "__kind": "note" in it; the rest qx1 stays.\n\nNext qx2.`, null, [`Objects look like {"a": 1}. To make a card set "__kind": "note" in it; the rest qx1 stays.`, "Next qx2."]],
  ["javascript literal in docs", `In JS write { __kind: 'note' } and the rest qx1 stays.`, null, [`In JS write { __kind: 'note' } and the rest qx1 stays.`]],
  ["pasted schema", `Here is my schema:\n{\n  "type": "object",\n  "properties": { "__kind": { "const": "note" } }\n}\nqx1 stays.\n\nNext qx2.`, null, ["Here is my schema:", '"properties": { "__kind": { "const": "note" } }', "qx1 stays.", "Next qx2."]],
  ["escaped kind at line start", `${E10} and the rest qx1 stays.\n\nNext qx2.`, null, [`${E10} and the rest qx1 stays.`, "Next qx2."]],
  ["escaped kind before a literal kind", `Log: ${E10} then ${K10} and the rest qx1 stays.\n\nNext qx2.`, K10, [`Log: ${E10} then `, " and the rest qx1 stays.", "Next qx2."]],
  ["truncated kindless fragment inline", `The API returned {"status": "ok", "items": [ and then prose qx1 stays.\n\nNext qx2.`, null, [`The API returned {"status": "ok", "items": [ and then prose qx1 stays.`, "Next qx2."]],
  ["truncated kindless fragment at line start", `{"status": "ok", "items": [\nand then prose qx1 stays.\n\nNext qx2.`, null, ['{"status": "ok", "items": [', "and then prose qx1 stays.", "Next qx2."]],
  ["smart quotes in prose", `People write “__kind”: “note” in prose and qx1 stays.`, null, [`People write “__kind”: “note” in prose and qx1 stays.`]],
];

/** Each piece appears verbatim, in order. */
function keepsInOrder(out: string, pieces: string[]): string[] {
  const missing: string[] = [];
  let cursor = 0;
  for (const piece of pieces) {
    const at = out.indexOf(piece, cursor);
    if (at < 0) missing.push(piece);
    else cursor = at + piece.length;
  }
  return missing;
}

describe("round 10 — free text outside a real JSON kind is never touched (converters)", () => {
  const converters: ReadonlyArray<readonly [string, (text: string) => string]> = [
    ["prose leaf", spelledKindsAsOneLine],
    ["inline", (text) => inlineKindText(text)],
    ["catalog", catalogProseText],
    ["snippet", snippetKindText],
    ["export", kindTextToMarkdown],
    ["label", (text) => kindTextLabel(text, 100_000)],
  ];
  const cells = R10.flatMap(([name, text, kind, keep]) =>
    converters.map(([c, convert]) => [`${name} × ${c}`, c, convert, text, kind, keep] as const),
  );
  it.each(cells)("%s", (_cell, converter, convert, text, kind, keep) => {
    const out = convert(text);
    if (converter === "label") {
      // A label is the FIRST readable line: it starts with the text before the kind, as written.
      const collapse = (s: string) => s.replace(/[*_`]+/g, "").replace(/\s+/g, " ").trim();
      expect(collapse(out)).toContain(collapse(keep[0]!).slice(0, 25));
    } else {
      // An export / snippet may set a kind on its own lines: pieces compare trimmed.
      expect(keepsInOrder(out, keep.map((piece) => piece.trim()))).toEqual([]);
    }
    // The real JSON kind (when there is one and this converter converts) never stays raw in prose.
    if (kind && converter !== "prose leaf") expect(out).not.toContain(kind);
  });
});

describe("round 10 — free text outside a real JSON kind is never touched (rendered)", () => {
  const tokens = (text: string) => text.match(/qx\d/g) ?? [];
  it.each(R10.map(([name, text]) => [name, text] as const))("%s: every word once, in order, in prose; live = reload", async (_name, text) => {
    const reload = await reloadText(text);
    expect(reload.raw).toBe(false);
    expect(tokens(reload.text)).toEqual(tokens(text));
    const live = await liveText(text);
    expect(live.raw).toBe(false);
    expect(tokens(live.text)).toEqual(tokens(text));
    expect(words(live.text)).toBe(words(reload.text));
    // Prose is never drawn as a code card, live or reloaded.
    const proseInCode = (blocks: Array<{ type: string; content?: string }>) =>
      blocks.filter((b) => b.type !== "text" && /qx\d/.test(b.content ?? "")).map((b) => b.type);
    expect(proseInCode(splitContentIntoBlocksV2(text) as never)).toEqual([]);
    expect(proseInCode(liveBlocks(text))).toEqual([]);
  });
});

function liveBlocks(text: string): Array<{ type: string; content?: string }> {
  const settled = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator(`req-r10-${text.length}`, (payload) => {
    const block = (payload as { block: RenderBlockPayload }).block;
    settled.set(block.blockId, block);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const ch of text) accumulator.ingest(ch, dispatch);
  accumulator.finalize(dispatch);
  return [...settled.values()].sort((a, b) => a.blockIndex - b.blockIndex) as never;
}
