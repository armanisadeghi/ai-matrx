/**
 * A PARKED CALL'S CARD FOLLOWS ITS ASK (OpenSEO Wave 1, Lane L, 2026-09-28).
 *
 * Open → the ask's own form, answerable here. Answered here → the conversation is re-read (the
 * resumed turn is already written). Answered elsewhere (the texted link) → the ask is gone from
 * the pending list, and the conversation is re-read ONCE so the finished call replaces the card.
 *
 * AND FOLLOWED (2026-10-01, the /board incident): the server resumes the turn with the tools it
 * parked with, so a page tool the resumed turn calls next is delegated back to this page. The
 * card follows the conversation like any reopen, or that call sits unanswered until a reload.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dispatch = jest.fn(() => ({ unwrap: () => Promise.resolve() }));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => dispatch }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/load-conversation.thunk", () => ({
  loadConversation: (arg: { conversationId: string }) => ({ type: "load", ...arg }),
}));
const follow = jest.fn();
jest.mock("@ai-matrx/chat/agents/runtime-reconnect/follow-what-is-still-in-flight", () => ({
  followWhatIsStillInFlight: (...args: unknown[]) => follow(...args),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

let lookup: unknown = { phase: "loading" };
const hookArgs: unknown[] = [];
jest.mock("@/features/action-requests/hooks/usePendingActionRequest", () => ({
  usePendingActionRequest: (args: unknown) => {
    hookArgs.push(args);
    return lookup;
  },
}));
let answered: (() => void) | undefined;
jest.mock("@/features/action-requests/components/ActionRequestInlineAnswer", () => ({
  ActionRequestInlineAnswer: ({ onAnswered }: { onAnswered?: () => void }) => {
    answered = onAnswered;
    return <div data-testid="form">form</div>;
  },
}));
jest.mock("@/features/action-requests/self-service", () => ({
  fetchPendingActionRequests: jest.fn(() => Promise.resolve([])),
}));

import { ParkedOnPersonCard } from "../ParkedOnPersonCard";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(el: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  dispatch.mockClear();
  follow.mockClear();
  hookArgs.length = 0;
  answered = undefined;
});

const OPEN = {
  phase: "open",
  request: {
    request_id: "09322c83-d5ab-403b-b29e-f38ea6149b4d",
    kind: "approve_spend",
    render: { __kind: "action_request.render", form: "approve_spend", title: "Approve up to $0.29?" },
    organization_id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
    conversation_id: "conv-1",
    link_expires_at: null,
    link_live: true,
    answer_by: null,
    created_at: "2026-09-28T23:04:56Z",
  },
};

it("draws the ask's own form with its title, and re-reads the chat once answered here", () => {
  lookup = OPEN;
  const el = mount(
    <ParkedOnPersonCard actionRequestId="09322c83-d5ab-403b-b29e-f38ea6149b4d" conversationId="conv-1" />,
  );
  expect(el.textContent).toContain("Approve up to $0.29?");
  expect(el.querySelector("[data-testid=form]")).not.toBeNull();
  expect(dispatch).not.toHaveBeenCalled();
  act(() => answered?.());
  expect(dispatch).toHaveBeenCalledWith({ type: "load", conversationId: "conv-1" });
});

it("an ask answered elsewhere re-reads the chat exactly once and says so", () => {
  lookup = { phase: "closed" };
  const el = mount(<ParkedOnPersonCard actionRequestId="r-1" conversationId="conv-1" />);
  expect(el.textContent).toContain("This ask has been answered");
  expect(dispatch).toHaveBeenCalledTimes(1);
  act(() => root!.render(<ParkedOnPersonCard actionRequestId="r-1" conversationId="conv-1" />));
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it("live and unnamed, it looks for the conversation's newest ask while the row mints", () => {
  lookup = { phase: "loading" };
  mount(<ParkedOnPersonCard actionRequestId={null} conversationId="conv-1" />);
  expect(hookArgs[0]).toEqual({
    requestId: null,
    conversationId: "conv-1",
    kind: null,
    stillMinting: true,
  });
});

it("answered here, it follows the resumed turn so a page tool it delegates is answered on this page", async () => {
  lookup = OPEN;
  mount(
    <ParkedOnPersonCard actionRequestId="09322c83-d5ab-403b-b29e-f38ea6149b4d" conversationId="conv-1" />,
  );
  await act(async () => {
    answered?.();
    await Promise.resolve();
  });
  expect(follow).toHaveBeenCalledTimes(1);
  expect(follow).toHaveBeenCalledWith(dispatch, "conv-1");
});

it("answered elsewhere, it follows the resumed turn once the chat is re-read", async () => {
  lookup = { phase: "closed" };
  await act(async () => {
    mount(<ParkedOnPersonCard actionRequestId="r-1" conversationId="conv-1" />);
    await Promise.resolve();
  });
  expect(follow).toHaveBeenCalledTimes(1);
  expect(follow).toHaveBeenCalledWith(dispatch, "conv-1");
});
