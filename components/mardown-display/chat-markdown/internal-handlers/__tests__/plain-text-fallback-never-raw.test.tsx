/** @jest-environment jsdom */
/**
 * A KIND IS NEVER DRAWN AS RAW JSON — the crash fallback (B7 of
 * features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
 *
 * When `MarkdownStream`'s top-level error boundary trips (and when
 * EnhancedChatMarkdown gives up), `PlainTextFallback` printed the answer text
 * as-is — kind JSON and all. Now each kind region goes through the kind door
 * inside its OWN error boundary; if that throws too, the kind's readable
 * markdown (`kindTextToMarkdown`); an unreadable kind says so. Kindless text
 * stays plain.
 *
 * RED BEFORE GREEN: before the fix every kind case printed `"__kind"`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let kindThrows = false;
jest.mock(
  "@/features/content-ir/studio/components/KindInstanceRender",
  () => ({
    __esModule: true,
    default: ({ kind }: { kind: string }) => {
      if (kindThrows) throw new Error("kind component crashed");
      return <div data-route="kind">Kind component: {kind}</div>;
    },
  }),
);
jest.mock("@/lib/diagnostics/captureReactError", () => ({
  captureReactRenderError: () => undefined,
}));

import { PlainTextFallback } from "../PlainTextFallback";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KIND = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Mitochondria", back: "Makes ATP" }],
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  kindThrows = false;
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function render(content: string) {
  await act(async () => {
    root.render(<PlainTextFallback content={content} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("PlainTextFallback never prints a kind as JSON", () => {
  it("routes a fenced kind through the kind door, prose kept", async () => {
    await render(`Here are your cards:\n\n\`\`\`json\n${KIND}\n\`\`\`\n\nStudy well.`);
    expect(container.querySelector('[data-route="kind"]')?.textContent).toContain(
      "flashcard_set",
    );
    expect(container.textContent).toContain("Here are your cards");
    expect(container.textContent).toContain("Study well.");
    expect(container.innerHTML).not.toContain("__kind");
    expect(container.textContent).not.toContain("```");
  });

  it("falls back to the kind's readable markdown when the kind door crashes too", async () => {
    kindThrows = true;
    await render(`Here:\n\n${KIND}`);
    expect(container.querySelector('[data-route="kind"]')).toBeNull();
    expect(container.textContent).toContain("Mitochondria");
    expect(container.innerHTML).not.toContain("__kind");
  });

  it("says an unreadable (truncated) kind could not be read", async () => {
    await render(`Here:\n\n\`\`\`json\n${KIND.slice(0, 50)}`);
    expect(container.textContent).toContain("could not be read");
    expect(container.textContent).toContain("Here:");
    expect(container.innerHTML).not.toContain("__kind");
  });

  it("keeps kindless text plain, JSON included", async () => {
    await render('Route totals: {"stops": 14}');
    expect(container.textContent).toBe('Route totals: {"stops": 14}');
  });
});
