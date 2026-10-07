/** @jest-environment jsdom */
/**
 * X1 (round 3 of "a __kind is never shown raw") — the XML CARD and the compact
 * code snippet.
 *
 * Ruling (b): an XML TAG the model wraps content in is STRUCTURE — a kind in
 * its prose renders as the kind. Ruling (a): a ```xml FENCE is quoted source —
 * the kind stays as written. The attacker's leak: the card wrapped ALL prose
 * in a source view, so a short kind reached the inline code snippet (no kind
 * check) and stayed raw for good.
 *
 * RED BEFORE GREEN: before the fix the structure card drew `"__kind"` text and
 * the snippet printed settled kind JSON.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => jest.requireActual("@ai-matrx/rich-content/markdown-core/MarkdownCoreImpl").default,
}));
jest.mock("@/components/rich-content/standard/StandardKindRegion", () => ({
  __esModule: true,
  default: ({ value }: { value: { __kind?: string } }) => (
    <div data-route="kind">{value.__kind}</div>
  ),
  StandardBrokenKind: ({ slug }: { slug: string | null }) => (
    <div data-route="broken">{slug}</div>
  ),
}));
jest.mock("@/components/mardown-display/chat-markdown/InlineCodeSnippetKindGate", () => ({
  __esModule: true,
  default: ({ value }: { value: { __kind?: string } }) => (
    <div data-route="snippet-kind">{value.__kind}</div>
  ),
}));
jest.mock("@/features/code-editor/components/code-block/highlight/ShikiCodeView", () => ({
  ShikiCodeView: ({ code }: { code: string }) => <pre data-route="code">{code}</pre>,
}));

import XmlBlock from "../XmlBlock";
import { InlineCodeSnippet } from "@/components/mardown-display/chat-markdown/InlineCodeSnippet";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[]}';

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

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("X1: an XML TAG is structure — a kind in its prose renders as the kind", () => {
  it.each([
    ["bare kind, never closed", `<output>\n${KIND}`],
    ["short ```json fence in a closed tag", `<output>\n\`\`\`json\n${KIND}\n\`\`\`\n</output>`],
  ])("%s", async (_label, content) => {
    await render(<XmlBlock content={content} quotedSource={false} />);
    expect(container.querySelector('[data-route="kind"]')?.textContent).toBe("flashcard_set");
    expect(container.textContent).not.toContain('"__kind"');
  });

  it("a ```xml FENCE (quoted source) keeps the kind as written", async () => {
    await render(<XmlBlock content={`<output>\n${KIND}\n</output>`} quotedSource />);
    expect(container.querySelector('[data-route="kind"]')).toBeNull();
    expect(container.querySelector('[data-route="snippet-kind"]')).toBeNull();
    expect(container.textContent).toContain('"__kind"');
  });
});

describe("X1: the compact snippet refuses settled kind JSON", () => {
  it.each(["json", "jsonc", undefined])("language %s → the kind", async (language) => {
    await render(<InlineCodeSnippet code={KIND} language={language} />);
    expect(container.querySelector('[data-route="snippet-kind"]')?.textContent).toBe("flashcard_set");
  });

  it("kindless JSON, another language, streaming text and a source view stay code", async () => {
    await render(
      <>
        <InlineCodeSnippet code='{"a":1}' language="json" />
        <InlineCodeSnippet code={KIND} language="ts" />
        <InlineCodeSnippet code={KIND} language="json" isStreamActive />
        <InlineCodeSnippet code={KIND} language="json" showSource />
      </>,
    );
    expect(container.querySelector('[data-route="snippet-kind"]')).toBeNull();
  });
});
