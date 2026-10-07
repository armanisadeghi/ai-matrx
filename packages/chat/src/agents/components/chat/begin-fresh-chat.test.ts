// f60ec1dced: every launcher that resolves chat.default_new_chat asks for an
// organization first, so beginFreshChat resolves through `resolveMandateAsking`
// (never `resolveMandate` directly). The guest boundary is asserted on that door.
jest.mock("../../../mandates/resolve-asking", () => ({
  resolveMandateAsking: jest.fn(),
}));

import { resolveMandateAsking } from "../../../mandates/resolve-asking";
import type { ChatRootState } from "../../../store/root-state";
import {
  beginFreshChat,
  interceptChatAgentLink,
  parseChatPath,
  stageChatAgentSwitch,
} from "./begin-fresh-chat";

const resolveMandateMock = jest.mocked(resolveMandateAsking);

describe("parseChatPath", () => {
  it("does not interpret chat utility routes as conversation ids", () => {
    expect(parseChatPath("/chat/message-templates")).toEqual({
      activeConversationId: null,
      activeAgentId: undefined,
    });
    expect(parseChatPath("/chat/voice")).toEqual({
      activeConversationId: null,
      activeAgentId: undefined,
    });
  });

  it("still resolves conversation and direct-agent routes", () => {
    expect(parseChatPath("/chat/conversation-id")).toEqual({
      activeConversationId: "conversation-id",
      activeAgentId: undefined,
    });
    expect(parseChatPath("/chat/a/agent-id")).toEqual({
      activeConversationId: null,
      activeAgentId: "agent-id",
    });
  });
});

describe("stageChatAgentSwitch", () => {
  it("stages the exact visible chat before navigation", () => {
    const dispatch = jest.fn();
    const push = jest.fn();

    stageChatAgentSwitch({
      dispatch: dispatch as never,
      router: { push } as never,
      getState: () =>
        ({
          conversationFocus: {
            lastSurfaceKey: "chat:unrelated-agent",
            bySurface: {
              "chat:unrelated-agent": {
                input: "unrelated-conversation",
                display: "unrelated-conversation",
              },
            },
          },
        }) as unknown as ChatRootState,
      sourceConversationId: "visible-conversation",
      targetAgentId: "next-agent",
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          sourceConversationId: "visible-conversation",
          targetAgentId: "next-agent",
        },
      }),
    );
    expect(push).toHaveBeenCalledWith("/chat/a/next-agent");
  });

  it("uses the current agent surface instead of another mounted conversation", () => {
    const dispatch = jest.fn();

    stageChatAgentSwitch({
      dispatch: dispatch as never,
      router: { push: jest.fn() } as never,
      getState: () =>
        ({
          conversationFocus: {
            lastSurfaceKey: "agent-runner:other",
            bySurface: {
              "chat:current-agent": {
                input: "current-input",
                display: "current-display",
              },
              "chat:other-agent": {
                input: "wrong-input",
                display: "wrong-display",
              },
            },
          },
        }) as unknown as ChatRootState,
      sourceAgentId: "current-agent",
      targetAgentId: "next-agent",
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          sourceConversationId: "current-input",
          targetAgentId: "next-agent",
        },
      }),
    );
  });

  it("intercepts the picker detail-card chat link but leaves modifier clicks native", () => {
    const dispatch = jest.fn();
    const push = jest.fn();
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "/chat/a/detail-agent");
    const icon = document.createElement("span");
    anchor.appendChild(icon);
    const event = {
      target: icon,
      button: 0,
      defaultPrevented: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };

    interceptChatAgentLink(event as never, {
      dispatch: dispatch as never,
      router: { push } as never,
      getState: () =>
        ({
          conversationFocus: { lastSurfaceKey: null, bySurface: {} },
        }) as unknown as ChatRootState,
      sourceConversationId: "visible-conversation",
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          sourceConversationId: "visible-conversation",
          targetAgentId: "detail-agent",
        },
      }),
    );
    expect(push).toHaveBeenCalledWith("/chat/a/detail-agent");

    event.metaKey = true;
    event.preventDefault.mockClear();
    event.stopPropagation.mockClear();
    interceptChatAgentLink(event as never, {
      dispatch: dispatch as never,
      router: { push } as never,
      getState: () => ({}) as ChatRootState,
    });
    expect(event.preventDefault).not.toHaveBeenCalled();

    event.metaKey = false;
    event.shiftKey = true;
    interceptChatAgentLink(event as never, {
      dispatch: dispatch as never,
      router: { push } as never,
      getState: () => ({}) as ChatRootState,
    });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });
});

describe("beginFreshChat guest boundary", () => {
  beforeEach(() => {
    resolveMandateMock.mockReset();
  });

  it("does not resolve an organization-scoped mandate for a guest on an agent route", async () => {
    const dispatch = jest.fn();
    const push = jest.fn();

    await beginFreshChat({
      dispatch,
      router: { push } as never,
      pathname: "/chat/a/guest-agent",
      getState: () =>
        ({
          // A server-minted anonymous guest has an auth UUID. Checking only
          // `id === null` regresses the organization-admission failure.
          userAuth: { id: "guest-auth-user", isAnonymous: true },
        }) as ChatRootState,
    });

    expect(resolveMandateMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/chat/a/guest-agent");
  });

  it("does not resolve the mandate from a guest conversation route with no live agent", async () => {
    const dispatch = jest.fn();
    const push = jest.fn();

    await beginFreshChat({
      dispatch,
      router: { push } as never,
      pathname: "/chat/6ffbb619-514f-460a-863e-fb16d89943bd",
      getState: () =>
        ({
          userAuth: { id: "guest-auth-user", isAnonymous: true },
          conversations: { byConversationId: {} },
        }) as ChatRootState,
    });

    expect(resolveMandateMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/chat/new");
  });

  it("resolves the mandate for an authenticated user and routes its default agent to /chat/new", async () => {
    const dispatch = jest.fn();
    const push = jest.fn();
    resolveMandateMock.mockResolvedValue({ agentId: "default-agent" } as never);

    await beginFreshChat({
      dispatch,
      router: { push } as never,
      pathname: "/chat/a/default-agent",
      getState: () =>
        ({
          userAuth: { id: "authenticated-user", isAnonymous: false },
        }) as ChatRootState,
    });

    expect(resolveMandateMock).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/chat/new");
  });
});

describe("beginFreshChat never waits forever on the default-agent lookup", () => {
  beforeEach(() => {
    resolveMandateMock.mockReset();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // THE CLASS: "New chat does nothing while a run is streaming". The default
  // agent lookup is cached for 5 minutes; a long run outlives the cache, so the
  // click re-fetched it and the navigation hung behind a stalled request with
  // no feedback. The lookup only decides `/chat/new` vs `/chat/a/<agent>` —
  // it must never gate the navigation.
  it("navigates to the route's own agent when the lookup stalls", async () => {
    const dispatch = jest.fn();
    const push = jest.fn();
    resolveMandateMock.mockReturnValue(new Promise(() => {}) as never);

    const done = beginFreshChat({
      dispatch,
      router: { push } as never,
      pathname: "/chat/a/route-agent",
      getState: () =>
        ({
          userAuth: { id: "authenticated-user", isAnonymous: false },
        }) as ChatRootState,
    });
    await jest.advanceTimersByTimeAsync(5000);
    await done;

    expect(push).toHaveBeenCalledWith("/chat/a/route-agent");
  });

  it("falls back to /chat/new, which resolves the default itself, when nothing is known", async () => {
    const dispatch = jest.fn();
    const push = jest.fn();
    resolveMandateMock.mockReturnValue(new Promise(() => {}) as never);

    const done = beginFreshChat({
      dispatch,
      router: { push } as never,
      pathname: "/chat/6ffbb619-514f-460a-863e-fb16d89943bd",
      getState: () =>
        ({
          userAuth: { id: "authenticated-user", isAnonymous: false },
          conversations: { byConversationId: {} },
        }) as ChatRootState,
    });
    await jest.advanceTimersByTimeAsync(5000);
    await done;

    expect(push).toHaveBeenCalledWith("/chat/new");
  });
});
