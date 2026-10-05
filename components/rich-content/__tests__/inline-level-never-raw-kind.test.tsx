/**
 * P6 (round 4) — the INLINE level had no kind gate: a collapsed analysis
 * preview, a notification body and an extraction cell printed `{"__kind":…}`
 * (a whole-kind cell even showed "{ } __kind, title, cards"). An inline level
 * cannot mount a kind component, so a kind region reads as its one-line form —
 * instance title + kind name. Judged by the rendered DOM (`textLeaksKind`).
 */

import "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { RichContent } from "@/components/rich-content/RichContent";
import { RichContentPreview } from "@/components/rich-content/RichContentPreview";
import { ExtractionCellDisplay } from "@/features/page-extraction/data-review/ExtractionCellDisplay";
import { textLeaksKind, visibleKindText } from "@/features/content-ir/surfaces/kind-leak-scan";

const KIND = { __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "Q", back: "A" }] };
const ONE = JSON.stringify(KIND);
const PRETTY = JSON.stringify(KIND, null, 2);

async function draw(node: React.ReactElement): Promise<{ raw: boolean; text: string; all: string }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(node);
    });
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    return {
      raw: textLeaksKind(container),
      text: visibleKindText(container, 400).replace(/\s+/g, " ").trim(),
      all: container.textContent ?? "",
    };
  } finally {
    act(() => root.unmount());
    container.remove();
  }
}

describe("the inline level never shows a kind raw (P6)", () => {
  it.each([
    ["a whole-kind cell", ONE],
    ["prose before the kind", `Extracted: ${ONE}`],
    ["a pretty-printed kind", PRETTY],
    ["an unfinished kind", ONE.slice(0, 40)],
  ])("RichContent inline — %s reads as its one-line form", async (_label, source) => {
    const out = await draw(<RichContent level="inline" source={source} isStreaming={false} />);
    expect(out.raw).toBe(false);
    expect(out.text).toContain("Flashcard Set");
  });

  it("a complete kind names its instance title", async () => {
    const out = await draw(<RichContent level="inline" source={`Extracted: ${ONE}`} isStreaming={false} />);
    expect(out.text).toContain("Cells");
    expect(out.text).toContain("Extracted:");
  });

  it.each([
    ["one-line kind", ONE],
    ["pretty kind cut to two lines", `Summary first.\n${PRETTY}`],
  ])("RichContentPreview — %s", async (_label, source) => {
    const out = await draw(<RichContentPreview source={source} lines={2} />);
    expect(out.raw).toBe(false);
    expect(out.text).toContain("Flashcard Set");
  });

  it("a kind inside an inline code span is quoted source and stays as written", async () => {
    const out = await draw(<RichContent level="inline" source={"Use `" + ONE + "` to route."} isStreaming={false} />);
    expect(out.raw).toBe(false);
    expect(out.all).toContain('"__kind"');
  });

  it.each([
    ["a whole-kind cell", ONE],
    ["a list of kinds", JSON.stringify([KIND, KIND])],
    ["prose before the kind", `Found: ${ONE}`],
  ])("ExtractionCellDisplay — %s never shows the key list or the JSON", async (_label, value) => {
    const out = await draw(<ExtractionCellDisplay value={value} />);
    expect(out.raw).toBe(false);
    expect(out.all).not.toContain("__kind");
    expect(out.text).toContain("Flashcard Set");
  });
});
