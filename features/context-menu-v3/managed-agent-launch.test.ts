import { MANAGED_CONTEXT_MENU_AGENT_CONFIG } from "./managed-agent-launch";

describe("managed context-menu agent launch", () => {
  it("uses the WindowPanel presentation without forcing auto-run", () => {
    expect(MANAGED_CONTEXT_MENU_AGENT_CONFIG).toEqual({
      displayMode: "flexible-panel",
      allowChat: true,
      showVariablePanel: true,
    });
    expect("autoRun" in MANAGED_CONTEXT_MENU_AGENT_CONFIG).toBe(false);
  });
});
