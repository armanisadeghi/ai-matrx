/**
 * @jest-environment jsdom
 *
 * ANSWERS SURVIVE A RELOAD — from the server, never the browser. The answers are
 * the block's saved state (platform.block_states through `useBlockState`); the
 * renderer reseeds from it and writes every change back through the state channel.
 *
 * Use case: a bakery owner picks a plan and types her daily volume, reloads the page.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;


import QuestionnaireRenderer from "../QuestionnaireRenderer";
import { separatedMarkdownParser } from "@/components/mardown-display/markdown-classification/processors/custom/parser-separated";

const BODY = [
  "## Q1: How many sales do you ring up on a busy day?",
  "Type: Input",
  "",
  "## Q2: Which plan fits?",
  "Type: Radio",
  "- Starter",
  "- Growth",
].join("\n");

const mount = async (props: { initialState?: Record<string, unknown>; onStateChange?: (s: Record<string, unknown>) => void } = {}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const data = separatedMarkdownParser(BODY);
  await act(async () =>
    root.render(
      <QuestionnaireRenderer
        data={data as never}
        conversationId="bakery-chat"
        messageId="answer-7"
        blockIndex={0}
        questionnaireId="intake-1"
        initialState={props.initialState}
        onStateChange={props.onStateChange as never}
      />,
    ),
  );
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
};

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

it("puts every answer back from the SAVED (server-side) state", async () => {
  const view = await mount({ initialState: { formState: { "Q1: How many sales do you ring up on a busy day?": "about 120", "Q2: Which plan fits?": "Growth" } } });
  await act(async () => { jest.advanceTimersByTime(50); });
  expect((view.container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("about 120");
  expect(view.container.querySelector('[role="radio"][value="Growth"]')?.getAttribute("aria-checked")).toBe("true");
  view.unmount();
});

it("every change goes out through the state channel and NOTHING is kept in the browser", async () => {
  const saved: Record<string, unknown>[] = [];
  const view = await mount({ onStateChange: (s) => saved.push(s) });
  const input = view.container.querySelector('input[type="text"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "about 120");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(JSON.stringify(saved)).toContain("about 120");
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  view.unmount();
});
