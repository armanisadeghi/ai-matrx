import {
  SHELL_CHAT_SURFACE_KEY,
  shellChatDomainPanelAction,
  shellChatFamily,
  shellChatHome,
  shellChatHostedElsewhere,
  shellChatWorkspaceId,
} from "../shell-chat-route";

describe("the shell chat's routes", () => {
  it("remembers open or closed per page family", () => {
    expect(shellChatFamily("/marketing/brands/b1")).toBe("marketing");
    expect(shellChatFamily("/notes")).toBe("notes");
    expect(shellChatFamily("/")).toBe("home");
    expect(shellChatWorkspaceId("notes")).toBe("page:notes");
  });

  // ONE chat (2026-10-05): the Board and Education show the shell chat; only
  // the full chat and the code workspace (its own coding agent) stand it aside.
  it("stands aside only on the full chat and the code workspace", () => {
    expect(shellChatHostedElsewhere("/chat/abc")).toBe(true);
    expect(shellChatHostedElsewhere("/chat")).toBe(true);
    expect(shellChatHostedElsewhere("/code")).toBe(true);
    expect(shellChatHostedElsewhere("/agent-apps/a1/code")).toBe(true);
    expect(shellChatHostedElsewhere("/board/b1")).toBe(false);
    expect(shellChatHostedElsewhere("/board")).toBe(false);
    expect(shellChatHostedElsewhere("/education")).toBe(false);
    expect(shellChatHostedElsewhere("/education/flashcards")).toBe(false);
    expect(shellChatHostedElsewhere("/marketing")).toBe(false);
    expect(shellChatHostedElsewhere("/notes")).toBe(false);
  });

  // The ids, params and defaults are the ones the Board and Education used
  // when they drew their own chat: a person's cookies and conversation carry over.
  it("gives each board its own conversation and remembered layout, open by default", () => {
    expect(shellChatHome("/board/b1", true)).toEqual({
      layoutId: "board-b1",
      surfaceKey: "canvas-workspace:board-b1",
      addressParam: "chat",
      defaultOpen: true,
    });
    // /board is the boards list and /board/all its old address: ordinary pages.
    expect(shellChatHome("/board", true).surfaceKey).toBe(SHELL_CHAT_SURFACE_KEY);
    expect(shellChatHome("/board/all", true).surfaceKey).toBe(SHELL_CHAT_SURFACE_KEY);
  });

  it("gives signed-in Education one conversation, closed by default", () => {
    const home = {
      layoutId: "education",
      surfaceKey: "canvas-workspace:education",
      addressParam: "chat",
      defaultOpen: false,
    };
    expect(shellChatHome("/education", true)).toEqual(home);
    expect(shellChatHome("/education/flashcards/x", true)).toEqual(home);
  });

  it("shares one conversation everywhere else, remembered open or closed per family", () => {
    expect(shellChatHome("/notes/n1", true)).toEqual({
      layoutId: "page:notes",
      surfaceKey: SHELL_CHAT_SURFACE_KEY,
      addressParam: "pageChat",
      defaultOpen: null,
    });
    expect(shellChatHome("/tasks", true).surfaceKey).toBe(SHELL_CHAT_SURFACE_KEY);
  });

  it("keeps the chat closed by default on /spaces only, still the shared conversation", () => {
    for (const path of ["/spaces", "/spaces/abc", "/spaces/abc/page-1"]) {
      expect(shellChatHome(path, true)).toEqual({
        layoutId: "page:spaces",
        surfaceKey: SHELL_CHAT_SURFACE_KEY,
        addressParam: "pageChat",
        defaultOpen: false,
      });
    }
    expect(shellChatHome("/spacesship", true).defaultOpen).toBeNull();
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
