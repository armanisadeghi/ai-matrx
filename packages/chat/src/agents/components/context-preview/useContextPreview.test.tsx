/**
 * The context preview's failure guard.
 *
 * ONE behaviour, and it is the one that was broken: a failed read must name the
 * cause the SERVER gave. `extractErrorMessage` answers the string "Unknown
 * error" for an absent detail — a TRUTHY value — so `extractErrorMessage(detail)
 * || error.message` never reached the message, and every 404/409/500 without a
 * `detail` body rendered as "Unknown error" while the real sentence sat unread
 * one property away. (Same class fixed the same day in
 * `features/ai-work/conversations/components/useCodingReplyResponder.ts`.)
 *
 * Nothing here mocks the hook's own code — only the API door, the Redux hooks
 * it rides on, and the two selectors it reads.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock("@/lib/redux/hooks", () => ({
  // The door itself is the mock, so dispatch only hands back what it produced.
  useAppDispatch: () => (thunk: unknown) => thunk,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(undefined),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectScopeSelectionsContext: () => ({}),
}));
jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.selectors",
  () => ({
    selectConversationScopeIds: () => () => ({ organizationId: undefined }),
  }),
);

import { callApi } from "@/lib/api/call-api";
import { useContextPreview, type ContextPreviewState } from "./useContextPreview";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type DoorResult = {
  data?: unknown;
  error?: {
    type: string;
    message: string;
    status?: number;
    serverDetail?: unknown;
  };
};
const door = callApi as unknown as jest.Mock<Promise<DoorResult>, [unknown]>;

/** Mounts the real hook and exposes the state it last rendered. */
async function mountHook() {
  const seen: { state: ContextPreviewState | null } = { state: null };
  function Probe() {
    seen.state = useContextPreview({ conversationId: "conv-1", enabled: true });
    return null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(<Probe />);
  });
  return {
    state: () => {
      if (!seen.state) throw new Error("the hook rendered no state");
      return seen.state;
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe("useContextPreview", () => {
  beforeEach(() => {
    door.mockReset();
  });

  it("reports the server's own message when the failure carries no detail body", async () => {
    door.mockResolvedValue({
      error: {
        type: "http_error",
        message: "No agent is bound to this conversation yet.",
        status: 404,
      },
    });

    const view = await mountHook();
    expect(view.state().status).toBe("error");
    expect(view.state().error).toBe(
      "No agent is bound to this conversation yet.",
    );
    // The absent-detail placeholder must never stand in for a message we have.
    expect(view.state().error).not.toBe("Unknown error");
    await view.unmount();
  });

  it("prefers the server's detail body when there is one", async () => {
    door.mockResolvedValue({
      error: {
        type: "http_error",
        message: "Request failed with status 422",
        status: 422,
        serverDetail: { detail: "scope_ids[0] is not a scope you can read." },
      },
    });

    const view = await mountHook();
    expect(view.state().error).toContain(
      "scope_ids[0] is not a scope you can read.",
    );
    await view.unmount();
  });
});
