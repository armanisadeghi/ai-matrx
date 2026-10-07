/**
 * LIVE = RELOAD for an `<artifact>`-wrapped ONE-LINE kind (2026-10-05).
 *
 * Structured-output agents stream their answer wrapped by the artifact system:
 *
 *   prose\n\n<artifact type="flashcards" id="…" title="…">\n{"__kind":"flashcard_set",…}\n</artifact>
 *
 * The live accumulator keeps the tag lines in an attribute-XML block's
 * `content` (its `rawXml` must round-trip verbatim), while the reload splitter
 * hands the artifact renderer only the BODY. ArtifactBlock parses `content` as
 * the payload, so live drew "No flashcards available yet" (settled) and the
 * raw `__kind` JSON (mid-stream) for a message a reload draws as cards.
 *
 * Drives the REAL StreamBlockAccumulator (char-by-char and in chunks), the
 * REAL live hop (`renderBlockToContentBlock`) and the REAL BlockRenderer
 * (DOM frame judge), and compares the settled frame with the reload path
 * (`splitContentIntoBlocksV2` → BlockRenderer). The by-id canvas load misses
 * here (the row is not in this test's store), which is the fallback both
 * paths share.
 */
// eslint-disable-next-line import/order -- the judge's mocks must register first
import { domElementVerdict, domFrameVerdict, transitionKindFrames } from "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";
import { chunkText } from "./seeded-random";

jest.mock("@/features/canvas/hooks/useCanvasItem", () => ({
  useCanvasItem: () => ({ row: null, loading: false, error: "not in this store" }),
}));

jest.setTimeout(240_000);

const CARDS: Array<[string, string]> = [
  ["What is the formula and charge of the nitrate ion?", "NO3-"],
  ["What is the formula and charge of the sulfate ion?", "SO4^2-"],
  ["What is the formula and charge of the ammonium ion?", "NH4+"],
  ["What is the formula and charge of the phosphate ion?", "PO4^3-"],
  ["What is the formula and charge of the carbonate ion?", "CO3^2-"],
  ["What is the formula and charge of the hydroxide ion?", "OH-"],
];
const BODY = JSON.stringify({
  __kind: "flashcard_set",
  cards: CARDS.map(([front, back]) => ({ __kind: "flashcard", front, back })),
  title: "Polyatomic Ions",
});
const PROSE = "Here are 6 flashcards covering common polyatomic ions.";

/** The exact text of conversation 32eaa687 (materialized UUID id) and the model's own id form. */
const STREAMS: Record<string, string> = {
  "materialized uuid id": `${PROSE}\n\n<artifact type="flashcards" id="fd4a56a0-360a-47f2-a101-f1e7c8978a0d" version="1" title="Polyatomic Ions">\n${BODY}\n</artifact>`,
  "model id (artifact_1)": `${PROSE}\n\n<artifact type="flashcards" id="artifact_1" title="Polyatomic Ions">\n${BODY}\n</artifact>`,
};

interface Frame {
  block: RenderBlockPayload;
}

function streamFrames(text: string, chunks: string[]): Frame[] {
  const frames: Frame[] = [];
  const accumulator = new StreamBlockAccumulator("req-artifact-one-line", (payload) => {
    frames.push({ block: (payload as { block: RenderBlockPayload }).block });
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const chunk of chunks) accumulator.ingest(chunk, dispatch);
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
    expect(verdict.raw).toBe(false);
    parts.push(verdict.text);
  }
  return parts.join("");
}

describe.each(Object.entries(STREAMS))("<artifact> one-line kind, %s: live renders what reload renders", (_name, text) => {
  it.each([
    ["char-by-char", (t: string) => t.split("")],
    ["chunks", (t: string) => chunkText(t, 11, 9)],
  ])("%s — prose stays prose, no raw kind frame, settled frame = reload's cards", async (_mode, chunker) => {
    const frames = streamFrames(text, chunker(text));

    // The prose is a text block — never a code card.
    for (const { block } of frames) {
      if (block.content?.includes("Here are 6")) expect(block.type).toBe("text");
    }

    const artifactFrames = frames.filter((f) => f.block.type === "artifact");
    expect(artifactFrames.length).toBeGreaterThan(0);
    const judged =
      _mode === "chunks"
        ? artifactFrames
        : transitionKindFrames(artifactFrames, (f) => f.block.status === "streaming");
    for (const frame of judged) {
      const verdict = await domFrameVerdict(frame.block, { isStreamActive: frame.block.status === "streaming" });
      if (verdict.failed) {
        throw new Error(
          `frame (${frame.block.status}, ${frame.block.content?.length} chars) drew ${verdict.raw ? "a raw kind" : "nothing"}: ${verdict.text.slice(0, 300)}`,
        );
      }
      expect(verdict.text).not.toContain("No flashcards available yet");
    }

    const settled = artifactFrames[artifactFrames.length - 1].block;
    expect(settled.status).toBe("complete");
    const live = await domFrameVerdict(settled, { isStreamActive: false });
    for (const [front, back] of CARDS) {
      expect(live.text).toContain(front);
      expect(live.text).toContain(back);
    }
    const reload = await reloadText(text);
    for (const [front] of CARDS) expect(reload).toContain(front);
    expect(live.text).toBe(reload.replace(PROSE, ""));
  });
});
