/**
 * kind-never-raw O2: a context value carrying a `__kind` (markdown text, plain
 * text, or json) is drawn through the one answer view, never as JSON text.
 * Kindless values keep their own rendering.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/matrx-envelope/MatrxEnvelopeBlock", () => ({ __esModule: true, default: () => null }));
jest.mock("@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent", () => ({
  BasicMarkdownContent: ({ content }: { content: string }) => <div data-testid="basic-md">{content}</div>,
}));
jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-testid="answer-value-view" />,
}));

import { ContextValueDisplay } from "../ContextValueDisplay";
import type { ContextFieldKind } from "@ai-matrx/records/scopes";
import type { ContextCellLike } from "@/features/scopes/utils/referenceCell";

const SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
});

let root: Root | null = null;
function mount(el: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("ContextValueDisplay", () => {
  it.each([
    ["markdown text", { kind: "markdown", value: SET_JSON, references: [] }, "markdown"],
    ["plain text", { kind: "string", value: SET_JSON, references: [] }, null],
    ["json", { kind: "object", value: JSON.parse(SET_JSON), references: [] }, null],
  ] as Array<[string, ContextCellLike, ContextFieldKind | null]>)("a kind in %s renders as the kind", (_label, value, kind) => {
    const host = mount(<ContextValueDisplay value={value} kind={kind} />);
    expect(host.textContent).not.toContain("__kind");
    expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
  });

  it("kindless markdown and text keep their rendering", () => {
    expect(mount(<ContextValueDisplay value={{ kind: "markdown", value: "**hi**", references: [] }} />).querySelector('[data-testid="basic-md"]')).not.toBeNull();
    act(() => root?.unmount());
    expect(mount(<ContextValueDisplay value={{ kind: "string", value: "plain", references: [] }} />).textContent).toBe("plain");
  });
});
