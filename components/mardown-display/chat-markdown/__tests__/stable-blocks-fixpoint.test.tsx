/**
 * FORCING FUNCTION: the unchanged-block reuse is a FIXPOINT, so no caller that
 * stores its result (StandardBlocks' derived state, EnhancedChatMarkdown's ref)
 * can loop. The defect (2026-09-26, found by the print lane): an empty split
 * returned a fresh `[]` every time, StandardBlocks set state on every render
 * while a streamed table's healed tail was empty, and React threw
 * "Too many re-renders" in the standard level. Fails on 55d7167c29.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { healStreamingTail } from "@/components/rich-content/standard/stream-holdback";
import { reuseUnchangedBlocks } from "../stable-blocks";
import { technicalReport, pathological, bigDataTable } from "@/components/markdown-studio/__fixtures__/stress-corpus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has neither; the table's scroll area and phone check ask for them.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }),
  });
}

const DOCS = ["", "   ", technicalReport(3, 4), pathological(5).slice(0, 4000), bigDataTable(8, 6)];

describe("reuseUnchangedBlocks is a fixpoint on every streamed prefix", () => {
  it("re-splitting the same text returns the stored array itself", () => {
    let checked = 0;
    for (const doc of DOCS) {
      const step = Math.max(1, Math.floor(doc.length / 120));
      for (let end = 0; end <= doc.length; end += step) {
        const src = healStreamingTail(doc.slice(0, end));
        const first = reuseUnchangedBlocks([], splitContentIntoBlocksV2(src));
        const stored = reuseUnchangedBlocks(first, splitContentIntoBlocksV2(src));
        expect(reuseUnchangedBlocks(stored, splitContentIntoBlocksV2(src))).toBe(stored);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe("the standard level never loops while a table streams", () => {
  it("renders every prefix of a streamed table, empty tails included", async () => {
    const { RichContent } = await import("@/components/rich-content/RichContent");
    const host = document.createElement("div");
    const root = createRoot(host);
    const table = bigDataTable(4, 9);
    for (let end = 0; end < Math.min(table.length, 400); end += 3) {
      await act(async () => {
        root.render(<RichContent level="standard" source={table.slice(0, end)} isStreaming />);
      });
    }
    await act(async () => root.unmount());
  }, 300_000);
});
