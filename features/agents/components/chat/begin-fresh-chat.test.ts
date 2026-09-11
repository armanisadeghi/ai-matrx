jest.mock("@/features/mandates/service", () => ({
  resolveMandate: jest.fn(),
}));

import { resolveMandate } from "@/features/mandates/service";
import type { RootState } from "@/lib/redux/store";
import {
  beginFreshChat,
  parseChatPath,
} from "./begin-fresh-chat";

const resolveMandateMock = jest.mocked(resolveMandate);

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
        ({ userAuth: { id: null } }) as RootState,
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
          userAuth: { id: null },
          conversations: { byConversationId: {} },
        }) as RootState,
    });

    expect(resolveMandateMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/chat/new");
  });
});
