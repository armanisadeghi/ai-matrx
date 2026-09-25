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
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import { MarkdownPreview } from "@/features/files/components/core/FilePreview/previewers/MarkdownPreview";
import {
  NO_SPLITTER_ENVELOPES,
  splitContentIntoBlocksWith,
} from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-core";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";

const FORMS = [
  "<!-- pagebreak -->",
  "\\newpage",
  '<div style="page-break-after: always"></div>',
];

const RENDERERS: Array<{ name: string; render: (s: string) => React.ReactElement }> = [
  { name: "BasicMarkdownContent", render: (s) => <BasicMarkdownContent content={s} showCopyButton={false} /> },
  { name: "ConfigurableMarkdownContent", render: (s) => <ConfigurableMarkdownContent content={s} showCopyButton={false} /> },
  { name: "MarkdownRenderer", render: (s) => <MarkdownRenderer content={s} /> },
  {
    name: "MarkdownPreview",
    render: (s) => {
      mockBlobText = s;
      return <MarkdownPreview fileId="page-break-test" />;
    },
  },
];

async function mount(element: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

describe("page break previews as a divider in every markdown entry point", () => {
  for (const form of FORMS) {
    for (const r of RENDERERS) {
      it(`${r.name}: ${form}`, async () => {
        const { container, root } = await mount(r.render(`Before the break.\n\n${form}\n\nAfter the break.`));
        try {
          const breaks = container.querySelectorAll(".matrx-page-break");
          expect(breaks).toHaveLength(1);
          const el = breaks[0] as HTMLElement;
          expect(el.getAttribute("role")).toBe("separator");
          expect(el.getAttribute("aria-label")).toBe("Page break");
          expect(el.textContent).toBe("Page break");
          const text = container.textContent ?? "";
          expect(text).toContain("Before the break.");
          expect(text).toContain("After the break.");
          expect(text).not.toContain("pagebreak");
          expect(text).not.toContain("\\newpage");
          expect(text).not.toContain("page-break-after");
        } finally {
          act(() => root.unmount());
          container.remove();
        }
      });
    }
  }

  for (const r of RENDERERS) {
    it(`${r.name}: a directive in code stays code`, async () => {
      const { container, root } = await mount(
        r.render("Use `\\newpage` here.\n\n```md\n<!-- pagebreak -->\n```"),
      );
      try {
        expect(container.querySelectorAll(".matrx-page-break")).toHaveLength(0);
        expect(container.textContent).toContain("\\newpage");
        expect(container.textContent).toContain("<!-- pagebreak -->");
      } finally {
        act(() => root.unmount());
        container.remove();
      }
    });
  }
});

describe("the chat splitter keeps every page-break form inside the text block", () => {
  const source = FORMS.map((f, i) => `Section ${i}.\n\n${f}`).join("\n\n") + "\n\nEnd.";

  it("static split", () => {
    const blocks = splitContentIntoBlocksWith(source, NO_SPLITTER_ENVELOPES).filter((b) => b.content.trim());
    expect(blocks.map((b) => b.type)).toEqual(["text"]);
    for (const f of FORMS) expect(blocks[0]?.content).toContain(f);
  });

  it("streamed in small chunks", () => {
    const latest = new Map<string, { type: string; content?: string; blockIndex: number }>();
    const acc = new StreamBlockAccumulator("pb", (payload: { block: { blockId: string; type: string; content?: string; blockIndex: number } }) => {
      latest.set(payload.block.blockId, payload.block);
      return payload;
    });
    const dispatch = (a: unknown) => a;
    for (let i = 0; i < source.length; i += 5) acc.ingest(source.slice(i, i + 5), dispatch);
    acc.finalize(dispatch);
    const blocks = [...latest.values()].filter((b) => (b.content ?? "").trim());
    expect(blocks.map((b) => b.type)).toEqual(["text"]);
  });
});
