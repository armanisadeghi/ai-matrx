/**
 * @jest-environment jsdom
 *
 * A RADIO "OTHER" SHOWS ITS FREE-TEXT FIELD and the typed text rides the submitted answers (saved in the block's state; the host derives the chip).
 * Regression: the radio question passed a string to isOtherOption (which takes an option object),
 * so the Other field never appeared.
 *
 * Use case: a bakery owner picks "Other" for her point-of-sale system and types the name.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const staged: unknown[] = [];

import QuestionnaireRenderer from "../QuestionnaireRenderer";
import { separatedMarkdownParser } from "@/components/mardown-display/markdown-classification/processors/custom/parser-separated";

const BODY = ["## Q1: Which register system do you use?", "Type: Radio", "- Square", "- Other"].join("\n");

it("shows the Other field and submits the typed text", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const data = separatedMarkdownParser(BODY);
  await act(async () =>
    root.render(<QuestionnaireRenderer data={data as never} conversationId="c1" messageId="m1" blockIndex={0} questionnaireId="q1" onStateChange={((s: unknown) => staged.push(s)) as never} />),
  );
  expect(container.querySelector('input[type="text"]')).toBeNull();
  await act(async () => { (container.querySelector('[role="radio"][value="Other"]') as HTMLButtonElement).click(); });
  const input = container.querySelector('input[type="text"]') as HTMLInputElement;
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Toast POS");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Submit")!.click(); });
  expect(JSON.stringify(staged)).toContain("Other: Toast POS");
  act(() => root.unmount());
});
