/**
 * C4 — the plain markdown leaves never draw a kind raw. Text carrying a
 * `__kind` key goes to the canonical pipeline (`MarkdownStream`) and the caller
 * is filed in the Error Inspector; kindless JSON keeps its code fence; a leaf
 * the pipeline hands the same text back to renders it itself (no loop).
 *
 * The pipeline stand-in renders the REAL BasicMarkdownContent with what it was
 * handed — the worst case of the real engine (a prose block holding the whole
 * text) — so the recursion guard is exercised, not assumed.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
// The stand-in renders a table cell's text through the real leaf (jsdom has none).
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

jest.mock("@/components/markdown-core/MarkdownCore", () => {
  const actual = jest.requireActual(
    "@/components/markdown-core/MarkdownCoreImpl",
  ) as typeof import("@/components/markdown-core/MarkdownCoreImpl");
  return { __esModule: true, default: actual.default };
});
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

const mockCaptureError = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: (input: unknown) => mockCaptureError(input),
}));

const mockStreamCalls: string[] = [];
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: function MockMarkdownStream({ content }: { content: string }) {
    mockStreamCalls.push(content);
    const { default: Basic } = jest.requireActual(
      "@/components/mardown-display/chat-markdown/BasicMarkdownContent",
    ) as typeof import("@/components/mardown-display/chat-markdown/BasicMarkdownContent");
    // The real engine routes a kind fence to its kind component; the stand-in
    // marks that route and hands any prose back to the leaf (the loop case).
    const fence = /```json\n[\s\S]*?\n```/.exec(content);
    const prose = content.replace(/```json\n[\s\S]*?\n```/g, "").trim();
    return (
      <div data-pipeline="markdown-stream">
        {fence ? <div data-kind-route="1" /> : null}
        {prose ? <Basic content={prose} showCopyButton={false} /> : null}
        {!fence ? <Basic content={content} showCopyButton={false} /> : null}
      </div>
    );
  },
}));

import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import MarkdownWithPlugins from "@/components/message-display/MarkdownWithPlugins";
import { resetKindAtRawRendererReports } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";

const KIND_OBJECT = '{"__kind":"flashcard_set","title":"Cells","cards":[]}';
const FENCED_KIND = `Here you go:\n\n\`\`\`json\n${KIND_OBJECT}\n\`\`\`\n`;
import { act } from "react";
import { createRoot } from "react-dom/client";
it("S11 partial — what text is drawn", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const partial = '{"__kind":"flashcard_set","title":"Cells","cards":[{"front":"Mit';
  act(() => root.render(<BasicMarkdownContent imagePolicy="ai" content={partial} isStreamActive showCopyButton={false} />));
  console.log("DRAWN:", container.textContent, "| calls:", JSON.stringify(mockStreamCalls));
});
