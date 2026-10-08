/** @jest-environment jsdom */
//
// A KIND IS NEVER DRAWN AS RAW JSON — the settled-step leg (W3 of
// features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
//
// A step with no DECLARED output kind still hands back values that carry
// their own `__kind` — an agent bound to a kind's schema, or one that answered
// with kind JSON as text. `SettledOutputBody` sent both to the generic value
// grid. The value's own claim must route it to its kind component, the way
// `AgentResultBlock` already does; kindless data keeps the generic floor.
//
// RED BEFORE GREEN: before the fix the two kind cases rendered the floor.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let markdownContent: string[] = [];

jest.mock(
  "@/features/content-ir/studio/components/KindInstanceRender",
  () => ({
    __esModule: true,
    default: ({ kind }: { kind: string }) => (
      <div data-route="kind">Kind component: {kind}</div>
    ),
  }),
);
jest.mock("@/components/official/structured-value/StructuredValueView", () => ({
  StructuredValueView: ({ value }: { value: unknown }) => (
    <div data-route="floor">{JSON.stringify(value)}</div>
  ),
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => {
    markdownContent.push(content);
    return <div data-route="markdown" />;
  },
}));
jest.mock("@ai-matrx/media/react", () => ({ InlineMediaRef: () => null }));

import { SettledOutputBody } from "../components/SettledOutputBody";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const flashcards = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ front: "Mitochondria", back: "Makes ATP" }],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  markdownContent = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(output: Record<string, unknown>) {
  act(() => root.render(<SettledOutputBody output={output} />));
}

describe("SettledOutputBody routes a value by its own __kind", () => {
  it("draws schema-bound agent output carrying __kind as its kind", () => {
    render({ final_text: "", structured_output: flashcards });
    expect(container.querySelector('[data-route="kind"]')).not.toBeNull();
    expect(container.textContent).toContain("flashcard_set");
    expect(container.innerHTML).not.toContain('"__kind"');
  });

  it("draws kind JSON answered as text as its kind", () => {
    render({ final_text: JSON.stringify(flashcards) });
    expect(container.querySelector('[data-route="kind"]')).not.toBeNull();
    expect(container.innerHTML).not.toContain('"__kind"');
  });

  it("hands truncated kind JSON to the kind parser, never as prose", () => {
    const truncated = JSON.stringify(flashcards).slice(0, 40);
    render({ final_text: truncated });
    expect(markdownContent).toHaveLength(1);
    expect(markdownContent[0].startsWith("```json\n")).toBe(true);
  });

  it("keeps kindless structured output on the generic floor", () => {
    render({ final_text: "", structured_output: { patients_called: 12 } });
    expect(container.querySelector('[data-route="floor"]')).not.toBeNull();
    expect(container.querySelector('[data-route="kind"]')).toBeNull();
    expect(container.textContent).toContain("patients_called");
  });

  it("keeps plain prose on the markdown renderer", () => {
    render({ final_text: "Twelve patients confirmed." });
    expect(markdownContent).toEqual(["Twelve patients confirmed."]);
  });
});
