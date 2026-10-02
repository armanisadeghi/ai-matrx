import { shellChatFamily, shellChatHostedElsewhere, shellChatWorkspaceId } from "../shell-chat-route";

describe("the shell chat's routes", () => {
  it("remembers open or closed per page family", () => {
    expect(shellChatFamily("/marketing/brands/b1")).toBe("marketing");
    expect(shellChatFamily("/notes")).toBe("notes");
    expect(shellChatFamily("/")).toBe("home");
    expect(shellChatWorkspaceId("notes")).toBe("page:notes");
  });

  it("stands aside where the page hosts its own chat, and on the full chat", () => {
    expect(shellChatHostedElsewhere("/chat/abc", true)).toBe(true);
    expect(shellChatHostedElsewhere("/board", true)).toBe(true);
    expect(shellChatHostedElsewhere("/education", true)).toBe(true);
    expect(shellChatHostedElsewhere("/marketing", true)).toBe(false);
    expect(shellChatHostedElsewhere("/notes", true)).toBe(false);
  });
});
