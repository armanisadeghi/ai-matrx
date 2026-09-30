/**
 * @jest-environment jsdom
 *
 * A SCHEMA-BOUND AGENT'S ANSWER THAT HOLDS ROWS OFFERS THE ONE SAVE TO A TABLE (SAVE-AS-TABLE-EVERYWHERE,
 * VERIFIER-30 #6). A clinic's intake agent answers with its declared keys, one of them a list of
 * records; the answer's Details carry "Save to a table", which opens the one overlay with the value.
 * An answer with no rows carries no such control.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const opened: Array<Record<string, unknown>> = [];
jest.mock("@/features/overlays/openers/saveToTable", () => ({
  useOpenSaveToTable: () => (options: Record<string, unknown>) => {
    opened.push(options);
    return { instanceId: "t", close: () => undefined };
  },
}));

import { StructuredAgentAnswerBlock } from "./StructuredAgentAnswerBlock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(value: Record<string, unknown>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<StructuredAgentAnswerBlock value={value} rawContent={JSON.stringify(value)} renderMarkdown={(t: string) => <p>{t}</p>} />));
  return { host, root };
}

afterEach(() => {
  opened.length = 0;
  document.body.innerHTML = "";
});

it("an answer with a list of records offers Save to a table and hands the value over", () => {
  const value = {
    answer: "Three patients are due for a re-evaluation this week.",
    patients: [
      { name: "Priya Vantana", visit: "Re-evaluation" },
      { name: "Omar Haddad", visit: "Re-evaluation" },
    ],
  };
  const { host } = mount(value);
  const button = host.querySelector('[aria-label="Save to a table"]') as HTMLButtonElement | null;
  expect(button).not.toBeNull();
  act(() => button!.click());
  expect(opened).toHaveLength(1);
  expect(opened[0]!.value).toEqual(value);
});

it("an answer with no rows carries no Save to a table", () => {
  const { host } = mount({ answer: "Nothing is due this week.", status: "done" });
  expect(host.querySelector('[aria-label="Save to a table"]')).toBeNull();
});
