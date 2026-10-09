/**
 * Round 7 follow-up (K4b): a Python-repr kind INSIDE a chat answer —
 * `{'__kind': 'flashcard_set', …}`, what `str(dict)` prints into a tool's
 * error or a model's echo of one — streamed as prose and drew the dict raw.
 *
 * Ruling: a repr is not lifted into a kind block (the stream parser speaks
 * JSON, and a speculative repr→JSON rewrite mid-stream would make live and
 * reload disagree). It reads as the kind's ONE-LINE LABEL in prose, at the one
 * prose leaf every text block passes through on both paths
 * (BasicMarkdownContent) — so live ≡ reload by construction. An unfinished
 * repr at the end of a streaming frame is cut to the kind's name.
 *
 * Every frame of the REAL accumulator stream is drawn by the DOM frame judge
 * (whose scan reads the repr as a leak), and the settled frame equals reload.
 *
 * SUPERSEDED BY ROUND 10 (302f4ceed7, 0072e32abd): a repr is DETECTION ONLY — never converted
 * to a label. It is drawn exactly as written, inside an inline code span that carries
 * data-kind-source (a deliberate source view, skipped by the judge's visible-text read), so
 * live and reload still agree and no frame draws it as a raw leak.
 */
// eslint-disable-next-line import/order -- the judge's mocks must register first
import { domElementVerdict, domFrameVerdict } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";
import { spelledKindsAsOneLine } from "@ai-matrx/content-ir/surfaces";
import { chunkText } from "./seeded-random";

jest.setTimeout(240_000);

const REPR =
  "{'__kind': 'flashcard_set', 'title': 'Cell biology', 'cards': [{'__kind': 'flashcard', 'front': 'What makes ATP?', 'back': 'Mitochondria'}], 'shuffle': True, 'deck': None}";
const ANSWER = `The save tool rejected this payload: ${REPR}. I will retry with a shorter title.`;

function streamFrames(text: string, chunks: string[]) {
  const frames: Array<{ block: RenderBlockPayload; active: boolean }> = [];
  let finalizing = false;
  const accumulator = new StreamBlockAccumulator("req-python-repr", (payload) => {
    frames.push({ block: (payload as { block: RenderBlockPayload }).block, active: !finalizing });
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const chunk of chunks) accumulator.ingest(chunk, dispatch);
  finalizing = true;
  accumulator.finalize(dispatch);
  expect(chunks.join("")).toBe(text);
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

describe("a Python-repr kind in prose", () => {
  it("the transform: a repr is left exactly as written at every point, kindless untouched", () => {
    expect(spelledKindsAsOneLine(ANSWER)).toBe(ANSWER);
    expect(spelledKindsAsOneLine("Rejected: {'__kind': 'flashcard_set', 'title': 'Cel")).toBe("Rejected: {'__kind': 'flashcard_set', 'title': 'Cel");
    const plain = "A dict {'a': 1} and {'title': 'x'} stay.";
    expect(spelledKindsAsOneLine(plain)).toBe(plain);
  });

  it.each([
    ["char-by-char", (t: string) => t.split("")],
    ["chunks", (t: string) => chunkText(t, 5, 9)],
  ])("%s: no frame draws it raw, and settled live = reload", async (_mode, chunker) => {
    const frames = streamFrames(ANSWER, chunker(ANSWER));
    const leaks: string[] = [];
    for (const { block, active } of frames) {
      const verdict = await domFrameVerdict(block, { isStreamActive: active });
      if (verdict.raw) leaks.push(`${block.content?.length} chars: ${verdict.text.slice(-120)}`);
    }
    expect(leaks).toEqual([]);
    const settled = frames[frames.length - 1].block;
    const live = await domFrameVerdict(settled, { isStreamActive: false });
    expect(live.text).toContain("The save tool rejected this payload:");
    expect(live.text).toContain("I will retry with a shorter title.");
    expect(live.text).toBe(await reloadText(ANSWER));
  });
});
