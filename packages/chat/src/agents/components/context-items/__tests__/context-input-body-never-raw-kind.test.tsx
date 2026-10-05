/**
 * Y5 (kind never raw): the saved context snapshot a message was sent with draws
 * any value carrying a `__kind` through the one answer view, never as JSON.
 * Kindless values keep their plain rendering.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@host/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-testid="answer-value-view" />,
}));

import { ContextInputBody } from "../bodies/ContextInputBody";

const SET = { __kind: "flashcard_set", title: "Cell biology", cards: [] };

let root: Root | null = null;
function mount(data: Record<string, unknown>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const item = { refs: { contextInput: { id: "snap-1", data } }, raw: {} };
  act(() => root!.render(<ContextInputBody item={item as never} />));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("ContextInputBody", () => {
  it("an object, a nested kind, an array of kinds and kind text all go through the answer view", () => {
    const host = mount({
      deck: SET,
      wrapper: { inner: SET },
      many: [SET, SET],
      text: JSON.stringify(SET),
    });
    expect(host.textContent).not.toContain("__kind");
    expect(host.querySelectorAll('[data-testid="answer-value-view"]')).toHaveLength(4);
  });
  it("kindless values keep plain rendering", () => {
    const host = mount({ who: "Dana", count: 3, obj: { a: 1 } });
    expect(host.querySelector('[data-testid="answer-value-view"]')).toBeNull();
    expect(host.textContent).toContain("Dana");
    expect(host.textContent).toContain('"a": 1');
  });
});
