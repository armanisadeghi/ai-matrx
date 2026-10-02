/**
 * kind-never-raw O2: the generic context-item drawer body draws a `__kind`
 * (in its text or its payload) through the one answer view, never as JSON.
 * Kindless text and kindless payloads keep their plain rendering.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@host/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-testid="answer-value-view" />,
}));

import { GenericBody } from "../bodies/GenericBody";

const SET = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
};

let root: Root | null = null;
function mount(item: unknown) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<GenericBody item={item as never} />));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("GenericBody", () => {
  it("kind text renders as the kind", () => {
    const host = mount({ refs: { text: JSON.stringify(SET) }, raw: {} });
    expect(host.textContent).not.toContain("__kind");
    expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
  });
  it("a payload carrying a kind renders as the kind", () => {
    const host = mount({ refs: {}, raw: { type: "table", value: SET } });
    expect(host.textContent).not.toContain("__kind");
    expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
  });
  it("kindless text and payloads keep plain rendering", () => {
    expect(mount({ refs: { text: "Notes" }, raw: {} }).textContent).toBe("Notes");
    act(() => root?.unmount());
    expect(mount({ refs: {}, raw: { a: 1 } }).textContent).toContain('"a": 1');
  });
});
