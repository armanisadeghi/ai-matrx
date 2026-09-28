/**
 * GUARD: a turn in flight never unmounts an earlier group of the transcript.
 *
 * The defect (verifier 2026-09-27, /chat 375 with a long conversation): the
 * transcript renders a window of the last N display groups. Sending a message
 * adds the person's row, then the answer's row — each step pushed the group at
 * the top edge out of the window (unmounting every card in it), and a step
 * that briefly removed a group brought it back. Above the viewport it is
 * invisible, but it is a remount of every card in that turn and a layout jump
 * for a reader scrolled up.
 *
 * The seam: the REAL `AgentConversationDisplay` over the REAL messages reducer,
 * driven by the actions a send dispatches (optimistic user row, the answer's
 * reservation, its commit). Only the leaf message components are stubbed, to
 * count mounts and unmounts per group.
 */
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// jsdom has no layout: the transcript scrolls the new user row into view.
Element.prototype.scrollIntoView = function scrollIntoView() {};

const unmounted: string[] = [];
function Probe({ id }: { id: string }) {
  useEffect(() => () => void unmounted.push(id), [id]);
  return <div data-group-probe={id} />;
}

jest.mock("../user/AgentUserMessage", () => ({
  AgentUserMessage: ({ messageId }: { messageId: string }) => (
    <Probe id={messageId} />
  ),
}));
jest.mock("../assistant/AssistantTurnGroup", () => ({
  AssistantTurnGroup: ({
    members,
  }: {
    members: Array<{ messageId: string | null }>;
  }) => <Probe id={members.map((m) => m.messageId).join("+")} />,
}));
jest.mock("../assistant/AgentEmptyMessageDisplay", () => ({
  AgentEmptyMessageDisplay: () => null,
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock("@/features/context-menu-v3/utils/resolveMarkdownContext", () => ({
  resolveMarkdownContext: jest.fn(),
}));
jest.mock("@/features/war-room/utils/renderPathTrace", () => ({
  isWarRoomThreadAgentSurface: () => false,
  traceWarRoomRenderPath: jest.fn(),
}));
jest.mock(
  "@/features/agents/redux/execution-system/thunks/load-conversation.thunk",
  () => ({ loadConversation: jest.fn(() => ({ type: "test/load" })) }),
);

import messages, {
  addOptimisticUserMessage,
  hydrateMessages,
  reserveMessage,
  setVisibleGroupLimit,
  updateMessageRecord,
  type MessageRecord,
} from "@/features/agents/redux/execution-system/messages/messages.slice";
import conversations from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import activeRequests from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { AgentConversationDisplay } from "../AgentConversationDisplay";

const CONV = "5e4d3c2b-1a09-4f8e-9d7c-6b5a4f3e2d1c";

// A clinic manager's long-running conversation about the front-desk intake
// checklist: twelve earlier exchanges.
const TOPICS = [
  "photo ID check",
  "insurance card scan",
  "health history form",
  "blood pressure step",
  "allergy question",
  "medication list",
  "emergency contact",
  "consent signature",
  "copay collection",
  "rooming order",
  "vitals hand-off",
  "late-arrival rule",
];
function row(
  id: string,
  role: "user" | "assistant",
  position: number,
  text: string,
): MessageRecord {
  return {
    id,
    conversationId: CONV,
    agentId: null,
    role,
    content: [{ type: "text", text }],
    contentHistory: null,
    userContent: null,
    position,
    source: "user",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: new Date(2026, 8, 27, 9, 0, position).toISOString(),
    deletedAt: null,
  } as unknown as MessageRecord;
}
const HISTORY: MessageRecord[] = TOPICS.flatMap((topic, i) => [
  row(`u-${i}`, "user", i * 2, `Can you tighten the ${topic} wording?`),
  row(`a-${i}`, "assistant", i * 2 + 1, `Updated the ${topic} step.`),
]);

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  unmounted.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("sending a message never unmounts a group already on screen", () => {
  const store = configureStore({
    reducer: { messages, conversations, activeRequests },
  });
  act(() => {
    store.dispatch(hydrateMessages({ conversationId: CONV, messages: HISTORY }));
    store.dispatch(setVisibleGroupLimit({ conversationId: CONV, limit: 6 }));
  });
  act(() => {
    root.render(
      <Provider store={store}>
        <AgentConversationDisplay conversationId={CONV} />
      </Provider>,
    );
  });
  const onScreen = [...host.querySelectorAll("[data-group-probe]")].map((e) =>
    e.getAttribute("data-group-probe"),
  );
  expect(onScreen.length).toBe(6);

  // The person sends; the answer is reserved, then committed.
  const position = HISTORY.length;
  act(() => {
    store.dispatch(
      addOptimisticUserMessage({
        conversationId: CONV,
        clientTempId: "client-user-intake-13",
        content: [{ type: "text", text: "Add the interpreter-needed question." }],
        position,
      }),
    );
  });
  act(() => {
    store.dispatch(
      reserveMessage({
        conversationId: CONV,
        messageId: "a-new",
        role: "assistant",
        position: position + 1,
        requestId: "req_interpreter_question",
      }),
    );
  });
  act(() => {
    store.dispatch(
      updateMessageRecord({
        conversationId: CONV,
        messageId: "a-new",
        patch: {
          content: [{ type: "text", text: "Added it as step 3b." }],
          status: "active",
          _clientStatus: "complete",
        },
      }),
    );
  });

  // Every group that was on screen before the send is still mounted, and was
  // never unmounted on the way.
  expect(unmounted.filter((id) => onScreen.includes(id))).toEqual([]);
  const after = [...host.querySelectorAll("[data-group-probe]")].map((e) =>
    e.getAttribute("data-group-probe"),
  );
  for (const id of onScreen) expect(after).toContain(id);
});
