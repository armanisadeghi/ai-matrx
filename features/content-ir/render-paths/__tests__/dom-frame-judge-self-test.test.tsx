/**
 * H3 (round 5) — THE DOM FRAME JUDGE'S SELF-TEST. A judge that cannot fail
 * proves nothing: planted frames it MUST fail on, and frames it must pass.
 *  (a) an empty frame (nothing drawn) fails — it never passes silently;
 *  (d) a raw ```json kind card, drawn by the real CodeBlock mid-stream, fails —
 *      so the judge's jsdom can actually draw a CodeBlock;
 *  and a kindless JSON card draws its text and passes.
 */
import { domElementVerdict, frameHoldsKind } from "./dom-frame-judge";
import React from "react";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[{"__kind":"flashcard","front":"Q","back":"A"}]}';

describe("the DOM frame judge fails on what it exists to catch", () => {
  it("(a) an empty frame fails", async () => {
    const verdict = await domElementVerdict(React.createElement("div"));
    expect(verdict.empty).toBe(true);
    expect(verdict.failed).toBe(true);
  });

  it("(d) a planted raw ```json kind card (CodeBlock mid-stream) fails", async () => {
    const verdict = await domElementVerdict(
      React.createElement(CodeBlock, { code: KIND, language: "json", isStreamActive: true }),
    );
    expect(verdict.text).toContain("flashcard_set");
    expect(verdict.raw).toBe(true);
    expect(verdict.failed).toBe(true);
  });

  it("a kindless JSON card is drawn (CodeBlock renders in the judge) and passes", async () => {
    const verdict = await domElementVerdict(
      React.createElement(CodeBlock, { code: '{"name":"Ada Lovelace"}', language: "json" }),
    );
    expect(verdict.text).toContain("Ada Lovelace");
    expect(verdict.failed).toBe(false);
  });

  it("(b) a frame holding the markdown-escaped key counts as a kind frame", () => {
    const block = {
      blockId: "b0",
      blockIndex: 0,
      type: "text",
      status: "streaming",
      content: 'Here: {"\\_\\_kind":"flashcard\\_set","cards":[]}',
      data: null,
    } as unknown as RenderBlockPayload;
    expect(frameHoldsKind(block)).toBe(true);
  });
});
