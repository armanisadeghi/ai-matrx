import {
  isChatRoutePath,
  resolveContinueInChatConversationId,
} from "./continue-in-chat";

describe("continue in chat mode", () => {
  it.each([
    "/chat",
    "/chat/new",
    "/chat/conversation-id",
    "/chat/a/agent-id",
    "/chat/voice",
  ])("recognizes %s as a chat route", (pathname) => {
    expect(isChatRoutePath(pathname)).toBe(true);
  });

  it.each([null, "/agents/id/build", "/agents/id/run", "/chatty"])(
    "does not treat %s as a chat route",
    (pathname) => {
      expect(isChatRoutePath(pathname)).toBe(false);
    },
  );

  it("prefers the durable wire conversation id for Builder manual turns", () => {
    expect(
      resolveContinueInChatConversationId("local-builder-key", "wire-id"),
    ).toBe("wire-id");
  });

  it("uses the surface conversation id when no separate wire id exists", () => {
    expect(resolveContinueInChatConversationId("conversation-id", null)).toBe(
      "conversation-id",
    );
  });
});
