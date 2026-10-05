import { shellChatDomainPanelAction, shellChatFamily, shellChatHostedElsewhere, shellChatWorkspaceId } from "../shell-chat-route";

describe("the shell chat's routes", () => {
  it("remembers open or closed per page family", () => {
    expect(shellChatFamily("/marketing/brands/b1")).toBe("marketing");
    expect(shellChatFamily("/notes")).toBe("notes");
    expect(shellChatFamily("/")).toBe("home");
    expect(shellChatWorkspaceId("notes")).toBe("page:notes");
  });

  it("stands aside where the page hosts its own chat, and on the full chat", () => {
    expect(shellChatHostedElsewhere("/chat/abc", true)).toBe(true);
    expect(shellChatHostedElsewhere("/board/b1", true)).toBe(true);
    // /board is the boards list, an ordinary page: the shell's chat dock stays.
    expect(shellChatHostedElsewhere("/board", true)).toBe(false);
    expect(shellChatHostedElsewhere("/education", true)).toBe(true);
    expect(shellChatHostedElsewhere("/code", true)).toBe(true);
    expect(shellChatHostedElsewhere("/marketing", true)).toBe(false);
    expect(shellChatHostedElsewhere("/notes", true)).toBe(false);
  });

  // Between 1440 and 1599px the chat opens by default; folding the domain
  // panel for that default landed /user-settings with no menu.
  it("folds a domain panel only beside a chat the person opened", () => {
    expect(shellChatDomainPanelAction({ open: true, choice: null, narrow: true })).toBe("leave");
    expect(shellChatDomainPanelAction({ open: true, choice: true, narrow: true })).toBe("fold");
    expect(shellChatDomainPanelAction({ open: true, choice: true, narrow: false })).toBe("leave");
    expect(shellChatDomainPanelAction({ open: false, choice: false, narrow: true })).toBe("restore");
    expect(shellChatDomainPanelAction({ open: false, choice: null, narrow: true })).toBe("restore");
  });
});
