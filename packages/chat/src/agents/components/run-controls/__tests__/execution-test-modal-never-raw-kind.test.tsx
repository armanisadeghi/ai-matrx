/**
 * kind-never-raw R1: the execution test harness (direct + inline modes) draws
 * a `__kind` answer through the one answer view, never a JSON <pre>.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SET_JSON = JSON.stringify({ __kind: "flashcard_set", title: "Cell biology", cards: [] });
let answer = SET_JSON;

jest.mock("@host/lib/redux/hooks", () => ({ useAppSelector: (sel: () => unknown) => sel() }));
jest.mock("../../../redux/execution-system/selectors/aggregate.selectors", () => ({
  selectLatestAccumulatedText: () => () => answer,
  selectLatestRequestStatus: () => () => "complete",
}));
jest.mock("../../../redux/execution-system/active-requests/useRetainRequestForViewer", () => ({
  useRetainLatestRequestForViewer: () => undefined,
}));
jest.mock("../../../hooks/useAgentLauncher", () => ({
  useAgentLauncher: () => ({ launchAgent: async () => ({ conversationId: "c1" }), close: () => {} }),
}));
jest.mock("../../../hooks/useWidgetHandle", () => ({ useWidgetHandle: () => ({}) }));
jest.mock("../../../redux/agent-definition/selectors", () => ({ selectAgentName: () => () => "" }));
jest.mock("@host/components/official/entity-ref/EntityDoorControls", () => ({ EntityDoorControls: () => null }));
jest.mock("@host/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@host/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-testid="answer-value-view" />,
}));

import { DirectTestMode, InlineTestMode } from "../AgentExecutionTestModal";

let root: Root | null = null;
async function mountAndRun(el: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  const run = [...host.querySelectorAll("button")].find((b) => /Execute|Run Inline/.test(b.textContent ?? ""));
  await act(async () => {
    run!.click();
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

const props = { agentId: "a1", surfaceKey: "s", variables: {}, userInput: "hi", apiEndpointMode: "agent" as never };

it("direct mode draws a kind answer as its kind", async () => {
  const host = await mountAndRun(<DirectTestMode {...props} />);
  expect(host.textContent).not.toContain("__kind");
  expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
});

it("inline mode draws a kind answer as its kind", async () => {
  const host = await mountAndRun(<InlineTestMode {...props} />);
  expect(host.textContent).not.toContain("__kind");
  expect(host.querySelector('[data-testid="answer-value-view"]')).not.toBeNull();
});
