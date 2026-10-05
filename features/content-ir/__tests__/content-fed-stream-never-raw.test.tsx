/**
 * P3 (round 4) — CONTENT-FED streaming: a caller that has no Redux render
 * blocks hands the growing text itself (`RichContent level="full" source=…
 * isStreaming`, the research live pipeline, the PDF AI pane, the episode
 * studio). Prose, then an UNFENCED kind, used to show raw most frames. Drawn
 * UNMOCKED here — the real MarkdownStream pipeline in jsdom — and judged by
 * the rendered DOM (`textLeaksKind`), every frame from the first `__kind` on.
 */

// The DOM judge's mocks (next/dynamic as React.lazy, redux hooks, navigation).
import "../render-paths/__tests__/dom-frame-judge";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { RichContent } from "@/components/rich-content/RichContent";
import { hasKindKey } from "../surfaces/json-kind-signal";
import { textLeaksKind, visibleKindText } from "../surfaces/kind-leak-scan";

const KIND = {
  __kind: "flashcard_set",
  title: "Cells",
  cards: [
    { __kind: "flashcard", front: "Mitochondria", back: "The powerhouse of the cell." },
    { __kind: "flashcard", front: "Ribosome", back: "Builds proteins from amino acids." },
  ],
};

const CASES: Array<[string, string]> = [
  ["prose, blank line, one-line kind", `Here are your cards:\n\n${JSON.stringify(KIND)}\n\nStudy well.`],
  ["heading, blank line, one-line kind", `## Cards\n\n${JSON.stringify(KIND)}`],
  ["prose, blank line, pretty-printed kind", `Here are your cards:\n\n${JSON.stringify(KIND, null, 2)}\n\nStudy well.`],
  ["prose directly above the kind", `Here are your cards:\n${JSON.stringify(KIND, null, 2)}`],
];

async function draw(source: string, isStreaming: boolean): Promise<{ raw: boolean; text: string }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<RichContent level="full" imagePolicy="ai" source={source} isStreaming={isStreaming} hideCopyButton />);
    });
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    return { raw: textLeaksKind(container), text: visibleKindText(container, 400) };
  } finally {
    act(() => root.unmount());
    container.remove();
  }
}

describe("content-fed streaming never shows a kind raw (P3)", () => {
  it.each(CASES)("%s: no frame from the first __kind on draws it as text", async (_label, full) => {
    const first = full.indexOf('"__kind"') + '"__kind":'.length;
    const ends = new Set<number>();
    for (let end = first; end <= full.length; end += 9) ends.add(end);
    ends.add(full.length);
    const leaks: string[] = [];
    for (const end of [...ends].sort((a, b) => a - b)) {
      const source = full.slice(0, end);
      if (!hasKindKey(source)) continue;
      const verdict = await draw(source, end < full.length);
      if (verdict.raw) {
        leaks.push(`@${end}: ${verdict.text.replace(/\s+/g, " ").slice(0, 80)}`);
        if (leaks.length >= 3) break;
      }
    }
    // Settled, the whole answer too.
    const settled = await draw(full, false);
    if (settled.raw) leaks.push(`settled: ${settled.text.slice(0, 80)}`);
    expect(leaks).toEqual([]);
  }, 300_000);
});
