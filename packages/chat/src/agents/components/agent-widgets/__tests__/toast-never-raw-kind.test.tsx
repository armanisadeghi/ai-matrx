/**
 * kind-never-raw S3: the collapsed agent toast never prints a `__kind`
 * answer's JSON — complete kinds read as markdown, an arriving kind shows its
 * loader. Kindless text is shown unchanged.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let answer = "";
let executing = false;
jest.mock("../../../../store/hooks", () => ({
  useAppSelector: (sel: () => unknown) => sel(),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.

jest.mock("../../../redux/execution-system/selectors/aggregate.selectors", () => ({
  selectLatestAccumulatedText: () => () => answer,
  selectIsExecuting: () => () => executing,
}));
jest.mock("../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors", () => ({
  selectInstanceDisplayTitle: () => () => "Study helper",
}));
jest.mock("../../../redux/execution-system/active-requests/useRetainRequestForViewer", () => ({
  useRetainLatestRequestForViewer: () => undefined,
}));
jest.mock("../../smart/AgentRunner", () => ({ AgentRunner: () => null }));

import { AgentToastOverlay } from "../AgentToastOverlay";

const SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
});

let root: Root | null = null;
function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<AgentToastOverlay conversationId="c1" onClose={() => {}} />));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("AgentToastOverlay (collapsed)", () => {
  it("a settled kind answer reads as markdown", () => {
    answer = SET_JSON;
    expect(mount().textContent).not.toContain("__kind");
  });
  it("an arriving kind shows its loader, not its JSON", () => {
    answer = 'Here:\n```json\n{"__kind": "flashcard_set", "title": "Ce';
    executing = true;
    const host = mount();
    executing = false;
    expect(host.textContent).not.toContain("__kind");
    expect(host.querySelector('[data-kind-loader="flashcard_set"]')).not.toBeNull();
  });
  it("a kind that never finished shows its broken line once the run is over", () => {
    answer = 'Here:\n```json\n{"__kind": "flashcard_set", "title": "Ce';
    const host = mount();
    expect(host.querySelector('[data-kind-loader]')).toBeNull();
    expect(host.querySelector('[data-kind-broken="flashcard_set"]')).not.toBeNull();
    expect(host.textContent).toContain("Flashcard Set did not finish");
  });
  it("kindless text is unchanged", () => {
    answer = "All done.";
    expect(mount().textContent).toContain("All done.");
  });
});
