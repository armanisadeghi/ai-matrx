/**
 * THE RECONNECT BANNER NEVER ANNOUNCES A QUESTION THAT IS ALREADY ON SCREEN.
 *
 * Live 2026-10-05: an agent asked via `ask_person`; the person answered in the
 * questions box and pressed Send, and "The agent needs your answer. / Show
 * question" stayed above the next approval card. The banner's question face
 * duplicated the PendingAsksZone card that is itself on screen (desktop stacks
 * the cards; mobile shows its own reopen pill), so the stale stamp kept
 * announcing it. The banner stays for what has no card of its own (reconnecting,
 * parked on a person, paused without a question) and says nothing about a
 * question whose card is drawn — an answered ask counts for nothing.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import pendingAsksReducer, {
  enqueuePendingAsk,
  resolvePendingAsk,
  type PendingAsk,
} from "../../ui-first-tools/redux/pending-asks.slice";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WAITING = {
  executionId: "exec-1",
  userRequestId: "5ece0e81-6212-4909-aaec-99da75c72b19",
  status: "waiting_input",
  waitingInput: true,
  recoveryState: "prompt_visible",
  startedAt: null,
  checkedAt: "2026-10-05T00:00:00Z",
};

let pendingAsks = pendingAsksReducer(undefined, { type: "init" });
jest.mock("../../../store/hooks", () => ({
  useAppDispatch: () => jest.fn(() => ({ finally: () => undefined })),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({
      conversations: { byConversationId: { "conv-1": { serverOperation: WAITING } } },
      pendingAsks,
    }),
}));

jest.mock("../../redux/execution-system/thunks/resume-instance.thunk", () => ({
  resumeInstance: jest.fn(),
}));
jest.mock("../reconnect-server-operation.thunk", () => ({
  reconnectServerOperation: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ServerOperationBanner } = require("../ServerOperationBanner") as typeof import("../ServerOperationBanner");

const ask: PendingAsk = {
  callId: "call-1",
  conversationId: "conv-1",
  toolName: "ask_person",
  kind: "approval",
  question: "Approve?",
  status: "pending",
  createdAtMs: 0,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  pendingAsks = pendingAsksReducer(undefined, { type: "init" });
});
function render(): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<ServerOperationBanner conversationId="conv-1" />));
  return host;
}

it("a pending ask whose card is on screen is not announced by the banner", () => {
  pendingAsks = pendingAsksReducer(pendingAsks, enqueuePendingAsk(ask));
  const el = render();
  expect(el.textContent).not.toContain("needs your answer");
  expect(el.textContent).not.toContain("Show question");
});

it("an answered ask is never announced either", () => {
  pendingAsks = pendingAsksReducer(pendingAsks, enqueuePendingAsk(ask));
  pendingAsks = pendingAsksReducer(
    pendingAsks,
    resolvePendingAsk({ callId: "call-1", conversationId: "conv-1" }),
  );
  const el = render();
  expect(el.textContent).not.toContain("needs your answer");
  expect(el.textContent).not.toContain("Show question");
});
