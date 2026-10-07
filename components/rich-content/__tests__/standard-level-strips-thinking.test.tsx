/**
 * FORCING FUNCTION: chain-of-thought never renders as content at the
 * `standard` level — settled or streaming.
 *
 * The break this catches: StandardBlocks split model text without the one
 * strip helper (@ai-matrx/kit/text), and drew a `<reasoning>` / `<thinking>`
 * section as a muted paragraph — the model's private reasoning printed beside
 * its answer. It reaches people through <RichContent level="standard"> and
 * through every nested region of the full engine (a ```markdown fence's
 * document, an XML card's prose) while a live answer streams.
 *
 * Use case: a recycling company's dispatcher asks for the Tuesday route plan;
 * the model reasons about tipping fees before answering.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

jest.mock("@ai-matrx/rich-content/markdown-core/MarkdownCore", () => ({
  __esModule: true,
  default: jest.requireActual("@ai-matrx/rich-content/markdown-core/MarkdownCoreImpl")
    .default,
}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { StandardBlocks } from "@/components/rich-content/standard/StandardBlocks";

const SECRET = "tipping fee at Harbor landfill rose so reroute";
const ANSWER = "Tuesday route: North Industrial first, then Harbor Commercial.";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(source: string, isStreaming?: boolean): string {
  act(() => root.render(<StandardBlocks source={source} isStreaming={isStreaming} />));
  // What a person reads: the text, without the stylesheets some blocks inline.
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("style").forEach((el) => el.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ");
}

describe("standard level never shows chain-of-thought", () => {
  it.each(["reasoning", "thinking"])(
    "a settled <%s> block renders without its text or tags",
    (tag) => {
      const text = render(`<${tag}>\n${SECRET}\n</${tag}>\n\n${ANSWER}`);
      expect(text).toContain(ANSWER);
      expect(text).not.toContain(SECRET);
      expect(text).not.toMatch(/<\/?(reasoning|thinking)/);
    },
  );

  it("a streaming, still-open <reasoning> block never flashes", () => {
    const text = render(`Plan below.\n\n<reasoning>\n${SECRET}`, true);
    expect(text).toContain("Plan below.");
    expect(text).not.toContain(SECRET);
    expect(text).not.toMatch(/<\/?(reasoning|thinking)/);
  });

  it("a half-arrived opening tag never flashes while streaming", () => {
    const text = render(`Plan below.\n\n<reaso`, true);
    expect(text).toContain("Plan below.");
    expect(text).not.toContain("<reaso");
  });

  it("a closed block mid-stream is gone and the answer keeps arriving", () => {
    const text = render(`<reasoning>${SECRET}</reasoning>\n\nTuesday route: North`, true);
    expect(text).toContain("Tuesday route: North");
    expect(text).not.toContain(SECRET);
  });

  it("a <thinking> example inside a code fence or inline code is content and stays", () => {
    const fenced = "```text\n<thinking>weigh the tipping fee</thinking>\n```";
    const text = render(
      `<reasoning>${SECRET}</reasoning>\n\nWrap it like \`<thinking>…</thinking>\`:\n\n${fenced}`,
    );
    expect(text).not.toContain(SECRET);
    expect(text).toContain("<thinking>…</thinking>");
    expect(text).toContain("<thinking>weigh the tipping fee</thinking>");
    // An ```xml example draws as the XML card, its body intact.
    expect(render("```xml\n<thinking>weigh the tipping fee</thinking>\n```")).toContain(
      "weigh the tipping fee",
    );
  });

  it("streaming: an open fence's <thinking> example is shown, not cut", () => {
    const text = render("Example:\n\n```text\n<thinking>weigh the", true);
    expect(text).toContain("<thinking>weigh the");
  });
});
