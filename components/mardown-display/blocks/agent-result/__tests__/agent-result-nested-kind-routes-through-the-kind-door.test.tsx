/** @jest-environment jsdom */
//
// KIND_NEVER_RAW B4: an agent run whose structured_output / final_text carries
// a kind that is NOT the top-level value (nested in a plain object, or kind
// text that never finished) used to be re-serialised into a ```json fence and
// pushed back through markdown. It now routes through the one answer door
// (`AnswerValueView`); a truncated kind reaches the door as text, which draws
// its broken state. A kindless unparseable payload keeps its code fence.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const doorCalls: Array<{ value?: unknown; text?: string | null }> = [];
let markdown: string[] = [];

jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: (p: { value?: unknown; text?: string | null }) => {
    doorCalls.push({ value: p.value, text: p.text });
    return <div data-route="door" />;
  },
}));
jest.mock("@/components/official/structured-value/StructuredValueView", () => ({
  StructuredValueView: () => <div data-route="floor" />,
}));
jest.mock("@/features/content-ir/studio/components/KindInstanceRender", () => ({
  __esModule: true,
  default: () => <div data-route="kind" />,
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => {
    markdown.push(content);
    return <div data-route="markdown" />;
  },
}));
jest.mock("@/features/workflow-runtime/components/AgentContentList", () => ({
  AgentContentList: () => null,
}));
jest.mock("@/components/cost/useCostDisplay", () => ({
  useCostDisplay: () => ({ unit: "usd" }),
}));
jest.mock("@ai-matrx/design-system/data-table/uuid-cell", () => ({ MatrxUuidCell: () => null }));

import AgentResultBlock from "../AgentResultBlock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FACTS = {
  durationMs: null, iterations: null, toolCalls: null, costUsd: null, totalTokens: null,
  inputTokens: null, outputTokens: null, finishReason: null, models: [], conversationId: null,
};
const KIND = { __kind: "flashcard_set", title: "Cell biology", cards: [] };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  doorCalls.length = 0;
  markdown = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const render = (data: Record<string, unknown>) =>
  act(() => root.render(<AgentResultBlock serverData={{ content: [], facts: FACTS, ...data }} />));

describe("AgentResultBlock: a kind that is not the top-level value goes through the answer door", () => {
  it("a kind nested in a plain structured_output", () => {
    render({ finalText: null, finalTextIsJson: false, structured: { result: KIND } });
    expect(doorCalls).toHaveLength(1);
    expect(doorCalls[0].value).toEqual({ result: KIND });
    expect(markdown.join("\n")).not.toContain("__kind");
  });
  it("a kind nested deeper than the old private depth limit", () => {
    const deep = { a: { b: { c: { d: { e: KIND } } } } };
    render({ finalText: null, finalTextIsJson: false, structured: deep });
    expect(doorCalls).toHaveLength(1);
    expect(markdown.join("\n")).not.toContain("__kind");
  });
  it("kind text that never finished (truncated final_text)", () => {
    const cut = '{"__kind":"flashcard_set","title":"Cell","cards":[{"front":"Mito';
    render({ finalText: cut, finalTextIsJson: true, structured: null });
    expect(doorCalls).toHaveLength(1);
    expect(doorCalls[0].text).toBe(cut);
    expect(markdown.join("\n")).not.toContain("__kind");
  });
  it("kindless unparseable JSON text keeps its code fence", () => {
    render({ finalText: '{"a": 1, "b":', finalTextIsJson: true, structured: null });
    expect(doorCalls).toHaveLength(0);
    expect(markdown[0]).toContain("```json");
  });
  it("kindless structured data keeps the generic floor", () => {
    render({ finalText: null, finalTextIsJson: false, structured: { a: 1 } });
    expect(container.querySelector('[data-route="floor"]')).not.toBeNull();
  });
});
