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

// Copy confirms through the package notify port; no host is configured here.
jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("@ai-matrx/chat/store/hooks", () => ({ useAppSelector: (sel: () => unknown) => sel() }));
// The host code this test renders reads the app's own hooks (P3): one double covers both.

jest.mock("@ai-matrx/chat/agents/redux/execution-system/selectors/aggregate.selectors", () => ({
  selectLatestAccumulatedText: () => () => answer,
  selectLatestRequestStatus: () => () => "complete",
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/active-requests/useRetainRequestForViewer", () => ({
  useRetainLatestRequestForViewer: () => undefined,
}));
jest.mock("@ai-matrx/chat/agents/hooks/useAgentLauncher", () => ({
  useAgentLauncher: () => ({ launchAgent: async () => ({ conversationId: "c1" }), close: () => {} }),
}));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({ useWidgetHandle: () => ({}) }));
jest.mock("@ai-matrx/chat/agents/redux/agent-definition/selectors", () => ({ selectAgentName: () => () => "" }));

jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual<Record<string, unknown>>("@ai-matrx/design-system"),
  ...({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}),
}));
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
registerChatUi({
  AnswerValueView: () => <div data-testid="answer-value-view" />,
});

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

it("direct mode's plain Copy puts the kind's markdown on the clipboard, never raw JSON", async () => {
  const writeText = jest.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const host = await mountAndRun(<DirectTestMode {...props} />);
  const copy = [...host.querySelectorAll("button")].find((b) => b.textContent === "Copy");
  await act(async () => {
    copy!.click();
  });
  expect(writeText).toHaveBeenCalledTimes(1);
  const text = (writeText.mock.calls[0] as unknown as [string])[0];
  expect(text).not.toContain("__kind");
  expect(text).toContain("Cell biology");
});
