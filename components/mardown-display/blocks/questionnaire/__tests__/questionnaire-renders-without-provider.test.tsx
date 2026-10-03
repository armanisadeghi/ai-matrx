/**
 * @jest-environment jsdom
 *
 * A QUESTIONNAIRE RENDERS WHEREVER IT IS HOSTED. The unified kind path
 * (QuestionnaireArtifact) renders QuestionnaireRenderer with no
 * QuestionnaireProvider above it; until 2026-10-03 that threw
 * "useQuestionnaireContext must be used within a QuestionnaireProvider" into the
 * markdown error boundary, so every `<questionnaire>` an agent wrote in chat showed
 * "its view hit an error" and its Submit (answers ride the next message) was unreachable.
 *
 * Use case: a bakery owner answers two intake questions an agent asked before recommending a setup.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dispatch = jest.fn();
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => dispatch }));

import QuestionnaireRenderer from "../QuestionnaireRenderer";
import { separatedMarkdownParser } from "@/components/mardown-display/markdown-classification/processors/custom/parser-separated";

const BODY = [
  "## Q1: How many sales do you ring up on a busy day?",
  "Type: Input",
  "",
  "## Q2: Which reports do you need?",
  "Type: Checkbox",
  "- Daily totals",
  "- Best sellers",
].join("\n");

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

it("renders its questions and Submit with no QuestionnaireProvider above it", async () => {
  const data = separatedMarkdownParser(BODY);
  await act(async () =>
    root.render(
      <QuestionnaireRenderer
        data={data as never}
        questionnaireId="intake-1"
        conversationId="bakery-chat"
        messageId="answer-7"
        blockIndex={0}
      />,
    ),
  );
  expect(container.textContent).toContain("How many sales do you ring up on a busy day?");
  expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Submit")).toBe(true);
});
