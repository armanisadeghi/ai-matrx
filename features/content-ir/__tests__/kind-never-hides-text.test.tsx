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
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { catalogProseText, inlineKindText, spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { snippetKindText } from "@/features/content-ir/surfaces/kind-snippet-text";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";

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
    expect(reload.text).toMatch(/Note/);
    const live = await liveText(text);
    expect(live.raw).toBe(false);
    expect(live.text).toContain(TAIL);
    expect(words(live.text)).toBe(words(reload.text));
  });
});
