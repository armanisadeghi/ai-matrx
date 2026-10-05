/**
 * kind-never-raw R5: a launch variable whose value carries a `__kind` shows
 * through the one answer view (its kind component), never as JSON text.
 * Kindless values still print as text.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../../../../store/hooks", () => ({ useAppSelector: () => ({}) }));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../../../store/hooks"));
jest.mock("@host/components/official/entity-ref/EntityRef", () => ({ EntityRef: () => null }));
jest.mock("@host/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: ({ value }: { value?: unknown }) => (
    <div data-testid="answer-value-view" data-kind={(value as { __kind?: string })?.__kind ?? ""} />
  ),
}));

import { UserMessageVariables } from "../FirstTurnVariables";

const SET = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
};

let root: Root | null = null;
function mount(values: Record<string, unknown>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<UserMessageVariables values={values} />));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("UserMessageVariables", () => {
  it("an object variable carrying a kind renders as that kind", () => {
    const host = mount({ study_cards: SET });
    expect(host.textContent).not.toContain("__kind");
    expect(host.querySelector('[data-kind="flashcard_set"]')).not.toBeNull();
  });

  it("a string variable holding kind JSON renders as that kind", () => {
    const host = mount({ study_cards: JSON.stringify(SET) });
    expect(host.textContent).not.toContain("__kind");
    expect(host.querySelector('[data-kind="flashcard_set"]')).not.toBeNull();
  });

  it("kindless values print as text", () => {
    const host = mount({ topic: "Mitosis" });
    expect(host.textContent).toContain("Mitosis");
    expect(host.querySelector('[data-testid="answer-value-view"]')).toBeNull();
  });
});
