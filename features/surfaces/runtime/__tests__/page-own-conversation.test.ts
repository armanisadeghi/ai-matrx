import {
  isPageOwnConversation,
  registerSurfaceRuntime,
} from "../SurfaceRuntimeContext";

describe("isPageOwnConversation — a page's own conversation never sees the page", () => {
  it("matches a page's single own conversation, and nothing else", () => {
    let own: string | null = "conv-main";
    const off = registerSurfaceRuntime({
      surfaceName: "matrx-user/test-chat",
      getScope: () => ({}),
      getOwnConversationId: () => own,
    });
    expect(isPageOwnConversation("conv-main")).toBe(true);
    // An agent opened over the page (a window) is NOT the page.
    expect(isPageOwnConversation("conv-window")).toBe(false);
    // Read live: the page switching conversations moves the line with it.
    own = "conv-next";
    expect(isPageOwnConversation("conv-main")).toBe(false);
    expect(isPageOwnConversation("conv-next")).toBe(true);
    off();
    expect(isPageOwnConversation("conv-next")).toBe(false);
  });

  it("matches any of a page's several conversations (battle lanes)", () => {
    const lanes = new Set(["lane-a", "lane-b"]);
    const off = registerSurfaceRuntime({
      surfaceName: "matrx-user/test-battle",
      getScope: () => ({}),
      isOwnConversation: (id) => lanes.has(id),
    });
    expect(isPageOwnConversation("lane-b")).toBe(true);
    expect(isPageOwnConversation("outside-agent")).toBe(false);
    expect(isPageOwnConversation(null)).toBe(false);
    off();
  });
});
