/**
 * Page-break parity across every markdown entry point.
 *
 * The print system's page break (`@ai-matrx/print/directives`) must preview as
 * the same dashed "Page break" divider wherever markdown is shown — chat,
 * notes/flashcards, the legacy renderer, the file previewer — and must survive
 * the chat block splitter (static and streamed) inside its text block. Code
 * spans and fences keep the directive as literal text.
 *
 * Renders the REAL pipeline, same harness and stand-ins as math-parity.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("@/components/markdown-core/MarkdownCore", () => {
  const actual = jest.requireActual(
    "@/components/markdown-core/MarkdownCoreImpl",
  ) as typeof import("@/components/markdown-core/MarkdownCoreImpl");
  return { __esModule: true, default: actual.default };
});

let mockBlobText = "";
const mockBlobs = new Map<string, unknown>();
jest.mock("@/features/files/hooks/useFileBlob", () => ({
  useFileBlob: () => {
    if (!mockBlobs.has(mockBlobText)) {
      const text = mockBlobText;
      mockBlobs.set(text, {
        size: text.length,
        text: () => Promise.resolve(text),
        slice: () => ({ text: () => Promise.resolve(text) }),
      });
    }
    return { blob: mockBlobs.get(mockBlobText), loading: false, error: null };
  },
}));
jest.mock("rehype-prism-plus", () => ({
  __esModule: true,
  default: () => () => undefined,
}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
test("dbg", async () => {
  for (const src of ['A\n\n<div style="page-break-after: always"></div>\n\nB', "Intro\n\n    <!-- pagebreak -->\n\nOutro"]) {
    const c = document.createElement("div"); document.body.appendChild(c); const root = createRoot(c);
    await act(async () => { root.render(<BasicMarkdownContent content={src} showCopyButton={false} />); });
    console.log(JSON.stringify(c.innerHTML.slice(0, 900)));
    act(() => root.unmount());
  }
});
