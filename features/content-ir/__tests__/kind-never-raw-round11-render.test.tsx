/**
 * KIND NEVER RAW — round 11, rendered (L1, L2).
 *
 * L1: table cells and every `RichContentInline` leaf markdown-decoded an
 *     escaped / entity spelling into a literal `{"__kind": …}` on screen; the
 *     inline leaf now draws it exactly as written, as BasicMarkdownContent does.
 * L2: a `__kind` that is a list / number is broken structured output: the
 *     one-line unreadable note on reload, inline and in exports — never raw.
 */
// eslint-disable-next-line import/order -- the judge's mocks must register first
import { domElementVerdict, domFrameVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { RichContentInline } from "@/components/rich-content/RichContentInline";
import { inlineKindText, spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { kindTextToMarkdown, UNREADABLE_KIND_NOTE } from "@/features/content-ir/surfaces/kind-text-to-markdown";

jest.setTimeout(300_000);

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

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
    parts.push(verdict.text);
  }
  return squash(parts.join(" "));
}

async function liveText(text: string): Promise<string> {
  const settled = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator(`req-r11-${text.length}`, (payload) => {
    const block = (payload as { block: RenderBlockPayload }).block;
    settled.set(block.blockId, block);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const ch of text) accumulator.ingest(ch, dispatch);
  accumulator.finalize(dispatch);
  const parts: string[] = [];
  for (const block of [...settled.values()].sort((a, b) => a.blockIndex - b.blockIndex)) {
    parts.push((await domFrameVerdict(block, { isStreamActive: false })).text);
  }
  return squash(parts.join(" "));
}

describe("L1 — an inline leaf never markdown-decodes a spelling into a literal kind", () => {
  const ESCAPED = '{\\"__kind\\":\\"note\\",\\"title\\":\\"Hi\\"}';
  const ENTITY = "{&quot;__kind&quot;:&quot;note&quot;,&quot;title&quot;:&quot;Hi&quot;}";
  it.each([
    ["escaped, inline", ESCAPED, false],
    ["escaped, table cell", ESCAPED, true],
    ["entities, inline", ENTITY, false],
    ["entities, table cell", ENTITY, true],
  ])("%s", async (_name, spelled, gfmCell) => {
    const source = `Log: ${spelled} ok.`;
    const verdict = await domElementVerdict(React.createElement(RichContentInline, { source, gfmCell }));
    // Drawn as an inline code span (a source view the judge does not read);
    // before round 11 the leaf showed the decoded literal `{"__kind":"note",…}`.
    expect(verdict.raw).toBe(false);
    expect(verdict.text).not.toContain('{"__kind"');
    expect(verdict.text).toContain("Log:");
    expect(verdict.text).toContain("ok.");
  });
});

describe("L2 — a non-string __kind is broken structured output, never raw", () => {
  it.each([
    ["a list", '{"__kind": ["x"], "a": 1}'],
    ["a number", '{"__kind": 5, "a": 1}'],
  ])("%s: converters, reload and live", async (_name, json) => {
    const text = `qx1 ${json} qx2`;
    for (const out of [spelledKindsAsOneLine(text), inlineKindText(text), kindTextToMarkdown(text)]) {
      expect(out).toContain(UNREADABLE_KIND_NOTE);
      expect(out).not.toContain('"__kind"');
      expect(squash(out)).toMatch(/qx1[\s\S]*qx2/);
    }
    const reload = await reloadText(text);
    expect(reload).not.toContain('"__kind"');
    expect(reload).toContain("qx1");
    expect(reload).toContain("qx2");
    expect(reload).toContain(UNREADABLE_KIND_NOTE);
    // Live lifts the region as a kind block, drawn in its generic broken state
    // ("No result returned"); never raw. Same words as reload: OPEN (R11-L2b).
    const live = await liveText(text);
    expect(live).not.toContain('"__kind"');
    expect(live).toContain("qx1");
    expect(live).toContain("qx2");
  });
});
