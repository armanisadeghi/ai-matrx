/**
 * A TURN WAITING ON A PERSON IS NEVER "CONTINUED" FROM THE BANNER (OpenSEO Wave 1, Lane L, 2026-09-29).
 *
 * The reconnect stamps `waiting_on_person` when the turn is parked on an open action request
 * (an approve-spend ask). The banner said "The agent paused without a visible question." and
 * offered "Continue agent" — a button that resumes a turn still waiting on someone's approval.
 * Waiting on a person, it says so and points at the ask; only the answer resumes the turn.
 *
 * RED before the lane: SERVER_OPERATION_BANNER_UNDER_TEST points at the pre-lane copy.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let operation: unknown = null;
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(() => ({ finally: () => undefined })),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ conversations: { byConversationId: { "conv-1": { serverOperation: operation } } } }),
}));
jest.mock("@/features/agents/ui-first-tools/redux/pending-asks.slice", () => ({
  selectActivePendingAsksForConversation: () => () => [],
}));
jest.mock("@/features/agents/redux/execution-system/thunks/resume-instance.thunk", () => ({
  resumeInstance: jest.fn(),
}));
jest.mock("@/features/agents/runtime-reconnect/reconnect-server-operation.thunk", () => ({
  reconnectServerOperation: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ServerOperationBanner } = require(
  process.env.SERVER_OPERATION_BANNER_UNDER_TEST ?? "../ServerOperationBanner",
) as typeof import("../ServerOperationBanner");

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function render(): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<ServerOperationBanner conversationId="conv-1" />));
  return host;
}

const WAITING = {
  executionId: "exec-1",
  userRequestId: "5ece0e81-6212-4909-aaec-99da75c72b19",
  status: "waiting_input",
  waitingInput: true,
  startedAt: null,
  checkedAt: "2026-09-29T00:00:00Z",
};

it("waiting on a person: says so, points at the ask, offers no 'Continue agent'", () => {
  operation = { ...WAITING, recoveryState: "waiting_on_person" };
  const el = render();
  expect(el.textContent).toContain("waiting for your answer");
  expect(el.textContent).not.toContain("Continue agent");
  expect(el.textContent).not.toContain("paused without a visible question");
  expect(Array.from(el.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Show"]);
});

it("a turn that genuinely needs action still offers to continue", () => {
  operation = { ...WAITING, recoveryState: "needs_action" };
  const el = render();
  expect(el.textContent).toContain("Continue agent");
});
