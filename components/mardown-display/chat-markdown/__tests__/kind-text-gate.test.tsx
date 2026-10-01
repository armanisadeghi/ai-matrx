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
const KINDLESS = 'Data:\n\n```json\n{"name":"Ada","role":"Engineer"}\n```\n';

type Leaf = [string, (content: string) => React.ReactElement];
const LEAVES: Leaf[] = [
  ["BasicMarkdownContent", (c) => <BasicMarkdownContent content={c} showCopyButton={false} />],
  ["ConfigurableMarkdownContent", (c) => <ConfigurableMarkdownContent content={c} showCopyButton={false} />],
  ["MarkdownRenderer", (c) => <MarkdownRenderer content={c} />],
  ["MarkdownWithPlugins", (c) => <MarkdownWithPlugins content={c} components={{}} />],
];

describe("markdown leaves hand kind text to the canonical pipeline", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    mockCaptureError.mockClear();
    mockStreamCalls.length = 0;
    resetKindAtRawRendererReports();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each(LEAVES)("%s: a fenced kind renders as its kind, never raw, and is reported", (name, render) => {
    act(() => root.render(render(FENCED_KIND)));
    expect(container.querySelector('[data-kind-route="1"]')).not.toBeNull();
    expect(container.textContent).not.toContain('"__kind"');
    expect(container.textContent).toContain("Here you go:");
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "content-ir",
        relation: "flashcard_set",
        message: expect.stringContaining(name),
      }),
    );
  });

  it.each(LEAVES)("%s: a bare whole-text kind object is fenced for the pipeline", (_name, render) => {
    act(() => root.render(render(KIND_OBJECT)));
    expect(mockStreamCalls[0]).toBe(`\`\`\`json\n${KIND_OBJECT}\n\`\`\``);
    expect(container.textContent).not.toContain('"__kind"');
  });

  it.each(LEAVES)("%s: kindless JSON stays JSON", (_name, render) => {
    act(() => root.render(render(KINDLESS)));
    expect(container.querySelector('[data-pipeline="markdown-stream"]')).toBeNull();
    expect(container.textContent).toContain('"name"');
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it("a kind fence the pipeline hands back renders once (no loop)", () => {
    // An unlabelled fence: the stand-in only lifts ```json, so it hands this
    // text straight back to the leaf — the guard must stop at one hop.
    const text = 'Result:\n\n```\n{"__kind":"timeline","events":[]}\n```\n';
    act(() => root.render(<BasicMarkdownContent content={text} showCopyButton={false} />));
    expect(mockStreamCalls).toHaveLength(1);
    expect(container.querySelectorAll('[data-pipeline="markdown-stream"]')).toHaveLength(1);
  });

  it.each([
    ["an xml fence", 'Payload:\n\n```xml\n<a/>\n{"__kind":"artifact","content":"x"}\n```\n'],
    ["an inline code span", 'The marker is `{"__kind": "x"}` on every payload.'],
    ["a sentence", 'It returned {"__kind":"x"} without a fence.'],
  ])("a kind key inside %s is not a kind region and stays as written", (_label, text) => {
    act(() => root.render(<BasicMarkdownContent content={text} showCopyButton={false} />));
    expect(mockStreamCalls).toHaveLength(0);
    expect(container.textContent).toContain('"__kind"');
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it("a deliberate source view keeps the text as written", () => {
    act(() =>
      root.render(<BasicMarkdownContent content={FENCED_KIND} showSource showCopyButton={false} />),
    );
    expect(container.querySelector('[data-pipeline="markdown-stream"]')).toBeNull();
    expect(container.textContent).toContain('"__kind"');
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
