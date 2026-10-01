/**
 * kind-never-raw R1 (code editor): when an edit response fails to parse, the
 * response panel draws a `__kind` answer as its kind, never as a JSON <pre>.
 * A kindless response keeps the monospace raw view.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-testid="answer-value-view" />,
}));

import { ErrorPanel } from "../ErrorPanel";

const SET_JSON = JSON.stringify({ __kind: "flashcard_set", title: "Cell biology", cards: [] });

let root: Root | null = null;
function mount(raw: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <ErrorPanel errorMessage="No edits found" rawAIResponse={raw} isCopied={false} onCopyResponse={() => {}} />,
    ),
  );
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

it("a kind response is drawn as its kind", () => {
  const host = mount(SET_JSON);
  expect(host.textContent).not.toContain("__kind");
  expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
});

it("a kindless response keeps the raw monospace view", () => {
  const host = mount("SEARCH:\nfoo\nREPLACE:\nbar");
  const pres = host.querySelectorAll("pre");
  expect(pres[pres.length - 1]?.textContent).toContain("REPLACE:");
});
