/**
 * @jest-environment jsdom
 *
 * ANSWERS SURVIVE A RELOAD. Live walk 2026-10-05: after Submit ("4 answers" chip)
 * and a reload, the chip persisted but every answer showed unselected. A questionnaire
 * that has not materialized has no artifact-state row, so nothing put the answers back.
 *
 * Use case: a bakery owner picks a plan and types her daily volume, reloads the page.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));

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

const mount = async (conversationId = "bakery-chat") => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const data = separatedMarkdownParser(BODY);
  await act(async () =>
    root.render(
      <QuestionnaireRenderer data={data as never} conversationId={conversationId} messageId="answer-7" blockIndex={0} questionnaireId="intake-1" />,
    ),
  );
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
};

beforeEach(() => { localStorage.clear(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

it("puts every answer back after a reload", async () => {
  const first = await mount();
  const input = first.container.querySelector('input[type="text"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "about 120");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const growth = first.container.querySelector('[role="radio"][value="Growth"]') as HTMLButtonElement;
  await act(async () => { growth.click(); });
  await act(async () => { jest.advanceTimersByTime(800); });
  first.unmount();

  const second = await mount();
  await act(async () => { jest.advanceTimersByTime(50); });
  expect((second.container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("about 120");
  expect(second.container.querySelector('[role="radio"][value="Growth"]')?.getAttribute("aria-checked")).toBe("true");
  second.unmount();
});

it("a different conversation does not inherit them", async () => {
  const first = await mount();
  const input = first.container.querySelector('input[type="text"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "about 120");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { jest.advanceTimersByTime(800); });
  first.unmount();
  const other = await mount("other-chat");
  expect((other.container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("");
  other.unmount();
});
