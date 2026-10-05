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

jest.mock("../../../host/server/call-api", () => ({ callApi: jest.fn() }));
jest.mock("../../../store/hooks", () => ({
  // The door itself is the mock, so dispatch only hands back what it produced.
  // A function thunk (the door read) runs against an empty state.
  useAppDispatch: () => (thunk: unknown) =>
    typeof thunk === "function" ? (thunk as (d: unknown, g: () => unknown) => unknown)(null, () => ({})) : thunk,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(undefined),
}));
jest.mock("../../../context/sources/scopes", () => ({
  ...jest.requireActual("../../../context/sources/scopes"),
  ...(() => ({
  selectScopeSelectionsContext: () => ({}),
}))(),
}));
jest.mock(
  "../../redux/execution-system/conversations/conversations.selectors",
  () => ({
    selectConversationScopeIds: () => () => ({ organizationId: undefined }),
  }),
);

const PREVIEW_FIELDS = {
  context: { user: { id: "u1" } },
  context_withheld: ["route_brief", "conversation"],
  page_context: { mode: "own", withheld: ["route_brief", "conversation"] },
  surface: "matrx-user/agent-comparison-model",
};
jest.mock("../../redux/execution-system/context-rules/request-context", () => ({
  // The door: the hook must send exactly what it builds for the conversation.
  buildPreviewRequestContext: () => PREVIEW_FIELDS,
  pageContextFor: () => PREVIEW_FIELDS.page_context,
  selectResolvedContextRows: () => () => [],
}));

import { callApi } from "../../../host/server/call-api";
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

  it("sends the conversation's context, withheld keys and page rule from the one door", async () => {
    door.mockResolvedValue({ data: { receipt: null } });
    const view = await mountHook();
    const req = door.mock.calls[0]?.[0] as { body?: Record<string, unknown> };
    expect(req.body).toMatchObject(PREVIEW_FIELDS);
    await view.unmount();
  });

  it("opens a value through the same request as the preview, plus the view (RULES.md §5b)", async () => {
    door.mockResolvedValue({ data: { receipt: null } });
    const view = await mountHook();
    const viewed = {
      kind: "on_request",
      key: "route_brief",
      text: "Agent comparison: three columns.",
      chars: 32,
      sha256: "ab",
      source: "preview",
    };
    door.mockResolvedValueOnce({ data: { viewed } });
    const loadView = view.state().loadView;
    expect(loadView).toBeDefined();
    await expect(loadView!({ kind: "on_request", key: "route_brief" })).resolves.toEqual(viewed);
    const preview = door.mock.calls[0]?.[0] as { body?: Record<string, unknown> };
    const opened = door.mock.calls.at(-1)?.[0] as { body?: Record<string, unknown> };
    const { view: target, ...rest } = opened.body ?? {};
    expect(target).toEqual({ kind: "on_request", key: "route_brief" });
    expect(rest).toEqual(preview.body);
    await view.unmount();
  });

  it("a view the next turn does not send is refused in words", async () => {
    door.mockResolvedValue({ data: { receipt: null } });
    const view = await mountHook();
    door.mockResolvedValueOnce({
      error: { type: "http_error", message: "The next turn sends no on_request for 'x'.", status: 404 },
    });
    await expect(view.state().loadView!({ kind: "on_request", key: "x" })).rejects.toThrow(
      "The next turn sends no on_request for 'x'.",
    );
    await view.unmount();
  });
});
