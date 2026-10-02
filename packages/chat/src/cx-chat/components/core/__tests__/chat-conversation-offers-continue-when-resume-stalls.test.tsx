/**
 * The cx-chat conversation never stalls silently after a delegated-tool resume gives up.
 *
 * Break this guards (2026-10-01): when `resumeInstance` cannot continue a
 * hard-suspended turn (the suspending stream never closed), it stamps the
 * conversation's `serverOperation` as `needs_action` so ServerOperationBanner
 * offers "Continue agent". The agent window and widget hosts render that
 * banner; cx-chat's ChatConversationClient did not — the turn sat on its tool
 * card with no answer and no way to continue. Renders the REAL
 * ChatConversationClient with the REAL banner; only heavy children, routing
 * and the thunks the banner would dispatch are stubbed.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION = "408ed1d2-5a70-478c-92c8-13ad94b91412";
let serverOperation: unknown = null;

const fakeState = () => ({
  conversations: {
    byConversationId: { [CONVERSATION]: { serverOperation } },
  },
});

jest.mock("../../../../store/hooks", () => ({
  useAppDispatch: () => jest.fn(() => ({ finally: () => undefined })),
  useAppSelector: (sel: (s: unknown) => unknown) => sel(fakeState()),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../../store/hooks"));
jest.mock("@host/lib/redux/slices/userSlice", () => ({
  selectUserContext: () => ({ isAuthenticated: true, isAdmin: false }),
}));
jest.mock("@host/lib/redux/slices/apiConfigSlice", () => ({
  selectActiveServer: () => "local",
  selectResolvedBaseUrl: () => "http://localhost:8200",
  selectActiveServerHealth: () => ({ status: "healthy", latencyMs: null }),
}));
jest.mock(
  "../../../../agents/redux/execution-system/selectors/aggregate.selectors",
  () => ({
    selectLatestConversationId: () => () => null,
    selectLatestRequestStatus: () => () => null,
    selectIsExecuting: () => () => false,
  }),
);
jest.mock("../../../_legacy-stubs", () => ({
  selectTurnCount: () => () => 1,
}));
jest.mock("@host/hooks/useDebugContext", () => ({
  useDebugContext: () => ({ publish: () => undefined, isActive: false }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("next/dynamic", () => () => () => null);
jest.mock(
  "../../../../agents/components/messages-display/AgentConversationDisplay",
  () => ({ AgentConversationDisplay: () => null }),
);
jest.mock(
  "../../../../agents/components/inputs/smart-input/SmartAgentInput",
  () => ({ SmartAgentInput: () => null }),
);
jest.mock("@host/features/matrx-envelope/components/ProposedDirectivesZone", () => ({
  ProposedDirectivesZone: () => null,
}));
jest.mock("../../../../agents/ui-first-tools/redux/pending-asks.slice", () => ({
  selectActivePendingAsksForConversation: () => () => [],
}));
jest.mock("../../../../agents/redux/execution-system/thunks/resume-instance.thunk", () => ({
  resumeInstance: jest.fn(),
}));
jest.mock("../../../../agents/runtime-reconnect/reconnect-server-operation.thunk", () => ({
  reconnectServerOperation: jest.fn(),
}));

import ChatConversationClient from "../ChatConversationClient";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  serverOperation = null;
});

function render(): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <ChatConversationClient
        conversationId={CONVERSATION}
        agentId="b6856700-042b-4d91-8660-1604438d1bd2"
      />,
    ),
  );
  return host;
}

it("offers 'Continue agent' when a resume could not continue the turn", () => {
  serverOperation = {
    executionId: "",
    userRequestId: "8c295111-5fe7-4a14-84f9-27fbc45bf80f",
    status: "waiting_input",
    waitingInput: true,
    recoveryState: "needs_action",
    startedAt: null,
    checkedAt: "2026-10-01T23:00:05Z",
  };
  const el = render();
  const labels = Array.from(el.querySelectorAll("button")).map((b) => b.textContent);
  expect(labels).toContain("Continue agent");
});

it("shows nothing extra when no operation is pending", () => {
  const el = render();
  expect(el.textContent).not.toContain("Continue agent");
});
